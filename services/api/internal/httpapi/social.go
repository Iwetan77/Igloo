package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Iwetan77/Igloo/services/api/internal/panta"
	"github.com/Iwetan77/Igloo/services/api/internal/store"
)

// ---- users ----

func (s *Server) syncUser(w http.ResponseWriter, r *http.Request) {
	var in struct {
		PrivyUserID   string  `json:"privy_user_id"`
		WalletAddress string  `json:"wallet_address"`
		DisplayName   *string `json:"display_name"`
	}
	if !decodeBody(w, r, &in) {
		return
	}
	if in.PrivyUserID == "" {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "privy_user_id is required")
		return
	}
	if !panta.ValidPubkey(in.WalletAddress) {
		writeError(w, http.StatusBadRequest, "INVALID_WALLET", "wallet_address must be a Solana public key")
		return
	}
	// Requires the user's own token, and the wallet must be one of the
	// Solana wallets Privy has linked to them; otherwise anyone who knew a
	// Privy id could rebind that user's wallet.
	token, ok := bearer(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing Authorization: Bearer <privy access token>")
		return
	}
	id, err := s.verifier.Verify(r.Context(), token)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid or expired access token")
		return
	}
	if id != in.PrivyUserID {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "token does not belong to privy_user_id")
		return
	}
	owns, err := s.wallets.OwnsSolanaWallet(r.Context(), in.PrivyUserID, in.WalletAddress)
	if err != nil {
		s.log.Error("privy wallet lookup", "err", err)
		writeError(w, http.StatusBadGateway, "PRIVY_UNAVAILABLE", "could not verify the wallet with Privy")
		return
	}
	if !owns {
		writeError(w, http.StatusForbidden, "WALLET_NOT_LINKED", "wallet_address is not a Solana wallet linked to this Privy user")
		return
	}
	if in.DisplayName != nil {
		trimmed := strings.TrimSpace(*in.DisplayName)
		in.DisplayName = &trimmed
		if trimmed == "" {
			in.DisplayName = nil
		}
	}
	u, err := s.store.UpsertUser(r.Context(), in.PrivyUserID, in.WalletAddress, in.DisplayName)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, u)
}

// ---- feed ----

type feedMarket struct {
	Question *string  `json:"question"`
	YesPrice *float64 `json:"yes_price"`
	NoPrice  *float64 `json:"no_price"`
	Phase    *string  `json:"phase"`
	Category *string  `json:"category"`
}

type feedAuthor struct {
	ID            string  `json:"id"`
	DisplayName   *string `json:"display_name"`
	WalletAddress string  `json:"wallet_address"`
}

type quotedPostOut struct {
	ID        string        `json:"id"`
	VideoURL  string        `json:"video_url"`
	Caption   *string       `json:"caption"`
	CreatedAt time.Time     `json:"created_at"`
	Author    commentAuthor `json:"author"`
}

type feedPost struct {
	ID            string         `json:"id"`
	PantaMarketID string         `json:"panta_market_id"`
	VideoURL      string         `json:"video_url"`
	Caption       *string        `json:"caption"`
	CreatedAt     time.Time      `json:"created_at"`
	Author        feedAuthor     `json:"author"`
	Market        feedMarket     `json:"market"`
	QuotedPost    *quotedPostOut `json:"quoted_post"`
	LikeCount     int            `json:"like_count"`
	CommentCount  int            `json:"comment_count"`
	ShareCount    int            `json:"share_count"`
	QuoteCount    int            `json:"quote_count"`
	LikedByMe     bool           `json:"liked_by_me"`
}

const (
	defaultFeedLimit = 10
	maxFeedLimit     = 50
)

