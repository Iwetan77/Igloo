package httpapi

import (
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/Iwetan77/Igloo/services/api/internal/store"
)

// ---- me and interests ----

type meOut struct {
	store.User
	Onboarded      bool     `json:"onboarded"`
	Interests      []string `json:"interests"`
	FollowerCount  int      `json:"follower_count"`
	FollowingCount int      `json:"following_count"`
}

func (s *Server) me(w http.ResponseWriter, r *http.Request, u store.User) {
	m, err := s.store.Me(r.Context(), u.ID)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, meOut{m.User, m.Onboarded, m.Interests, m.FollowerCount, m.FollowingCount})
}

var categorySlug = regexp.MustCompile(`^[a-z][a-z0-9-]{0,31}$`)

const maxInterests = 20

func (s *Server) setInterests(w http.ResponseWriter, r *http.Request, u store.User) {
	var in struct {
		Categories []string `json:"categories"`
	}
	if !decodeBody(w, r, &in) {
		return
	}
	seen := map[string]bool{}
	cats := []string{}
	for _, c := range in.Categories {
		c = strings.ToLower(strings.TrimSpace(c))
		if !categorySlug.MatchString(c) {
			writeError(w, http.StatusBadRequest, "INVALID_CATEGORY", "categories must be slugs from categories.json")
			return
		}
		if !seen[c] {
			seen[c] = true
			cats = append(cats, c)
		}
	}
	if len(cats) == 0 || len(cats) > maxInterests {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "pick between 1 and 20 categories")
		return
	}
	if err := s.store.SetInterests(r.Context(), u.ID, cats); err != nil {
		s.internal(w, r, err)
		return
	}
	s.me(w, r, u)
}

// ---- profiles and follows ----

type profileOut struct {
	ID             string  `json:"id"`
	DisplayName    *string `json:"display_name"`
	WalletAddress  string  `json:"wallet_address"`
	FollowerCount  int     `json:"follower_count"`
	FollowingCount int     `json:"following_count"`
	PostCount      int     `json:"post_count"`
	IsFollowing    bool    `json:"is_following"`
	FollowsMe      bool    `json:"follows_me"`
	IsFriend       bool    `json:"is_friend"`
}

func toProfileOut(p store.Profile) profileOut {
	return profileOut{p.ID, p.DisplayName, p.WalletAddress, p.FollowerCount, p.FollowingCount, p.PostCount,
		p.IsFollowing, p.FollowsMe, p.IsFollowing && p.FollowsMe}
}

// viewerID resolves an optional signed-in viewer; handled means an error was written.
func (s *Server) viewerID(w http.ResponseWriter, r *http.Request) (string, bool) {
	u, ok, handled := s.optionalUser(w, r)
	if handled {
		return "", false
	}
	if ok {
		return u.ID, true
	}
	return "", true
}

func (s *Server) userProfile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	viewer, ok := s.viewerID(w, r)
	if !ok {
		return
	}
	if !store.IsUUID(id) {
		writeError(w, http.StatusNotFound, "USER_NOT_FOUND", "")
		return
	}
	p, err := s.store.Profile(r.Context(), viewer, id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "USER_NOT_FOUND", "")
		return
	}
	if err != nil {
		s.internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toProfileOut(p))
}

func (s *Server) userPosts(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	viewer, ok := s.viewerID(w, r)
	if !ok {
		return
	}
	limit, ok := parseLimit(w, r.URL.Query().Get("limit"))
	if !ok {
		return
	}
	if !store.IsUUID(id) {
		writeError(w, http.StatusNotFound, "USER_NOT_FOUND", "")
		return
	}
	s.chronoFeed(w, r, store.FeedQuery{ViewerID: viewer, AuthorID: id, Limit: limit})
}

func (s *Server) searchUsers(w http.ResponseWriter, r *http.Request) {
	viewer, ok := s.viewerID(w, r)
	if !ok {
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len([]rune(q)) < 2 || len(q) > 64 {
		writeError(w, http.StatusBadRequest, "INVALID_QUERY", "q must be 2-64 characters")
		return
	}
	users, err := s.store.SearchUsers(r.Context(), viewer, q, 20)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	out := make([]profileOut, 0, len(users))
	for _, p := range users {
		out = append(out, toProfileOut(p))
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": out})
}

var followLimits = []window{{30, time.Minute}, {500, 24 * time.Hour}}

func (s *Server) follow(w http.ResponseWriter, r *http.Request, u store.User) {
	s.setFollow(w, r, u, true)
}
func (s *Server) unfollow(w http.ResponseWriter, r *http.Request, u store.User) {
	s.setFollow(w, r, u, false)
}

func (s *Server) setFollow(w http.ResponseWriter, r *http.Request, u store.User, on bool) {
	id := r.PathValue("id")
	if id == u.ID {
		writeError(w, http.StatusBadRequest, "CANNOT_FOLLOW_SELF", "")
		return
	}
	exists := false
	if store.IsUUID(id) {
		var err error
		if exists, err = s.store.UserExists(r.Context(), id); err != nil {
			s.internal(w, r, err)
			return
		}
	}
	if !exists {
		writeError(w, http.StatusNotFound, "USER_NOT_FOUND", "")
		return
	}
	if !s.limit(w, "follow", u.ID, followLimits) {
		return
	}
	n, err := s.store.SetFollow(r.Context(), u.ID, id, on)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"following": on, "follower_count": n})
}

// ---- watch events ----

// Minimum watch time for a view to count as interest.
const interestWatch = 3 * time.Second

var viewLimits = []window{{300, time.Minute}}

func (s *Server) recordView(w http.ResponseWriter, r *http.Request, u store.User) {
	var in struct {
		PostID    string `json:"post_id"`
		WatchMS   int64  `json:"watch_ms"`
		Completed bool   `json:"completed"`
	}
	if !decodeBody(w, r, &in) {
		return
	}
	if in.WatchMS < 0 {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", "watch_ms must be >= 0")
		return
	}
	if !store.IsUUID(in.PostID) {
		writeError(w, http.StatusNotFound, "POST_NOT_FOUND", "")
		return
	}
	if ok, err := s.store.PostExists(r.Context(), in.PostID); err != nil {
		s.internal(w, r, err)
		return
	} else if !ok {
		writeError(w, http.StatusNotFound, "POST_NOT_FOUND", "")
		return
	}
	if !s.limit(w, "view", u.ID, viewLimits) {
		return
	}
	watch := time.Duration(in.WatchMS) * time.Millisecond
	if err := s.store.RecordView(r.Context(), u.ID, in.PostID, watch, in.Completed); err != nil {
		s.internal(w, r, err)
		return
	}
	switch {
	case in.Completed:
		s.learn(r, u.ID, in.PostID, store.SignalFinish)
	case watch >= interestWatch:
		s.learn(r, u.ID, in.PostID, store.SignalView)
	}
	w.WriteHeader(http.StatusNoContent)
}

// learn records an engagement signal toward the user's interests. It never
// fails the request: a missed nudge only makes ranking slightly less sharp.
func (s *Server) learn(r *http.Request, userID, postID string, delta float64) {
	if err := s.store.BumpInterest(r.Context(), userID, postID, delta); err != nil {
		s.log.Warn("learn interest", "user", userID, "post", postID, "err", err)
	}
}
