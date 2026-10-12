package httpapi

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func testLimiter() (*rateLimiter, *time.Time) {
	now := time.Date(2026, 9, 25, 12, 0, 0, 0, time.UTC)
	return &rateLimiter{events: map[string][]time.Time{}, now: func() time.Time { return now }}, &now
}

// A limiter that never refills locks users out for good; one that never
// counts the daily window lets a user post forever at the short-window rate.
func TestRateLimiterWindows(t *testing.T) {
	ctx := context.Background()
	rl, now := testLimiter()
	limits := []window{{3, 10 * time.Minute}, {5, 24 * time.Hour}}

	for i := 0; i < 3; i++ {
		if ok, _, _ := rl.allow(ctx, "post:alice", limits); !ok {
			t.Fatalf("event %d rejected", i+1)
		}
	}
	ok, wait, _ := rl.allow(ctx, "post:alice", limits)
	if ok || wait != 10*time.Minute {
		t.Fatalf("4th in 10 min: ok=%v wait=%v, want rejected with 10m", ok, wait)
	}
	if ok, _, _ := rl.allow(ctx, "post:bob", limits); !ok {
		t.Fatal("limits leaked across users")
	}
	if ok, _, _ := rl.allow(ctx, "comment:alice", limits); !ok {
		t.Fatal("limits leaked across actions")
	}

	*now = now.Add(4 * time.Minute)
	if _, wait, _ := rl.allow(ctx, "post:alice", limits); wait != 6*time.Minute {
		t.Errorf("wait after 4 min = %v, want 6m", wait)
	}

	// Short window refills; only 2 of the daily 5 are left.
	*now = now.Add(7 * time.Minute)
	for i := 0; i < 2; i++ {
		if ok, _, _ := rl.allow(ctx, "post:alice", limits); !ok {
			t.Fatalf("after refill, event %d rejected", i+1)
		}
	}
	ok, wait, _ = rl.allow(ctx, "post:alice", limits)
	if ok || wait < 23*time.Hour {
		t.Fatalf("daily cap: ok=%v wait=%v, want rejected for ~23h", ok, wait)
	}

	// Rejected attempts must not count toward the limit.
	*now = now.Add(24 * time.Hour)
	for i := 0; i < 3; i++ {
		if ok, _, _ := rl.allow(ctx, "post:alice", limits); !ok {
			t.Fatalf("next day, event %d rejected", i+1)
		}
	}
}

func TestLimitResponse(t *testing.T) {
	rl, _ := testLimiter()
	s := &Server{limiter: rl}
	limits := []window{{1, 90 * time.Second}}
	req := httptest.NewRequest("POST", "/", nil)
	if !s.limit(httptest.NewRecorder(), req, "upload", "u1", limits) {
		t.Fatal("first request limited")
	}
	rec := httptest.NewRecorder()
	if s.limit(rec, req, "upload", "u1", limits) {
		t.Fatal("second request allowed")
	}
	if rec.Code != 429 || rec.Header().Get("Retry-After") != "90" || !contains(rec.Body.String(), `"code":"RATE_LIMITED"`) {
		t.Errorf("got %d Retry-After=%q body=%s", rec.Code, rec.Header().Get("Retry-After"), rec.Body)
	}
}

func contains(s, sub string) bool { return strings.Contains(s, sub) }