// feed serves every feed:
//   - tab=for_you (default): ranked, see forYou
//   - tab=following: newest posts by people the viewer follows (auth)
//   - market_id=...: newest posts on one market (any tab)
func (s *Server) feed(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, ok := parseLimit(w, q.Get("limit"))
	if !ok {
		return
	}
	viewer, signedIn, handled := s.optionalUser(w, r)
	if handled {
		return
	}
	viewerID := ""
	if signedIn {
		viewerID = viewer.ID
	}
	marketID := q.Get("market_id")
	tab := q.Get("tab")
	switch {
	case marketID != "":
		s.chronoFeed(w, r, store.FeedQuery{ViewerID: viewerID, MarketID: marketID, Limit: limit})
	case tab == "following":
		if !signedIn {
			writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "sign in to see posts from people you follow")
			return
		}
		s.chronoFeed(w, r, store.FeedQuery{ViewerID: viewerID, FollowingOnly: true, Limit: limit})
	case tab == "" || tab == "for_you":
		s.forYou(w, r, viewerID, limit)
	default:
		writeError(w, http.StatusBadRequest, "INVALID_TAB", "tab must be for_you or following")
	}
}

func parseLimit(w http.ResponseWriter, v string) (int, bool) {
	if v == "" {
		return defaultFeedLimit, true
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 {
		writeError(w, http.StatusBadRequest, "INVALID_LIMIT", "limit must be a positive integer")
		return 0, false
	}
	return min(n, maxFeedLimit), true
}

// chronoFeed serves a newest-first page for q, reading the cursor param.
func (s *Server) chronoFeed(w http.ResponseWriter, r *http.Request, q store.FeedQuery) {
	if v := r.URL.Query().Get("cursor"); v != "" {
		c, err := store.DecodeCursor(v)
		if err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_CURSOR", "cursor is malformed")
			return
		}
		q.Cursor = c
	}
	limit := q.Limit
	q.Limit = limit + 1
	rows, err := s.store.Feed(r.Context(), q)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	var next *string
	if len(rows) > limit {
		rows = rows[:limit]
		last := rows[len(rows)-1]
		c := store.Cursor{CreatedAt: last.CreatedAt, ID: last.ID}.Encode()
		next = &c
	}
	writeJSON(w, http.StatusOK, map[string]any{"posts": s.renderPosts(r.Context(), rows), "next_cursor": next})
}

// renderPosts converts store rows to the API shape, attaching market data.
func (s *Server) renderPosts(ctx context.Context, rows []store.FeedPost) []feedPost {
	ids := make([]string, 0, len(rows))
	for _, p := range rows {
		ids = append(ids, p.PantaMarketID)
	}
	markets := s.markets.getMany(ctx, ids)
	posts := make([]feedPost, 0, len(rows))
	for _, p := range rows {
		fp := feedPost{
			ID: p.ID, PantaMarketID: p.PantaMarketID, VideoURL: p.VideoURL, Caption: p.Caption, CreatedAt: p.CreatedAt,
			Author:    feedAuthor{ID: p.Author.ID, DisplayName: p.Author.DisplayName, WalletAddress: p.Author.WalletAddress},
			LikeCount: p.LikeCount, CommentCount: p.CommentCount, ShareCount: p.ShareCount, QuoteCount: p.QuoteCount, LikedByMe: p.LikedByMe,
		}
		if q := p.Quoted; q != nil {
			fp.QuotedPost = &quotedPostOut{ID: q.ID, VideoURL: q.VideoURL, Caption: q.Caption, CreatedAt: q.CreatedAt,
				Author: commentAuthor{ID: q.Author.ID, DisplayName: q.Author.DisplayName}}
		}
		// A market with no data leaves every market field null rather than
		// dropping the post from the feed.
		if m, ok := markets[p.PantaMarketID]; ok {
			fp.Market = m
		}
		posts = append(posts, fp)
	}
	return posts
}

// marketCache keeps Panta market detail briefly so a feed page doesn't
// refetch the same market, and fans out fetches for distinct markets. Every
// live fetch is written through to markets_cache, and fields Panta leaves
// empty on a given call fall back to the last value it did return.
type marketCache struct {
	panta *panta.Client
	store *store.Store
	log   *slog.Logger
	mu    sync.Mutex
	items map[string]cachedMarket
}

type cachedMarket struct {
	m       feedMarket
	expires time.Time
}

const (
	marketTTL       = 20 * time.Second
	marketMissTTL   = 5 * time.Second
	marketFetchWait = 5 * time.Second
)

func newMarketCache(pc *panta.Client, st *store.Store, log *slog.Logger) *marketCache {
	return &marketCache{panta: pc, store: st, log: log, items: map[string]cachedMarket{}}
}

