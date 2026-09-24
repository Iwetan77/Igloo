package httpapi

import (
	"net/http"

	"github.com/Iwetan77/Igloo/services/api/internal/panta"
	"github.com/Iwetan77/Igloo/services/api/internal/store"
)

// Market creation and win claims. The wallet
// is always the signed-in user's, never taken from the body.

func (s *Server) marketQuote(w http.ResponseWriter, r *http.Request, u store.User) {
	var in struct {
		Question       string   `json:"question"`
		ResolutionRule string   `json:"resolution_rule"`
		SourcesOfTruth []string `json:"sources_of_truth"`
		Category       string   `json:"category"`
		StartTime      int64    `json:"start_time"`
		EndTime        int64    `json:"end_time"`
		ResolutionTime int64    `json:"resolution_time"`
		ImageURL       string   `json:"image_url"`
		MarketType     string   `json:"market_type"`
		Title          string   `json:"title"`
		Description    string   `json:"description"`
	}
	if !decodeBody(w, r, &in) {
		return
	}
	q, err := s.panta.CreateMarketQuote(r.Context(), panta.CreateMarketRequest{
		Wallet: u.WalletAddress, Question: in.Question, ResolutionRule: in.ResolutionRule,
		SourcesOfTruth: in.SourcesOfTruth, Category: in.Category,
		StartTime: in.StartTime, EndTime: in.EndTime, ResolutionTime: in.ResolutionTime,
		ImageURL: in.ImageURL, MarketType: in.MarketType, Title: in.Title, Description: in.Description,
	})
	if err != nil {
		s.pantaError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"create_id":                q.CreateID,
		"expected_panta_market_id": q.ExpectedMarketID,
		"fee_usdc":                 q.FeeUSDC,
		"expires_at":               q.ExpiresAt,
	})
}

func (s *Server) marketBuild(w http.ResponseWriter, r *http.Request, u store.User) {
	var in struct {
		CreateID string `json:"create_id"`
	}
	if !decodeBody(w, r, &in) {
		return
	}
	b, err := s.panta.CreateMarketBuild(r.Context(), in.CreateID, u.WalletAddress)
	if err != nil {
		s.pantaError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"create_id":                b.CreateID,
		"unsigned_tx_base64":       b.UnsignedTxBase64,
		"expected_panta_market_id": b.ExpectedMarketID,
	})
}

func (s *Server) marketRegister(w http.ResponseWriter, r *http.Request, _ store.User) {
	var in struct {
		CreateID  string `json:"create_id"`
		Signature string `json:"signature"`
	}
	if !decodeBody(w, r, &in) {
		return
	}
	m, err := s.panta.RegisterMarket(r.Context(), in.CreateID, in.Signature)
	if err != nil {
		s.pantaError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"panta_market_id": m.MarketID, "status": m.Status})
}

func (s *Server) claimBuild(w http.ResponseWriter, r *http.Request, u store.User) {
	var in struct {
		PantaMarketID string `json:"panta_market_id"`
	}
	if !decodeBody(w, r, &in) {
		return
	}
	c, err := s.panta.BuildClaim(r.Context(), u.WalletAddress, in.PantaMarketID)
	if err != nil {
		s.pantaError(w, r, err)
		return
	}
	tx, err := panta.CompileUnsignedTx(c.Instructions, c.RecentBlockhash, u.WalletAddress)
	if err != nil {
		s.log.Error("compile claim instructions", "err", err)
		writeError(w, http.StatusBadGateway, "PANTA_BAD_BUILD", "could not assemble a transaction from the upstream build")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"winning_shares": c.WinningShares, "unsigned_tx_base64": tx})
}
