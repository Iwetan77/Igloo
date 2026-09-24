package httpapi

import (
	"context"
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
	// This route doesn't require auth, but when a token is sent
	// it must belong to the user being synced.
	id, present, err := s.optionalPrivyID(r.Context(), r)
	if present && err != nil {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid or expired access token")
		return
	}
	if present && id != in.PrivyUserID {
		writeError(w, http.StatusForbidden, "FORBIDDEN", "token does not belong to privy_user_id")
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

type feedPost struct {
	ID            string     `json:"id"`
	PantaMarketID string     `json:"panta_market_id"`
	VideoURL      string     `json:"video_url"`
	Caption       *string    `json:"caption"`
	CreatedAt     time.Time  `json:"created_at"`
	Author        feedAuthor `json:"author"`
	Market        feedMarket `json:"market"`
	LikeCount     int        `json:"like_count"`
	CommentCount  int        `json:"comment_count"`
	ShareCount    int        `json:"share_count"`
	LikedByMe     bool       `json:"liked_by_me"`
}

const (
	defaultFeedLimit = 10
	maxFeedLimit     = 50
)

func (s *Server) feed(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit := defaultFeedLimit
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			writeError(w, http.StatusBadRequest, "INVALID_LIMIT", "limit must be a positive integer")
			return
		}
		limit = min(n, maxFeedLimit)
	}
	var cursor *store.Cursor
	if v := q.Get("cursor"); v != "" {
		c, err := store.DecodeCursor(v)
		if err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_CURSOR", "cursor is malformed")
			return
		}
		cursor = c
	}
	viewer, signedIn, handled := s.optionalUser(w, r)
	if handled {
		return
	}
	viewerID := ""
	if signedIn {
		viewerID = viewer.ID
	}

	rows, err := s.store.Feed(r.Context(), viewerID, cursor, limit+1)
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

	ids := make([]string, 0, len(rows))
	for _, p := range rows {
		ids = append(ids, p.PantaMarketID)
	}
	markets := s.markets.getMany(r.Context(), ids)

	posts := make([]feedPost, 0, len(rows))
	for _, p := range rows {
		fp := feedPost{
			ID: p.ID, PantaMarketID: p.PantaMarketID, VideoURL: p.VideoURL, Caption: p.Caption, CreatedAt: p.CreatedAt,
			Author:    feedAuthor{ID: p.Author.ID, DisplayName: p.Author.DisplayName, WalletAddress: p.Author.WalletAddress},
			LikeCount: p.LikeCount, CommentCount: p.CommentCount, ShareCount: p.ShareCount, LikedByMe: p.LikedByMe,
		}
		// A market Panta can't return right now leaves every market field null
		// rather than dropping the post from the feed.
		if m := markets[p.PantaMarketID]; m != nil {
			fp.Market = feedMarket{Question: nonEmpty(m.Question), YesPrice: m.YesPrice, NoPrice: m.NoPrice, Phase: nonEmpty(m.Phase), Category: nonEmpty(m.Category)}
		}
		posts = append(posts, fp)
	}
	writeJSON(w, http.StatusOK, map[string]any{"posts": posts, "next_cursor": next})
}

// marketCache keeps Panta market detail briefly so a feed page doesn't
// refetch the same market, and fans out fetches for distinct markets.
type marketCache struct {
	panta *panta.Client
	mu    sync.Mutex
	items map[string]cachedMarket
}

type cachedMarket struct {
	m       *panta.Market
	expires time.Time
}

const (
	marketTTL       = 20 * time.Second
	marketMissTTL   = 5 * time.Second
	marketFetchWait = 5 * time.Second
)

func newMarketCache(pc *panta.Client) *marketCache {
	return &marketCache{panta: pc, items: map[string]cachedMarket{}}
}

func (c *marketCache) getMany(ctx context.Context, ids []string) map[string]*panta.Market {
	out := map[string]*panta.Market{}
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
		out[id] = nil
		missing = append(missing, id)
	}
	c.mu.Unlock()

	ctx, cancel := context.WithTimeout(ctx, marketFetchWait)
	defer cancel()
	var wg sync.WaitGroup
	var mu sync.Mutex
	for _, id := range missing {
		wg.Add(1)
		go func() {
			defer wg.Done()
			m, err := c.panta.GetMarket(ctx, id)
			ttl := marketTTL
			if err != nil {
				m, ttl = nil, marketMissTTL
			}
			c.mu.Lock()
			c.items[id] = cachedMarket{m: m, expires: time.Now().Add(ttl)}
			c.mu.Unlock()
			mu.Lock()
			out[id] = m
			mu.Unlock()
		}()
	}
	wg.Wait()
	return out
}

// ---- posts ----

func (s *Server) createPost(w http.ResponseWriter, r *http.Request, u store.User) {
	var in struct {
		PantaMarketID string  `json:"panta_market_id"`
		VideoURL      string  `json:"video_url"`
		Caption       *string `json:"caption"`
	}
	if !decodeBody(w, r, &in) {
		return
	}
	if in.PantaMarketID == "" {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "panta_market_id is required")
		return
	}
	if pu, err := url.Parse(in.VideoURL); err != nil || (pu.Scheme != "http" && pu.Scheme != "https") || pu.Host == "" {
		writeError(w, http.StatusBadRequest, "INVALID_VIDEO_URL", "video_url must be an http(s) URL")
		return
	}
	if _, err := s.panta.GetMarket(r.Context(), in.PantaMarketID); err != nil {
		s.pantaError(w, r, err)
		return
	}
	p, err := s.store.CreatePost(r.Context(), u.ID, in.PantaMarketID, in.VideoURL, in.Caption)
	if err != nil {
		s.internal(w, r, err)
		return
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
	c, err := s.store.CreateComment(r.Context(), id, u.ID, body)
	if err != nil {
		s.internal(w, r, err)
		return
	}
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