func (c *marketCache) getMany(ctx context.Context, ids []string) map[string]feedMarket {
	out := map[string]feedMarket{}
	var missing []string
	now := time.Now()
	c.mu.Lock()
	for _, id := range ids {
		if _, seen := out[id]; seen {
			continue
		}
		if it, ok := c.items[id]; ok && now.Before(it.expires) {
			out[id] = it.m
			continue
		}
		out[id] = feedMarket{}
		missing = append(missing, id)
	}
	c.mu.Unlock()
	if len(missing) == 0 {
		return out
	}

	fetchCtx, cancel := context.WithTimeout(ctx, marketFetchWait)
	defer cancel()
	live := make(map[string]*panta.Market, len(missing))
	var wg sync.WaitGroup
	var mu sync.Mutex
	for _, id := range missing {
		wg.Add(1)
		go func() {
			defer wg.Done()
			m, err := c.panta.GetMarket(fetchCtx, id)
			if err != nil {
				return
			}
			if err := c.store.UpsertMarket(fetchCtx, cachedFromPanta(m)); err != nil {
				c.log.Warn("markets_cache upsert", "market", id, "err", err)
			}
			mu.Lock()
			live[id] = m
			mu.Unlock()
		}()
	}
	wg.Wait()

	cached, err := c.store.CachedMarkets(ctx, missing)
	if err != nil {
		c.log.Warn("markets_cache read", "err", err)
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, id := range missing {
		fm := feedMarket{}
		if cm, ok := cached[id]; ok {
			fm = feedMarket{Question: cm.Question, YesPrice: cm.YesPrice, NoPrice: cm.NoPrice, Phase: cm.Phase, Category: cm.Category}
		}
		ttl := marketMissTTL
		if m := live[id]; m != nil {
			ttl = marketTTL
			// Live values win; the cache only fills what this call left empty.
			if q := nonEmpty(m.Question); q != nil {
				fm.Question = q
			}
			if m.YesPrice != nil {
				fm.YesPrice, fm.NoPrice = m.YesPrice, m.NoPrice
			}
			if p := nonEmpty(m.Phase); p != nil {
				fm.Phase = p
			}
			if cat := nonEmpty(correctCategory(m)); cat != nil {
				fm.Category = cat
			}
		}
		c.items[id] = cachedMarket{m: fm, expires: time.Now().Add(ttl)}
		out[id] = fm
	}
	return out
}

// cachedFromPanta maps a live market to a markets_cache row; empty strings
// become nulls so they never overwrite a previously known value.
func cachedFromPanta(m *panta.Market) store.CachedMarket {
	return store.CachedMarket{ID: m.ID, Question: nonEmpty(m.Question), Category: nonEmpty(correctCategory(m)),
		Phase: nonEmpty(m.Phase), YesPrice: m.YesPrice, NoPrice: m.NoPrice, ImageURL: nonEmpty(m.ImageURL)}
}

// ---- posts ----

func (s *Server) createPost(w http.ResponseWriter, r *http.Request, u store.User) {
	var in struct {
		PantaMarketID string  `json:"panta_market_id"`
		VideoURL      string  `json:"video_url"`
		Caption       *string `json:"caption"`
		// Set for a quote post; the quote inherits the original's market.
		QuotedPostID string `json:"quoted_post_id"`
	}
	if !decodeBody(w, r, &in) {
		return
	}
	if pu, err := url.Parse(in.VideoURL); err != nil || (pu.Scheme != "http" && pu.Scheme != "https") || pu.Host == "" {
		writeError(w, http.StatusBadRequest, "INVALID_VIDEO_URL", "video_url must be an http(s) URL")
		return
	}
	var quoted *string
	if in.QuotedPostID != "" {
		market := ""
		var err error
		if store.IsUUID(in.QuotedPostID) {
			market, err = s.store.PostMarket(r.Context(), in.QuotedPostID)
		} else {
			err = store.ErrNotFound
		}
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "QUOTED_POST_NOT_FOUND", "")
			return
		}
		if err != nil {
			s.internal(w, r, err)
			return
		}
		if in.PantaMarketID != "" && in.PantaMarketID != market {
			writeError(w, http.StatusBadRequest, "QUOTE_MARKET_MISMATCH", "a quote stays on the original post's market")
			return
		}
		// The original's market was checked against Panta when it was posted.
		in.PantaMarketID, quoted = market, &in.QuotedPostID
	} else {
		if in.PantaMarketID == "" {
			writeError(w, http.StatusBadRequest, "INVALID_BODY", "panta_market_id is required")
			return
		}
		if _, err := s.panta.GetMarket(r.Context(), in.PantaMarketID); err != nil {
			s.pantaError(w, r, err)
			return
		}
	}
	if !s.limit(w, "post", u.ID, postLimits) {
		return
	}
	p, err := s.store.CreatePost(r.Context(), u.ID, in.PantaMarketID, in.VideoURL, in.Caption, quoted)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	if quoted != nil {
		s.learn(r, u.ID, *quoted, store.SignalQuote)
	}
	writeJSON(w, http.StatusCreated, p)
}

