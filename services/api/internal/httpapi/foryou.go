package httpapi

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"time"

	"github.com/Iwetan77/Igloo/services/api/internal/rank"
)

// forYouCursor pins a ranked session: the ranking is computed as of At with
// jitter Seed, so later pages continue the same order even though the
// viewer's own views keep changing the underlying signals.
type forYouCursor struct {
	Offset int    `json:"o"`
	At     int64  `json:"t"` // unix nanoseconds
	Seed   string `json:"s"`
}

func (c forYouCursor) encode() string {
	b, _ := json.Marshal(c)
	return base64.RawURLEncoding.EncodeToString(b)
}

func decodeForYouCursor(s string) (forYouCursor, bool) {
	var c forYouCursor
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil || json.Unmarshal(b, &c) != nil || c.Offset < 0 || c.At <= 0 || c.Seed == "" {
		return c, false
	}
	return c, true
}

// forYou ranks recent posts for the viewer (see package rank) and serves one page.
func (s *Server) forYou(w http.ResponseWriter, r *http.Request, viewerID string, limit int) {
	cur := forYouCursor{At: time.Now().UnixNano()}
	if v := r.URL.Query().Get("cursor"); v != "" {
		c, ok := decodeForYouCursor(v)
		if !ok {
			writeError(w, http.StatusBadRequest, "INVALID_CURSOR", "cursor is malformed")
			return
		}
		cur = c
	} else {
		b := make([]byte, 8)
		_, _ = rand.Read(b)
		cur.Seed = hex.EncodeToString(b)
	}

	cands, err := s.store.ForYouCandidates(r.Context(), viewerID, time.Unix(0, cur.At), cur.Seed)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	order := rank.Default.Order(cands)
	start := min(cur.Offset, len(order))
	end := min(start+limit, len(order))
	rows, err := s.store.PostsByID(r.Context(), viewerID, order[start:end])
	if err != nil {
		s.internal(w, r, err)
		return
	}
	var next *string
	if end < len(order) {
		n := forYouCursor{Offset: end, At: cur.At, Seed: cur.Seed}.encode()
		next = &n
	}
	writeJSON(w, http.StatusOK, map[string]any{"posts": s.renderPosts(r.Context(), rows), "next_cursor": next})
}
