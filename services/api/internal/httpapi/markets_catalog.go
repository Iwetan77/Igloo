package httpapi

import (
	"context"
	"encoding/base64"
	"errors"
	"net/http"
	"strconv"
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
	catalogCallSpace = 700 * time.Millisecond // stays well under Panta's 120 reads/min
)

// RunCatalogRefresh refreshes markets_cache now and then every
// catalogInterval until ctx is done.
func (s *Server) RunCatalogRefresh(ctx context.Context) {
	for {
		s.refreshCatalog(ctx)
		select {
		case <-ctx.Done():
			return
		case <-time.After(catalogInterval):
		}
	}
}

func (s *Server) refreshCatalog(ctx context.Context) {
	start := time.Now()
	ids := map[string]bool{}
	tick := time.NewTicker(catalogCallSpace)
	defer tick.Stop()
	wait := func() bool {
		select {
		case <-ctx.Done():
			return false
		case <-tick.C:
			return true
		}
	}

	for _, f := range catalogFilters {
		cursor := ""
		for page := 0; page < catalogMaxPages; page++ {
			if !wait() {
				return
			}
			got, next, err := s.panta.ListMarketIDs(ctx, f, cursor)
			if err != nil {
				s.log.Warn("catalog list", "filter", f, "err", err)
				break
			}
			added := 0
			for _, id := range got {
				if !ids[id] {
					ids[id] = true
					added++
				}
			}
			if next == "" || added == 0 {
				break
			}
			cursor = next
		}
	}
	posted, err := s.store.PostedMarketIDs(ctx)
	if err != nil {
		s.log.Warn("catalog posted markets", "err", err)
	}
	for _, id := range posted {
		ids[id] = true
	}

	ok, failed := 0, 0
	for id := range ids {
		if !wait() {
			return
		}
		m, err := s.panta.GetMarket(ctx, id)
		if err != nil {
			failed++
			continue
		}
		if err := s.store.UpsertMarket(ctx, cachedFromPanta(m)); err != nil {
			s.log.Warn("catalog upsert", "market", id, "err", err)
			failed++
			continue
		}
		ok++
	}
	s.log.Info("catalog refreshed", "markets", ok, "failed", failed, "took", time.Since(start).Round(time.Second))
}

type marketOut struct {
	PantaMarketID string   `json:"panta_market_id"`
	Question      *string  `json:"question"`
	Category      *string  `json:"category"`
	Phase         *string  `json:"phase"`
	YesPrice      *float64 `json:"yes_price"`
	NoPrice       *float64 `json:"no_price"`
	ImageURL      *string  `json:"image_url"`
	PostCount     int      `json:"post_count"`
}

func toMarketOut(m store.CachedMarket) marketOut {
	return marketOut{m.ID, m.Question, m.Category, m.Phase, m.YesPrice, m.NoPrice, m.ImageURL, m.PostCount}
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
			if err := s.store.UpsertMarket(r.Context(), cachedFromPanta(m)); err != nil {
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
