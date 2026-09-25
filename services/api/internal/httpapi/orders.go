package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Iwetan77/Igloo/services/api/internal/panta"
	"github.com/Iwetan77/Igloo/services/api/internal/store"
)

// orderSession remembers what Panta needs across the buy flow but the
// API's request bodies don't carry: the buyer wallet (needed by build) and
// Panta's orderId (needed by submit/verify, keyed by quote or signature).
type orderSession struct {
	quoteID   string
	wallet    string
	marketID  string
	orderID   string
	signature string
}

// sessionStore holds order sessions. The server uses the Postgres-backed
// one (dbSessions) so quote, build, submit and verify can land on different
// serverless instances; memSessions serves tests and database-less setups.
type sessionStore interface {
	put(ctx context.Context, s orderSession) error
	get(ctx context.Context, quoteID string) (orderSession, bool, error)
	setOrder(ctx context.Context, quoteID, orderID string) error
	setSignature(ctx context.Context, quoteID, sig string) error
	bySig(ctx context.Context, sig string) (orderSession, bool, error)
}

type dbSessions struct{ st *store.Store }

func fromStore(o store.OrderSession) orderSession {
	return orderSession{quoteID: o.QuoteID, wallet: o.Wallet, marketID: o.MarketID, orderID: o.OrderID, signature: o.Signature}
}

func (d dbSessions) put(ctx context.Context, s orderSession) error {
	return d.st.PutOrderSession(ctx, s.quoteID, s.wallet, s.marketID)
}
func (d dbSessions) get(ctx context.Context, quoteID string) (orderSession, bool, error) {
	o, err := d.st.OrderSessionByQuote(ctx, quoteID)
	if errors.Is(err, store.ErrNotFound) {
		return orderSession{}, false, nil
	}
	return fromStore(o), err == nil, err
}
func (d dbSessions) setOrder(ctx context.Context, quoteID, orderID string) error {
	return d.st.SetOrderSessionOrder(ctx, quoteID, orderID)
}
func (d dbSessions) setSignature(ctx context.Context, quoteID, sig string) error {
	return d.st.SetOrderSessionSignature(ctx, quoteID, sig)
}
func (d dbSessions) bySig(ctx context.Context, sig string) (orderSession, bool, error) {
	o, err := d.st.OrderSessionBySignature(ctx, sig)
	if errors.Is(err, store.ErrNotFound) {
		return orderSession{}, false, nil
	}
	return fromStore(o), err == nil, err
}

// memSessions is the in-process session store (single instance only).
type memSessions struct {
	mu          sync.Mutex
	byQuote     map[string]*memSession
	bySignature map[string]*memSession
}

type memSession struct {
	orderSession
	createdAt time.Time
}

func newMemSessions() *memSessions {
	return &memSessions{byQuote: map[string]*memSession{}, bySignature: map[string]*memSession{}}
}

func (o *memSessions) live(s *memSession) bool {
	return time.Since(s.createdAt) < store.OrderSessionTTL
}

func (o *memSessions) put(_ context.Context, s orderSession) error {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.byQuote[s.quoteID] = &memSession{orderSession: s, createdAt: time.Now()}
	return nil
}

func (o *memSessions) get(_ context.Context, quoteID string) (orderSession, bool, error) {
	o.mu.Lock()
	defer o.mu.Unlock()
	s, ok := o.byQuote[quoteID]
	if !ok || !o.live(s) {
		return orderSession{}, false, nil
	}
	return s.orderSession, true, nil
}

func (o *memSessions) setOrder(_ context.Context, quoteID, orderID string) error {
	o.mu.Lock()
	defer o.mu.Unlock()
	if s, ok := o.byQuote[quoteID]; ok {
		s.orderID = orderID
	}
	return nil
}

func (o *memSessions) setSignature(_ context.Context, quoteID, sig string) error {
	o.mu.Lock()
	defer o.mu.Unlock()
	if s, ok := o.byQuote[quoteID]; ok {
		s.signature = sig
		o.bySignature[sig] = s
	}
	return nil
}

