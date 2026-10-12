package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// The wallet check is what stops one user from binding another user's
// Privy id to their own wallet, so it must accept only a linked Solana wallet.
func TestPrivyWalletsOwnsSolanaWallet(t *testing.T) {
	const sol = "BD4Ptc3X9Mf7m3KShwsAoi86E1rRfdUkoa7uQhf4Vbcm"
	const eth = "0x1111111111111111111111111111111111111111"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if u, p, ok := r.BasicAuth(); !ok || u != "app" || p != "secret" || r.Header.Get("privy-app-id") != "app" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		switch r.URL.Path {
		case "/api/v1/users/did:privy:alice":
			w.Write([]byte(`{"id":"did:privy:alice","linked_accounts":[
				{"type":"google_oauth","email":"a@example.com"},
				{"type":"wallet","chain_type":"ethereum","address":"` + eth + `"},
				{"type":"wallet","chain_type":"solana","address":"` + sol + `"}]}`))
		case "/api/v1/users/did:privy:down":
			w.WriteHeader(http.StatusInternalServerError)
		default:
			w.WriteHeader(http.StatusNotFound)
			w.Write([]byte(`{"error":"User not found"}`))
		}
	}))
	defer srv.Close()

	p := NewPrivyWallets("app", "secret")
	p.baseURL = srv.URL
	ctx := context.Background()

	cases := []struct {
		name, user, addr string
		want             bool
		wantErr          bool
	}{
		{"linked solana wallet", "did:privy:alice", sol, true, false},
		{"linked but ethereum", "did:privy:alice", eth, false, false},
		{"someone else's wallet", "did:privy:alice", "9Nfj7UR9qP64K6ojw8aoGHF62B4zQ9Wr1Lb6Sp98MoNF", false, false},
		{"unknown user", "did:privy:nobody", sol, false, false},
		{"privy outage is an error, not a pass", "did:privy:down", sol, false, true},
	}
	for _, c := range cases {
		got, err := p.OwnsSolanaWallet(ctx, c.user, c.addr)
		if got != c.want || (err != nil) != c.wantErr {
			t.Errorf("%s: got (%v, %v), want (%v, err=%v)", c.name, got, err, c.want, c.wantErr)
		}
	}

	bad := NewPrivyWallets("app", "wrong")
	bad.baseURL = srv.URL
	if ok, err := bad.OwnsSolanaWallet(ctx, "did:privy:alice", sol); ok || err == nil {
		t.Errorf("wrong app secret: got (%v, %v), want (false, error)", ok, err)
	}
}
