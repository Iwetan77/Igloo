// Package panta is a typed client for the Panta public API (Solana mainnet).
// Values are translated out of Panta's wire format; callers never see raw
// Panta JSON.
package panta

import (
	"encoding/json"
	"fmt"
)

type Market struct {
	ID       string
	Question string
	Category string
	Phase    string   // primary | secondary | resolved | cancelled
	YesPrice *float64 // nil when Panta has no spot price
	NoPrice  *float64
}

type QuoteRequest struct {
	Wallet     string
	MarketID   string
	Side       string // "yes" | "no"
	AmountUSDC string // decimal string, e.g. "1.50"
}

type Quote struct {
	QuoteID         string
	MarketID        string
	Side            string
	FeeUSDC         float64
	EstimatedShares float64
	ExpiresAt       string // RFC 3339
}

// Instruction is one Solana instruction as Panta returns it.
type Instruction struct {
	ProgramID string        `json:"programId"`
	Data      string        `json:"data"` // base64
	Accounts  []AccountMeta `json:"accounts"`
}

type AccountMeta struct {
	Pubkey     string `json:"pubkey"`
	IsSigner   bool   `json:"isSigner"`
	IsWritable bool   `json:"isWritable"`
}

type OrderBuild struct {
	OrderID         string
	Instructions    []Instruction
	RecentBlockhash string
}

type OrderStatus struct {
	Status string // Panta's: built | submitted | confirmed | failed | expired
	Detail string
}

type Position struct {
	MarketID  string
	Side      string // "yes" | "no"
	Shares    float64
	Phase     string
	Claimable bool
}

type CreateMarketRequest struct {
	Wallet         string   `json:"wallet"`
	Question       string   `json:"question"`
	ResolutionRule string   `json:"resolutionRule"`
	SourcesOfTruth []string `json:"sourcesOfTruth"`
	Category       string   `json:"category"`
	StartTime      int64    `json:"startTime"`
	EndTime        int64    `json:"endTime"`
	ResolutionTime int64    `json:"resolutionTime"`
	ImageURL       string   `json:"imageUrl"`
	MarketType     string   `json:"marketType,omitempty"`
	Title          string   `json:"title,omitempty"`
	Description    string   `json:"description,omitempty"`
}

type CreateQuote struct {
	CreateID         string
	ExpectedMarketID string
	FeeUSDC          float64
	ExpiresAt        string
}

type CreateBuild struct {
	CreateID         string
	UnsignedTxBase64 string
	ExpectedMarketID string
}

type RegisteredMarket struct {
	MarketID string
	Status   string
}

type ClaimBuild struct {
	WinningShares   float64
	Instructions    []Instruction
	RecentBlockhash string
}

// Error is a Panta-side failure. Code is Panta's error code (QUOTE_EXPIRED,
// MARKET_NOT_FOUND, ...) or one of ours for transport failures.
type Error struct {
	HTTPStatus int
	Code       string
	Message    string
	Fields     json.RawMessage
}

func (e *Error) Error() string {
	if e.Message != "" {
		return fmt.Sprintf("panta %d %s: %s", e.HTTPStatus, e.Code, e.Message)
	}
	return fmt.Sprintf("panta %d %s", e.HTTPStatus, e.Code)
}
