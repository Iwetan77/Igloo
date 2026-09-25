package httpapi

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/gagliardetto/solana-go"

	"github.com/Iwetan77/Igloo/services/api/internal/auth"
	"github.com/Iwetan77/Igloo/services/api/internal/panta"
)

// fakePanta answers the primary-buy endpoints with the response shapes from
// Panta's docs, records what we sent, and lets a test script the verify
// status. No live market accepts buys right now, so this is the only way to
// exercise quote -> build -> submit -> verify end to end.
type fakePanta struct {
	t            *testing.T
	mu           sync.Mutex
	got          map[string]map[string]any // path -> last JSON body
	verifyStatus string
	quoteErr     string // if set, quote fails with this code
	quoteStatus  int
}

const (
	testWallet  = "BD4Ptc3X9Mf7m3KShwsAoi86E1rRfdUkoa7uQhf4Vbcm"
	testMarket  = "GXh9iztJTm5v6qDWnR4YcKHbSc3AUZ2VEMGfKEegd92V"
	testProgram = "6gM5afTQBq5VZCfgpGqcsqzfWd5maLSCKWtGjbEobZMp"
)

func (f *fakePanta) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-Api-Key") != "pk_live_test" {
		w.WriteHeader(http.StatusUnauthorized)
		io.WriteString(w, `{"code":"UNAUTHORIZED","message":"authentication required or invalid"}`)
		return
	}
	var body map[string]any
	_ = json.NewDecoder(r.Body).Decode(&body)
	f.mu.Lock()
	f.got[r.URL.Path] = body
	status, qerr := f.verifyStatus, f.quoteErr
	f.mu.Unlock()

	switch r.URL.Path {
	case "/primaryorderquote/":
		if qerr != "" {
			w.WriteHeader(f.quoteStatus)
			io.WriteString(w, `{"code":"`+qerr+`"}`)
			return
		}
		io.WriteString(w, `{"quoteId":"qt_1","marketId":"`+testMarket+`","side":"yes","amountUsdc":"1.50",
			"shares":"2.88","avgPrice":"0.5100","feeUsdc":"0.03","expiresAt":"2026-09-25T16:27:00.000000Z"}`)
	case "/primaryorderbuild/":
		data := base64.StdEncoding.EncodeToString([]byte{9, 9, 9})
		io.WriteString(w, `{"orderId":"ord_1","quoteId":"qt_1","wallet":"`+testWallet+`","status":"built",
			"instructions":[{"programId":"`+testProgram+`","data":"`+data+`","accounts":[
				{"pubkey":"`+testWallet+`","isSigner":true,"isWritable":true},
				{"pubkey":"`+testMarket+`","isSigner":false,"isWritable":true}]}],
			"recentBlockhash":"87Mz1unzZg16hBNj5MGDLZ1CcJ1fxHYVxtZ2WGwiZLYn","lastValidBlockHeight":123}`)
	case "/primaryordersubmit/":
		io.WriteString(w, `{"orderId":"ord_1","status":"submitted","signature":"sig_1"}`)
	case "/primaryorderverify/":
		io.WriteString(w, `{"orderId":"ord_1","status":"`+status+`","signature":"sig_1"}`)
	case "/trades/sig_unknown/":
		io.WriteString(w, `{"signature":"sig_unknown","status":"unknown"}`)
	case "/trades/sig_elsewhere/":
		io.WriteString(w, `{"signature":"sig_elsewhere","status":"processed"}`)
	default:
		f.t.Errorf("unexpected Panta call %s %s", r.Method, r.URL.Path)
		w.WriteHeader(http.StatusNotFound)
	}
}

func (f *fakePanta) sent(path string) map[string]any {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.got[path]
}