func (o *memSessions) bySig(_ context.Context, sig string) (orderSession, bool, error) {
	o.mu.Lock()
	defer o.mu.Unlock()
	s, ok := o.bySignature[sig]
	if !ok || !o.live(s) {
		return orderSession{}, false, nil
	}
	return s.orderSession, true, nil
}

// ---- handlers ----

func (s *Server) quoteOrder(w http.ResponseWriter, r *http.Request) {
	var in struct {
		PantaMarketID string      `json:"panta_market_id"`
		Side          string      `json:"side"`
		USDCAmount    json.Number `json:"usdc_amount"`
		// Optional: Panta needs the buyer wallet at quote time.
		// Signed-in callers can omit it; the synced user's wallet is used.
		WalletAddress string `json:"wallet_address"`
	}
	if !decodeBody(w, r, &in) {
		return
	}
	side := strings.ToUpper(in.Side)
	if side != "YES" && side != "NO" {
		writeError(w, http.StatusBadRequest, "INVALID_SIDE", `side must be "YES" or "NO"`)
		return
	}
	if in.PantaMarketID == "" {
		writeError(w, http.StatusBadRequest, "INVALID_MARKET_PARAMS", "panta_market_id is required")
		return
	}
	amt, err := strconv.ParseFloat(in.USDCAmount.String(), 64)
	if err != nil || amt <= 0 {
		writeError(w, http.StatusBadRequest, "INVALID_AMOUNT", "usdc_amount must be a positive number")
		return
	}

	wallet := in.WalletAddress
	u, signedIn, handled := s.optionalUser(w, r)
	if handled {
		return
	}
	if signedIn {
		if wallet != "" && wallet != u.WalletAddress {
			writeError(w, http.StatusBadRequest, "WALLET_MISMATCH", "wallet_address differs from the signed-in user's wallet")
			return
		}
		wallet = u.WalletAddress
	}
	if wallet == "" {
		writeError(w, http.StatusBadRequest, "WALLET_REQUIRED", "send a Bearer token for a synced user, or wallet_address")
		return
	}
	if !panta.ValidPubkey(wallet) {
		writeError(w, http.StatusBadRequest, "INVALID_WALLET", "wallet_address is not a valid Solana public key")
		return
	}

	q, err := s.panta.QuoteOrder(r.Context(), panta.QuoteRequest{
		Wallet:     wallet,
		MarketID:   in.PantaMarketID,
		Side:       strings.ToLower(side),
		AmountUSDC: strconv.FormatFloat(amt, 'f', 2, 64),
	})
	if err != nil {
		s.pantaError(w, r, err)
		return
	}
	if err := s.orders.put(r.Context(), orderSession{quoteID: q.QuoteID, wallet: wallet, marketID: in.PantaMarketID}); err != nil {
		s.internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"quote_id":         q.QuoteID,
		"fee_usdc":         q.FeeUSDC,
		"estimated_shares": q.EstimatedShares,
		"expires_at":       q.ExpiresAt,
	})
}

func (s *Server) buildOrder(w http.ResponseWriter, r *http.Request) {
	var in struct {
		QuoteID string `json:"quote_id"`
	}
	if !decodeBody(w, r, &in) {
		return
	}
	sess, ok, err := s.orders.get(r.Context(), in.QuoteID)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	if !ok {
		writeError(w, http.StatusBadRequest, "QUOTE_EXPIRED", "unknown or expired quote_id; request a new quote")
		return
	}
	b, err := s.panta.BuildOrder(r.Context(), sess.quoteID, sess.wallet)
	if err != nil {
		s.pantaError(w, r, err)
		return
	}
	tx, err := panta.CompileUnsignedTx(b.Instructions, b.RecentBlockhash, sess.wallet)
	if err != nil {
		s.log.Error("compile panta instructions", "quote_id", sess.quoteID, "err", err)
		writeError(w, http.StatusBadGateway, "PANTA_BAD_BUILD", "could not assemble a transaction from the upstream build")
		return
	}
	if err := s.orders.setOrder(r.Context(), sess.quoteID, b.OrderID); err != nil {
		s.internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"unsigned_tx_base64": tx})
}

