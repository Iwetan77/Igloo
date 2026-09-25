package httpapi

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Iwetan77/Igloo/services/api/internal/panta"
)

// orderSession remembers what Panta needs across the buy flow but the
// API's request bodies don't carry: the buyer wallet (needed by build)
// and Panta's orderId (needed by submit/verify, keyed by quote or signature).
// In-process only: a restart mid-buy loses the session and the client must
// requote. The service is meant to run as a single instance.
type orderSession struct {
	quoteID   string
	wallet    string
	marketID  string
	orderID   string
	signature string
	createdAt time.Time
}

type orderSessions struct {
	mu          sync.Mutex
	byQuote     map[string]*orderSession
	bySignature map[string]*orderSession
}

const orderSessionTTL = 30 * time.Minute

func newOrderSessions() *orderSessions {
	o := &orderSessions{byQuote: map[string]*orderSession{}, bySignature: map[string]*orderSession{}}
	go func() {
		for range time.Tick(time.Minute) {
			o.evict()
		}
	}()
	return o
}

func (o *orderSessions) evict() {
	o.mu.Lock()
	defer o.mu.Unlock()
	cutoff := time.Now().Add(-orderSessionTTL)
	for k, s := range o.byQuote {
		if s.createdAt.Before(cutoff) {
			delete(o.byQuote, k)
			delete(o.bySignature, s.signature)
		}
	}
}

func (o *orderSessions) put(s *orderSession) {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.byQuote[s.quoteID] = s
}

// get returns a copy so callers can read fields without holding the lock.
func (o *orderSessions) get(quoteID string) (orderSession, bool) {
	o.mu.Lock()
	defer o.mu.Unlock()
	s, ok := o.byQuote[quoteID]
	if !ok {
		return orderSession{}, false
	}
	return *s, true
}

func (o *orderSessions) setOrder(quoteID, orderID string) {
	o.mu.Lock()
	defer o.mu.Unlock()
	if s, ok := o.byQuote[quoteID]; ok {
		s.orderID = orderID
	}
}

func (o *orderSessions) setSignature(quoteID, sig string) {
	o.mu.Lock()
	defer o.mu.Unlock()
	if s, ok := o.byQuote[quoteID]; ok {
		s.signature = sig
		o.bySignature[sig] = s
	}
}

func (o *orderSessions) bySig(sig string) (orderSession, bool) {
	o.mu.Lock()
	defer o.mu.Unlock()
	s, ok := o.bySignature[sig]
	if !ok {
		return orderSession{}, false
	}
	return *s, true
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
	s.orders.put(&orderSession{quoteID: q.QuoteID, wallet: wallet, marketID: in.PantaMarketID, createdAt: time.Now()})
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
	sess, ok := s.orders.get(in.QuoteID)
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
	s.orders.setOrder(sess.quoteID, b.OrderID)
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
	sess, ok := s.orders.get(in.QuoteID)
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
	s.orders.setSignature(sess.quoteID, in.Signature)
	writeJSON(w, http.StatusOK, map[string]string{"status": "pending"})
}

func (s *Server) verifyOrder(w http.ResponseWriter, r *http.Request) {
	sig := r.URL.Query().Get("signature")
	if sig == "" {
		writeError(w, http.StatusBadRequest, "SIGNATURE_REQUIRED", "signature query parameter is required")
		return
	}
	if sess, ok := s.orders.bySig(sig); ok {
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
