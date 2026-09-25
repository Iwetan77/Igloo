package httpapi

import (
	"context"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/Iwetan77/Igloo/services/api/internal/panta"
	"github.com/Iwetan77/Igloo/services/api/internal/store"
)

// Panta's catalog listing loops on the same page and leaves titles blank, so
// the Markets tab is served from markets_cache, which a background refresher
// fills from several filtered listings plus per-market detail calls.

// catalogFilters are the listing queries whose union covers the catalog.
var catalogFilters = []string{
	"", "phase=primary", "phase=secondary", "status=primary",
	"category=sports", "category=crypto", "category=politics", "category=entertainment",
	"category=finance", "category=science", "category=world", "category=other",
}

const (
	catalogInterval  = 15 * time.Minute
	catalogMaxPages  = 10
	catalogCallSpace = 550 * time.Millisecond // ~109 calls/min, under Panta's 120 reads/min
	catalogParallel  = 3                      // detail calls in flight at once
)

// RunCatalogRefresh refreshes markets_cache now and then every
// catalogInterval until ctx is done.
func (s *Server) RunCatalogRefresh(ctx context.Context) {
	for {
		s.refreshCatalog(ctx, 0)
		select {
		case <-ctx.Done():
			return
		case <-time.After(catalogInterval):
		}
	}
}

type catalogResult struct {
	Discovered int    `json:"discovered"`
	Refreshed  int    `json:"refreshed"`
	Failed     int    `json:"failed"`
	Complete   bool   `json:"complete"` // every known market was refreshed this run
	Took       string `json:"took"`
}

// refreshCatalog discovers market ids from Panta's listings and refreshes
// their details into markets_cache: markets never seen before first, then
// the least recently refreshed. budget > 0 stops the run once it's used up
// (serverless requests have a time limit), so repeated runs cover everything.
func (s *Server) refreshCatalog(ctx context.Context, budget time.Duration) (res catalogResult) {
	start := time.Now()
	discoverCtx := ctx
	if budget > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, budget)
		defer cancel()
		// Discovery gets at most 40% of a budgeted run, so every run also
		// refreshes a solid batch of market details.
		var cancelDiscover context.CancelFunc
		discoverCtx, cancelDiscover = context.WithTimeout(ctx, budget*2/5)
		defer cancelDiscover()
	} else {
		discoverCtx = ctx
	}
	tick := time.NewTicker(catalogCallSpace)
	defer tick.Stop()
	waitIn := func(c context.Context) bool {
		select {
		case <-c.Done():
			return false
		case <-tick.C:
			return true
		}
	}
	defer func() {
		res.Took = time.Since(start).Round(time.Second).String()
		s.log.Info("catalog refreshed", "discovered", res.Discovered, "refreshed", res.Refreshed,
			"failed", res.Failed, "complete", res.Complete, "took", res.Took)
	}()

	// Discovery: union of listing queries (Panta's cursor loops, so stop at
	// the first page that adds nothing new).
	found := map[string]bool{}
discover:
	for _, f := range catalogFilters {
		cursor := ""
		for page := 0; page < catalogMaxPages; page++ {
			if !waitIn(discoverCtx) {
				break discover
			}
			got, next, err := s.panta.ListMarketIDs(discoverCtx, f, cursor)
			if err != nil {
				s.log.Warn("catalog list", "filter", f, "err", err)
				break
			}
			added := 0
			for _, id := range got {
				if !found[id] {
					found[id] = true
					added++
				}
			}
			if next == "" || added == 0 {
				break
			}
			cursor = next
		}
	}
	res.Discovered = len(found)

	// Refresh order: new markets, then posted-on and cached ones, stalest first.
	cached, err := s.store.StaleMarketIDs(context.WithoutCancel(ctx))
	if err != nil {
		s.log.Warn("catalog cached markets", "err", err)
	}
	posted, err := s.store.PostedMarketIDs(context.WithoutCancel(ctx))
	if err != nil {
		s.log.Warn("catalog posted markets", "err", err)
	}
	known := map[string]bool{}
	for _, id := range cached {
		known[id] = true
	}
	var order []string
	queued := map[string]bool{}
	add := func(id string) {
		if !queued[id] {
			queued[id] = true
			order = append(order, id)
		}
	}
	for id := range found {
		if !known[id] {
			add(id)
		}
	}
	for _, id := range posted {
		if !known[id] {
			add(id)
		}
	}
	for _, id := range cached {
		add(id)
	}

	// Details: one call started per tick, up to catalogParallel in flight.
	var mu sync.Mutex
	var wg sync.WaitGroup
	slots := make(chan struct{}, catalogParallel)
	complete := true
	for _, id := range order {
		if !waitIn(ctx) {
			complete = false
			break
		}
		select {
		case slots <- struct{}{}:
		case <-ctx.Done():
			complete = false
		}
		if !complete {
			break
		}
		wg.Add(1)
		go func() {
			defer func() { <-slots; wg.Done() }()
			ok := false
			if m, err := s.panta.GetMarket(ctx, id); err == nil {
				if err := upsertFromPanta(context.WithoutCancel(ctx), s.store, m); err != nil {
					s.log.Warn("catalog upsert", "market", id, "err", err)
				} else {
					ok = true
				}
			}
			mu.Lock()
			if ok {
				res.Refreshed++
			} else {
				res.Failed++
			}
			mu.Unlock()
		}()
	}
	wg.Wait()
	res.Complete = complete
	return res
}

