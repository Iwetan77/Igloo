package store

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestServerlessState(t *testing.T) {
	st := openTestStore(t)
	ctx := context.Background()

	t.Run("order sessions survive across calls and expire", func(t *testing.T) {
		if err := st.PutOrderSession(ctx, "qt_1", "WalletA", "mkt"); err != nil {
			t.Fatal(err)
		}
		if err := st.SetOrderSessionOrder(ctx, "qt_1", "ord_1"); err != nil {
			t.Fatal(err)
		}
		if err := st.SetOrderSessionSignature(ctx, "qt_1", "sig_1"); err != nil {
			t.Fatal(err)
		}
		o, err := st.OrderSessionByQuote(ctx, "qt_1")
		if err != nil || o.Wallet != "WalletA" || o.MarketID != "mkt" || o.OrderID != "ord_1" || o.Signature != "sig_1" {
			t.Fatalf("by quote: %+v %v", o, err)
		}
		if o, err := st.OrderSessionBySignature(ctx, "sig_1"); err != nil || o.QuoteID != "qt_1" {
			t.Errorf("by signature: %+v %v", o, err)
		}
		// Re-quoting with the same id starts a clean session.
		st.PutOrderSession(ctx, "qt_1", "WalletB", "mkt2")
		if o, _ := st.OrderSessionByQuote(ctx, "qt_1"); o.Wallet != "WalletB" || o.OrderID != "" || o.Signature != "" {
			t.Errorf("re-quote kept stale order data: %+v", o)
		}
		if _, err := st.OrderSessionByQuote(ctx, "nope"); err != ErrNotFound {
			t.Errorf("unknown quote: %v", err)
		}
		// An expired session is invisible and is cleaned up by the next put.
		st.db.Exec(ctx, `update order_sessions set created_at = now() - interval '31 minutes' where quote_id = 'qt_1'`)
		if _, err := st.OrderSessionByQuote(ctx, "qt_1"); err != ErrNotFound {
			t.Errorf("expired session still returned: %v", err)
		}
		st.PutOrderSession(ctx, "qt_2", "WalletC", "mkt")
		var n int
		st.db.QueryRow(ctx, `select count(*) from order_sessions where quote_id = 'qt_1'`).Scan(&n)
		if n != 0 {
			t.Errorf("expired session not cleaned up")
		}
	})

	t.Run("rate limit windows", func(t *testing.T) {
		limits := []RateWindow{{N: 3, D: time.Minute}, {N: 5, D: time.Hour}}
		for i := 0; i < 3; i++ {
			if ok, _, err := st.AllowRate(ctx, "post:u1", limits); !ok || err != nil {
				t.Fatalf("event %d: %v %v", i+1, ok, err)
			}
		}
		ok, wait, err := st.AllowRate(ctx, "post:u1", limits)
		if ok || err != nil || wait <= 50*time.Second || wait > time.Minute {
			t.Fatalf("4th in a minute: ok=%v wait=%v err=%v, want rejected with ~60s", ok, wait, err)
		}
		if ok, _, _ := st.AllowRate(ctx, "post:u2", limits); !ok {
			t.Error("limit leaked across keys")
		}
		// Age the minute window out; the hour window now allows 2 more.
		st.db.Exec(ctx, `update rate_events set at = at - interval '2 minutes' where key = 'post:u1'`)
		for i := 0; i < 2; i++ {
			if ok, _, _ := st.AllowRate(ctx, "post:u1", limits); !ok {
				t.Fatalf("after minute window, event %d rejected", i+1)
			}
		}
		if ok, wait, _ := st.AllowRate(ctx, "post:u1", limits); ok || wait < 55*time.Minute {
			t.Errorf("hour cap: ok=%v wait=%v", ok, wait)
		}
	})

	// Serverless instances hit the limiter at the same moment; exactly N may pass.
	t.Run("concurrent requests cannot exceed the limit", func(t *testing.T) {
		limits := []RateWindow{{N: 3, D: time.Minute}}
		var allowed atomic.Int32
		var wg sync.WaitGroup
		for i := 0; i < 20; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				ok, _, err := st.AllowRate(ctx, "comment:race", limits)
				if err != nil {
					t.Error(err)
				}
				if ok {
					allowed.Add(1)
				}
			}()
		}
		wg.Wait()
		if got := allowed.Load(); got != 3 {
			t.Errorf("allowed %d of 20 concurrent requests, want exactly 3", got)
		}
	})
}