// postID returns the {id} path value if it names an existing post, writing
// a 404 otherwise.
func (s *Server) postID(w http.ResponseWriter, r *http.Request) (string, bool) {
	id := r.PathValue("id")
	if !store.IsUUID(id) {
		writeError(w, http.StatusNotFound, "POST_NOT_FOUND", "")
		return "", false
	}
	ok, err := s.store.PostExists(r.Context(), id)
	if err != nil {
		s.internal(w, r, err)
		return "", false
	}
	if !ok {
		writeError(w, http.StatusNotFound, "POST_NOT_FOUND", "")
		return "", false
	}
	return id, true
}

type commentAuthor struct {
	ID          string  `json:"id"`
	DisplayName *string `json:"display_name"`
}

type commentOut struct {
	ID        string        `json:"id"`
	Body      string        `json:"body"`
	CreatedAt time.Time     `json:"created_at"`
	Author    commentAuthor `json:"author"`
}

func toCommentOut(c store.Comment) commentOut {
	return commentOut{ID: c.ID, Body: c.Body, CreatedAt: c.CreatedAt, Author: commentAuthor{ID: c.Author.ID, DisplayName: c.Author.DisplayName}}
}

func (s *Server) listComments(w http.ResponseWriter, r *http.Request) {
	id, ok := s.postID(w, r)
	if !ok {
		return
	}
	cs, err := s.store.ListComments(r.Context(), id)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	out := make([]commentOut, 0, len(cs))
	for _, c := range cs {
		out = append(out, toCommentOut(c))
	}
	writeJSON(w, http.StatusOK, map[string]any{"comments": out})
}

const maxCommentLen = 2000

func (s *Server) createComment(w http.ResponseWriter, r *http.Request, u store.User) {
	id, ok := s.postID(w, r)
	if !ok {
		return
	}
	var in struct {
		Body string `json:"body"`
	}
	if !decodeBody(w, r, &in) {
		return
	}
	body := strings.TrimSpace(in.Body)
	if body == "" || len([]rune(body)) > maxCommentLen {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "body must be 1-2000 characters")
		return
	}
	if !s.limit(w, "comment", u.ID, commentLimits) {
		return
	}
	c, err := s.store.CreateComment(r.Context(), id, u.ID, body)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	s.learn(r, u.ID, id, store.SignalComment)
	writeJSON(w, http.StatusCreated, toCommentOut(c))
}

func (s *Server) likePost(w http.ResponseWriter, r *http.Request, u store.User) {
	id, ok := s.postID(w, r)
	if !ok {
		return
	}
	liked, n, err := s.store.ToggleLike(r.Context(), id, u.ID)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	if liked {
		s.learn(r, u.ID, id, store.SignalLike)
	}
	writeJSON(w, http.StatusOK, map[string]any{"liked": liked, "like_count": n})
}

func (s *Server) sharePost(w http.ResponseWriter, r *http.Request, u store.User) {
	id, ok := s.postID(w, r)
	if !ok {
		return
	}
	n, err := s.store.AddShare(r.Context(), id, u.ID)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	s.learn(r, u.ID, id, store.SignalShare)
	writeJSON(w, http.StatusOK, map[string]any{"share_count": n})
}

// nonEmpty maps "" to nil: live Panta markets often have an empty title and
// description, and null is easier for the client to fall back on.
func nonEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