// catalogRequestBudget keeps a refresh request inside serverless time limits.
const catalogRequestBudget = 50 * time.Second

// refreshCatalogRoute runs one budgeted refresh for a scheduler (Vercel Cron
// or a GitHub Action). It requires Authorization: Bearer $CRON_SECRET and is
// disabled when CRON_SECRET is unset.
func (s *Server) refreshCatalogRoute(w http.ResponseWriter, r *http.Request) {
	if s.cronSecret == "" {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "")
		return
	}
	token, ok := bearer(r)
	if !ok || subtle.ConstantTimeCompare([]byte(token), []byte(s.cronSecret)) != 1 {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "")
		return
	}
	writeJSON(w, http.StatusOK, s.refreshCatalog(r.Context(), catalogRequestBudget))
}

type marketOut struct {
	PantaMarketID string     `json:"panta_market_id"`
	Question      *string    `json:"question"`
	Category      *string    `json:"category"`
	Phase         *string    `json:"phase"`
	YesPrice      *float64   `json:"yes_price"`
	NoPrice       *float64   `json:"no_price"`
	ImageURL      *string    `json:"image_url"`
	EndTime       *time.Time `json:"end_time"`
	PostCount     int        `json:"post_count"`
}

func toMarketOut(m store.CachedMarket) marketOut {
	return marketOut{m.ID, m.Question, m.Category, m.Phase, m.YesPrice, m.NoPrice, m.ImageURL, m.EndTime, m.PostCount}
}

func (s *Server) listMarkets(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	category := q.Get("category")
	if category != "" && !categorySlug.MatchString(category) {
		writeError(w, http.StatusBadRequest, "INVALID_CATEGORY", "")
		return
	}
	limit, ok := parseLimit(w, q.Get("limit"))
	if !ok {
		return
	}
	offset := 0
	if v := q.Get("cursor"); v != "" {
		b, err := base64.RawURLEncoding.DecodeString(v)
		n, err2 := strconv.Atoi(string(b))
		if err != nil || err2 != nil || n < 0 {
			writeError(w, http.StatusBadRequest, "INVALID_CURSOR", "cursor is malformed")
			return
		}
		offset = n
	}
	ms, err := s.store.ListMarkets(r.Context(), category, offset, limit+1)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	var next *string
	if len(ms) > limit {
		ms = ms[:limit]
		n := base64.RawURLEncoding.EncodeToString([]byte(strconv.Itoa(offset + limit)))
		next = &n
	}
	out := make([]marketOut, 0, len(ms))
	for _, m := range ms {
		out = append(out, toMarketOut(m))
	}
	writeJSON(w, http.StatusOK, map[string]any{"markets": out, "next_cursor": next})
}

// marketDetailFresh is how long a cached row is served without a live refresh.
const marketDetailFresh = time.Minute

func (s *Server) marketDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	cached, err := s.store.CachedMarketByID(r.Context(), id)
	haveCache := err == nil
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		s.internal(w, r, err)
		return
	}
	if !haveCache || time.Since(cached.UpdatedAt) > marketDetailFresh {
		m, perr := s.panta.GetMarket(r.Context(), id)
		switch {
		case perr == nil:
			if err := upsertFromPanta(r.Context(), s.store, m); err != nil {
				s.internal(w, r, err)
				return
			}
			if cached, err = s.store.CachedMarketByID(r.Context(), id); err != nil {
				s.internal(w, r, err)
				return
			}
		case panta.IsCode(perr, "MARKET_NOT_FOUND") || !haveCache:
			s.pantaError(w, r, perr)
			return
		default:
			// Panta hiccup: serve the last known values.
			s.log.Warn("market detail refresh", "market", id, "err", perr)
		}
	}
	writeJSON(w, http.StatusOK, toMarketOut(cached))
}