func newOrdersServer(t *testing.T, key string) (*fakePanta, http.Handler) {
	fp := &fakePanta{t: t, got: map[string]map[string]any{}, verifyStatus: "submitted"}
	ps := httptest.NewServer(fp)
	t.Cleanup(ps.Close)
	s := New(nil, panta.New(ps.URL, key), auth.DevVerifier{}, auth.AnyWallet{}, nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
	return fp, s.Handler()
}

func call(t *testing.T, h http.Handler, method, path, body string) (int, map[string]any) {
	t.Helper()
	var rdr io.Reader
	if body != "" {
		rdr = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, rdr)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out
}

func TestBuyFlow(t *testing.T) {
	fp, h := newOrdersServer(t, "pk_live_test")
	const api = "/api/v1"

	code, q := call(t, h, "POST", api+"/orders/quote",
		`{"panta_market_id":"`+testMarket+`","side":"YES","usdc_amount":1.5,"wallet_address":"`+testWallet+`"}`)
	if code != 200 || q["quote_id"] != "qt_1" || q["fee_usdc"] != 0.03 || q["estimated_shares"] != 2.88 || q["expires_at"] == nil {
		t.Fatalf("quote: %d %v", code, q)
	}
	sent := fp.sent("/primaryorderquote/")
	if sent["wallet"] != testWallet || sent["marketId"] != testMarket || sent["side"] != "yes" || sent["amountUsdc"] != "1.50" {
		t.Errorf("quote sent to Panta: %v", sent)
	}

	// Submitting before building has no Panta order to attach to.
	if code, e := call(t, h, "POST", api+"/orders/submit", `{"quote_id":"qt_1","signature":"sig_1"}`); code != 409 || e["code"] != "ORDER_NOT_BUILT" {
		t.Errorf("submit before build: %d %v", code, e)
	}

	code, b := call(t, h, "POST", api+"/orders/build", `{"quote_id":"qt_1"}`)
	if code != 200 {
		t.Fatalf("build: %d %v", code, b)
	}
	if sent := fp.sent("/primaryorderbuild/"); sent["quoteId"] != "qt_1" || sent["wallet"] != testWallet {
		t.Errorf("build sent to Panta: %v", sent)
	}
	tx, err := solana.TransactionFromBase64(b["unsigned_tx_base64"].(string))
	if err != nil {
		t.Fatalf("unsigned tx does not decode: %v", err)
	}
	if tx.Message.AccountKeys[0].String() != testWallet || !tx.Message.IsVersioned() || len(tx.Signatures) != 1 {
		t.Errorf("tx: payer=%s versioned=%v sigs=%d", tx.Message.AccountKeys[0], tx.Message.IsVersioned(), len(tx.Signatures))
	}

	if code, s := call(t, h, "POST", api+"/orders/submit", `{"quote_id":"qt_1","signature":"sig_1"}`); code != 200 || s["status"] != "pending" {
		t.Fatalf("submit: %d %v", code, s)
	}
	if sent := fp.sent("/primaryordersubmit/"); sent["orderId"] != "ord_1" || sent["signature"] != "sig_1" || sent["wallet"] != testWallet {
		t.Errorf("submit sent to Panta: %v", sent)
	}

	for pantaStatus, want := range map[string]string{
		"submitted": "pending", "built": "pending", "confirmed": "confirmed", "failed": "failed", "expired": "failed",
	} {
		fp.mu.Lock()
		fp.verifyStatus = pantaStatus
		fp.mu.Unlock()
		code, v := call(t, h, "GET", api+"/orders/verify?signature=sig_1", "")
		if code != 200 || v["status"] != want {
			t.Errorf("verify with Panta %q: %d %v, want %q", pantaStatus, code, v, want)
		}
	}
	if sent := fp.sent("/primaryorderverify/"); sent["orderId"] != "ord_1" {
		t.Errorf("verify sent to Panta: %v", sent)
	}

	// Signatures we never saw fall back to Panta's signature-only lookup.
	if code, v := call(t, h, "GET", api+"/orders/verify?signature=sig_elsewhere", ""); code != 200 || v["status"] != "confirmed" {
		t.Errorf("verify fallback processed: %d %v", code, v)
	}
	if code, v := call(t, h, "GET", api+"/orders/verify?signature=sig_unknown", ""); code != 404 || v["code"] != "UNKNOWN_SIGNATURE" {
		t.Errorf("verify fallback unknown: %d %v", code, v)
	}
}

func TestQuoteValidationAndErrors(t *testing.T) {
	fp, h := newOrdersServer(t, "pk_live_test")
	const q = "/api/v1/orders/quote"
	body := func(side, amount, wallet string) string {
		return `{"panta_market_id":"` + testMarket + `","side":"` + side + `","usdc_amount":` + amount + `,"wallet_address":"` + wallet + `"}`
	}
	cases := []struct {
		name, body string
		code       int
		errCode    string
	}{
		{"bad side", body("MAYBE", "1", testWallet), 400, "INVALID_SIDE"},
		{"zero amount", body("NO", "0", testWallet), 400, "INVALID_AMOUNT"},
		{"string amount ok", body("NO", `"2.5"`, testWallet), 200, ""},
		{"no wallet and no token", body("NO", "1", ""), 400, "WALLET_REQUIRED"},
		{"not a pubkey", body("NO", "1", "nope"), 400, "INVALID_WALLET"},
	}
	for _, c := range cases {
		code, out := call(t, h, "POST", q, c.body)
		if code != c.code || (c.errCode != "" && out["code"] != c.errCode) {
			t.Errorf("%s: %d %v, want %d %s", c.name, code, out, c.code, c.errCode)
		}
	}

	// Panta business errors pass through with their status and code.
	fp.mu.Lock()
	fp.quoteErr, fp.quoteStatus = "MARKET_NOT_IN_PRIMARY", 400
	fp.mu.Unlock()
	if code, out := call(t, h, "POST", q, body("YES", "1", testWallet)); code != 400 || out["code"] != "MARKET_NOT_IN_PRIMARY" {
		t.Errorf("panta business error: %d %v", code, out)
	}
	// Panta server errors are not the caller's fault: 502.
	fp.mu.Lock()
	fp.quoteErr, fp.quoteStatus = "INTERNAL_ERROR", 500
	fp.mu.Unlock()
	if code, _ := call(t, h, "POST", q, body("YES", "1", testWallet)); code != 502 {
		t.Errorf("panta 500: got %d, want 502", code)
	}

	if code, out := call(t, h, "POST", "/api/v1/orders/build", `{"quote_id":"qt_never"}`); code != 400 || out["code"] != "QUOTE_EXPIRED" {
		t.Errorf("build unknown quote: %d %v", code, out)
	}
}

// A rejected service API key must surface as our 502, never as a 401 that
// the frontend would read as "the user's login expired".
func TestPantaKeyRejectedIs502(t *testing.T) {
	_, h := newOrdersServer(t, "pk_live_wrong")
	code, out := call(t, h, "POST", "/api/v1/orders/quote",
		`{"panta_market_id":"`+testMarket+`","side":"YES","usdc_amount":1,"wallet_address":"`+testWallet+`"}`)
	if code != 502 || out["code"] != "PANTA_UNAUTHORIZED" {
		t.Errorf("got %d %v", code, out)
	}
}

