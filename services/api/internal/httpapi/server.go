// Package httpapi implements the /api/v1 routes.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/Iwetan77/Igloo/services/api/internal/auth"
	"github.com/Iwetan77/Igloo/services/api/internal/panta"
	"github.com/Iwetan77/Igloo/services/api/internal/storage"
	"github.com/Iwetan77/Igloo/services/api/internal/store"
)

type Server struct {
	store    *store.Store
	panta    *panta.Client
	verifier auth.Verifier
	wallets  auth.WalletChecker
	storage  *storage.Client // nil when Supabase Storage isn't configured
	orders   *orderSessions
	limiter  *rateLimiter
	markets  *marketCache
	log      *slog.Logger
}

func New(st *store.Store, pc *panta.Client, v auth.Verifier, wc auth.WalletChecker, sc *storage.Client, log *slog.Logger) *Server {
	return &Server{
		store:    st,
		panta:    pc,
		verifier: v,
		wallets:  wc,
		storage:  sc,
		orders:   newOrderSessions(),
		limiter:  newRateLimiter(),
		markets:  newMarketCache(pc, st, log),
		log:      log,
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	const p = "/api/v1"

	mux.HandleFunc("GET /healthz", s.healthz)

	mux.HandleFunc("POST "+p+"/users/sync", s.syncUser)
	mux.HandleFunc("GET "+p+"/feed", s.feed)

	mux.HandleFunc("POST "+p+"/orders/quote", s.quoteOrder)
	mux.HandleFunc("POST "+p+"/orders/build", s.buildOrder)
	mux.HandleFunc("POST "+p+"/orders/submit", s.submitOrder)
	mux.HandleFunc("GET "+p+"/orders/verify", s.verifyOrder)
	mux.HandleFunc("GET "+p+"/positions", s.positions)

	mux.HandleFunc("GET "+p+"/me", s.requireUser(s.me))
	mux.HandleFunc("PUT "+p+"/me/interests", s.requireUser(s.setInterests))
	mux.HandleFunc("PATCH "+p+"/me", s.requireUser(s.updateMe))
	mux.HandleFunc("GET "+p+"/me/liked", s.requireUser(s.myLiked))
	mux.HandleFunc("POST "+p+"/uploads/avatar", s.requireUser(s.uploadAvatar))
	mux.HandleFunc("GET "+p+"/usernames/{username}", s.userByUsername)
	mux.HandleFunc("GET "+p+"/users/search", s.searchUsers)
	mux.HandleFunc("GET "+p+"/users/{id}", s.userProfile)
	mux.HandleFunc("GET "+p+"/users/{id}/posts", s.userPosts)
	mux.HandleFunc("POST "+p+"/users/{id}/follow", s.requireUser(s.follow))
	mux.HandleFunc("DELETE "+p+"/users/{id}/follow", s.requireUser(s.unfollow))
	mux.HandleFunc("POST "+p+"/events/view", s.requireUser(s.recordView))
	mux.HandleFunc("GET "+p+"/markets", s.listMarkets)
	mux.HandleFunc("GET "+p+"/markets/{id}", s.marketDetail)

	mux.HandleFunc("POST "+p+"/uploads/video", s.requireUser(s.uploadVideo))
	mux.HandleFunc("POST "+p+"/posts", s.requireUser(s.createPost))
	mux.HandleFunc("GET "+p+"/posts/{id}/comments", s.listComments)
	mux.HandleFunc("POST "+p+"/posts/{id}/comments", s.requireUser(s.createComment))
	mux.HandleFunc("POST "+p+"/posts/{id}/like", s.requireUser(s.likePost))
	mux.HandleFunc("POST "+p+"/posts/{id}/share", s.requireUser(s.sharePost))

	mux.HandleFunc("POST "+p+"/markets/quote", s.requireUser(s.marketQuote))
	mux.HandleFunc("POST "+p+"/markets/build", s.requireUser(s.marketBuild))
	mux.HandleFunc("POST "+p+"/markets/register", s.requireUser(s.marketRegister))
	mux.HandleFunc("POST "+p+"/claims/build", s.requireUser(s.claimBuild))

	return s.logRequests(cors(mux))
}

func (s *Server) healthz(w http.ResponseWriter, r *http.Request) {
	if err := s.store.Ping(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "DB_UNAVAILABLE", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ---- auth ----

type ctxKey struct{}

// requireUser rejects requests without a valid Privy token (401) or whose
// Privy user has not called /users/sync yet (403 USER_NOT_SYNCED).
func (s *Server) requireUser(next func(http.ResponseWriter, *http.Request, store.User)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, ok := bearer(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing Authorization: Bearer <privy access token>")
			return
		}
		privyID, err := s.verifier.Verify(r.Context(), token)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid or expired access token")
			return
		}
		u, err := s.store.UserByPrivyID(r.Context(), privyID)
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusForbidden, "USER_NOT_SYNCED", "call POST /users/sync first")
			return
		}
		if err != nil {
			s.internal(w, r, err)
			return
		}
		next(w, r, u)
	}
}