func (s *Server) submitOrder(w http.ResponseWriter, r *http.Request) {
	var in struct {
		QuoteID   string `json:"quote_id"`
		Signature string `json:"signature"`
	}
	if !decodeBody(w, r, &in) {
		return
	}
	if in.Signature == "" {
		writeError(w, http.StatusBadRequest, "SIGNATURE_REQUIRED", "signature is required")
		return
	}
	sess, ok, err := s.orders.get(r.Context(), in.QuoteID)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	if !ok {
		writeError(w, http.StatusBadRequest, "QUOTE_EXPIRED", "unknown or expired quote_id")
		return
	}
	if sess.orderID == "" {
		writeError(w, http.StatusConflict, "ORDER_NOT_BUILT", "call /orders/build for this quote first")
		return
	}
	if err := s.panta.SubmitOrder(r.Context(), sess.orderID, in.Signature, sess.wallet); err != nil {
		s.pantaError(w, r, err)
		return
	}
	if err := s.orders.setSignature(r.Context(), sess.quoteID, in.Signature); err != nil {
		s.internal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "pending"})
}

func (s *Server) verifyOrder(w http.ResponseWriter, r *http.Request) {
	sig := r.URL.Query().Get("signature")
	if sig == "" {
		writeError(w, http.StatusBadRequest, "SIGNATURE_REQUIRED", "signature query parameter is required")
		return
	}
	sess, ok, err := s.orders.bySig(r.Context(), sig)
	if err != nil {
		s.internal(w, r, err)
		return
	}
	if ok {
		st, err := s.panta.VerifyOrder(r.Context(), sess.orderID, sig)
		if err != nil {
			s.pantaError(w, r, err)
			return
		}
		writeVerify(w, mapOrderStatus(st.Status), st.Detail)
		return
	}
	// Session unknown (e.g. after a restart): fall back to Panta's
	// signature-only trade status.
	st, err := s.panta.TradeStatus(r.Context(), sig)
	if err != nil {
		s.pantaError(w, r, err)
		return
	}
	switch st {
	case "processed":
		writeVerify(w, "confirmed", "")
	case "pending_attribution":
		writeVerify(w, "pending", "")
	case "failed":
		writeVerify(w, "failed", "")
	default:
		writeError(w, http.StatusNotFound, "UNKNOWN_SIGNATURE", "no order is known for this signature")
	}
}

func mapOrderStatus(pantaStatus string) string {
	switch pantaStatus {
	case "confirmed":
		return "confirmed"
	case "failed", "expired":
		return "failed"
	default: // built, submitted
		return "pending"
	}
}

func writeVerify(w http.ResponseWriter, status, detail string) {
	out := map[string]string{"status": status}
	if detail != "" {
		out["detail"] = detail
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) positions(w http.ResponseWriter, r *http.Request) {
	wallet := r.URL.Query().Get("wallet_address")
	if !panta.ValidPubkey(wallet) {
		writeError(w, http.StatusBadRequest, "INVALID_WALLET", "wallet_address must be a Solana public key")
		return
	}
	ps, err := s.panta.Positions(r.Context(), wallet)
	if err != nil {
		s.pantaError(w, r, err)
		return
	}
	type position struct {
		PantaMarketID string  `json:"panta_market_id"`
		Side          string  `json:"side"`
		Shares        float64 `json:"shares"`
		Phase         string  `json:"phase"`
		Claimable     bool    `json:"claimable"`
	}
	out := make([]position, 0, len(ps))
	for _, p := range ps {
		out = append(out, position{p.MarketID, strings.ToUpper(p.Side), p.Shares, p.Phase, p.Claimable})
	}
	writeJSON(w, http.StatusOK, map[string]any{"positions": out})
}
