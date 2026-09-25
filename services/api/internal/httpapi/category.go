package httpapi

import (
	"regexp"

	"github.com/Iwetan77/Igloo/services/api/internal/panta"
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
