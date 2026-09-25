package httpapi

import (
	"context"
	"regexp"

	"github.com/Iwetan77/Igloo/services/api/internal/panta"
	"github.com/Iwetan77/Igloo/services/api/internal/store"
)

// Panta files some plainly crypto markets under "sports" (e.g. "Will $ANSEM
// reach a $1B market cap", "Will Bitcoin drop below 58k"), which hides them
// from users who picked crypto. A question that names a coin, chain or
// $TICKER is filed under crypto; anything else keeps Panta's category.
var cryptoQuestion = regexp.MustCompile(`(?i)\b(bitcoin|btc|ethereum|eth|solana|sol|xrp|dogecoin|doge|memecoin|meme ?coin|stablecoin|crypto|cryptocurrency|defi|nft|altcoin|binance|coinbase)\b|\$[A-Z][A-Z0-9]{1,9}\b`)

func correctCategory(m *panta.Market) string {
	if m.Category != "crypto" && cryptoQuestion.MatchString(m.Question) {
		return "crypto"
	}
	return m.Category
}

// upsertFromPanta writes a live market to markets_cache. Panta sometimes
// returns a blank question; the crypto correction then falls back to the last
// question it did return, so a blank response can't flip a corrected
// category back to Panta's label.
func upsertFromPanta(ctx context.Context, st *store.Store, m *panta.Market) error {
	if m.Question == "" {
		if cm, err := st.CachedMarketByID(ctx, m.ID); err == nil && cm.Question != nil {
			withQ := *m
			withQ.Question = *cm.Question
			row := cachedFromPanta(&withQ)
			row.Question = nil // don't write the borrowed question back as new data
			return st.UpsertMarket(ctx, row)
		}
	}
	return st.UpsertMarket(ctx, cachedFromPanta(m))
}