// optionalPrivyID returns the caller's Privy id when a bearer token is sent.
// A token that is present but invalid is an error, never silently anonymous.
func (s *Server) optionalPrivyID(ctx context.Context, r *http.Request) (id string, present bool, err error) {
	token, ok := bearer(r)
	if !ok {
		return "", false, nil
	}
	id, err = s.verifier.Verify(ctx, token)
	return id, true, err
}

// optionalUser resolves the caller's synced user; ok is false for anonymous
// callers and for signed-in users who have not synced yet.
func (s *Server) optionalUser(w http.ResponseWriter, r *http.Request) (u store.User, ok bool, handled bool) {
	id, present, err := s.optionalPrivyID(r.Context(), r)
	if !present {
		return u, false, false
	}
	if err != nil {
		writeError(w, http.StatusUnauthorized, "UNAUTHORIZED", "invalid or expired access token")
		return u, false, true
	}
	u, err = s.store.UserByPrivyID(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		return u, false, false
	}
	if err != nil {
		s.internal(w, r, err)
		return u, false, true
	}
	return u, true, false
}

func bearer(r *http.Request) (string, bool) {
	h := r.Header.Get("Authorization")
	tok, ok := strings.CutPrefix(h, "Bearer ")
	tok = strings.TrimSpace(tok)
	return tok, ok && tok != ""
}

// ---- responses ----

type apiError struct {
	Code    string          `json:"code"`
	Message string          `json:"message,omitempty"`
	Fields  json.RawMessage `json:"fields,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, apiError{Code: code, Message: msg})
}

func (s *Server) internal(w http.ResponseWriter, r *http.Request, err error) {
	s.log.Error("internal error", "method", r.Method, "path", r.URL.Path, "err", err)
	writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "")
}

// pantaError translates a Panta failure. Panta's business-rule codes
// (QUOTE_EXPIRED, MARKET_NOT_FOUND, ...) pass through with their status;
// credential and server failures on Panta's side become 502 since they are
// not the caller's fault.
func (s *Server) pantaError(w http.ResponseWriter, r *http.Request, err error) {
	var pe *panta.Error
	if !errors.As(err, &pe) {
		s.internal(w, r, err)
		return
	}
	status := pe.HTTPStatus
	switch {
	case status == http.StatusTooManyRequests:
	case status == http.StatusUnauthorized:
		// Panta authenticates our API key, not the caller, so this is ours to fix.
		// (Wallet-binding 401s cannot happen: the wallet comes from our session.)
		s.log.Error("panta returned 401", "path", r.URL.Path, "err", pe)
		status = http.StatusBadGateway
		pe = &panta.Error{Code: "PANTA_UNAUTHORIZED", Message: "upstream rejected the service credentials"}
	case status >= 500 || status < 400:
		s.log.Error("panta upstream failure", "path", r.URL.Path, "err", pe)
		status = http.StatusBadGateway
	}
	writeJSON(w, status, apiError{Code: pe.Code, Message: pe.Message, Fields: pe.Fields})
}

func decodeBody(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	dec.UseNumber()
	if err := dec.Decode(v); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_BODY", err.Error())
		return false
	}
	return true
}

// ---- middleware ----

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", "*")
		h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		h.Set("Access-Control-Max-Age", "600")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func (s *Server) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		s.log.Info("request", "method", r.Method, "path", r.URL.Path, "status", rec.status, "ms", time.Since(start).Milliseconds())
	})
}
