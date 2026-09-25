package httpapi

import (
	"testing"

	"github.com/Iwetan77/Igloo/services/api/internal/panta"
)

func TestCorrectCategory(t *testing.T) {
	cases := []struct{ q, cat, want string }{
		{"Will $ANSEM reach a $1B market cap by December 31, 2026?", "sports", "crypto"},
		{"Will Bitcoin drop below 58k in 2026?", "sports", "crypto"},
		{"Will Ethereum (ETH) daily transaction volume be less than Arbitrum?", "sports", "crypto"},
		{"Will Witty Cruz top The Pantas FPL Leaderboard by end of GW3?", "sports", "sports"},
		{"Will GTA 6 release on November 19th, 2026", "gaming", "gaming"},
		{"Will the Fed cut rates by $50 basis points?", "finance", "finance"}, // "$50" is not a ticker
		{"Will Solomon win the solo race?", "sports", "sports"},               // "sol" needs a word boundary
		{"", "politics", "politics"},
	}
	for _, c := range cases {
		if got := correctCategory(&panta.Market{Question: c.q, Category: c.cat}); got != c.want {
			t.Errorf("%q (%s): got %s, want %s", c.q, c.cat, got, c.want)
		}
	}
}
