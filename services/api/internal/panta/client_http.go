package panta

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Client calls the Panta API with an X-Api-Key.
type Client struct {
	baseURL string
	apiKey  string
	http    *http.Client
}

func New(baseURL, apiKey string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  apiKey,
		http:    &http.Client{Timeout: 15 * time.Second},
	}
}

// do sends a request and decodes a 2xx JSON body into out. Panta requires
// trailing slashes on every path; callers pass them.
func (c *Client) do(ctx context.Context, method, path string, body, out any) error {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, rdr)
	if err != nil {
		return err
	}
	req.Header.Set("X-Api-Key", c.apiKey)
	req.Header.Set("Accept", "application/json")
	// Panta's edge rejects some default client user agents with a 403.
	req.Header.Set("User-Agent", "igloo-api/1.0")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return &Error{HTTPStatus: http.StatusBadGateway, Code: "PANTA_UNREACHABLE", Message: err.Error()}
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return &Error{HTTPStatus: http.StatusBadGateway, Code: "PANTA_UNREACHABLE", Message: err.Error()}
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		pe := &Error{HTTPStatus: resp.StatusCode}
		var env struct {
			Code    string          `json:"code"`
			Message string          `json:"message"`
			Fields  json.RawMessage `json:"fields"`
		}
		if json.Unmarshal(raw, &env) == nil && env.Code != "" {
			pe.Code, pe.Message, pe.Fields = env.Code, env.Message, env.Fields
		} else {
			pe.Code = "PANTA_ERROR"
			pe.Message = strings.TrimSpace(string(raw))
			if len(pe.Message) > 300 {
				pe.Message = pe.Message[:300]
			}
		}
		return pe
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return &Error{HTTPStatus: http.StatusBadGateway, Code: "PANTA_BAD_RESPONSE", Message: err.Error()}
	}
	return nil
}

func (c *Client) GetMarket(ctx context.Context, marketID string) (*Market, error) {
	var r struct {
		MarketID    string   `json:"marketId"`
		Title       string   `json:"title"`
		Description string   `json:"description"`
		Category    string   `json:"category"`
		Phase       string   `json:"phase"`
		YesPrice    flexNum  `json:"yesPrice"`
		NoPrice     flexNum  `json:"noPrice"`
		Images      []string `json:"images"`
		EndTime     flexTime `json:"endTime"`
	}
	if err := c.do(ctx, http.MethodGet, "/markets/"+url.PathEscape(marketID)+"/", nil, &r); err != nil {
		return nil, err
	}
	q := r.Title
	if q == "" {
		q = r.Description
	}
	img := ""
	if len(r.Images) > 0 {
		img = r.Images[0]
	}
	return &Market{ID: r.MarketID, Question: q, Category: r.Category, Phase: r.Phase,
		YesPrice: r.YesPrice.ptr(), NoPrice: r.NoPrice.ptr(), ImageURL: img, EndTime: r.EndTime.t}, nil
}

// ListMarketIDs returns one catalog page of market ids for the given filter
// query (e.g. "phase=primary", "category=crypto") and the next cursor.
// Panta's cursor can loop, so callers should stop when a page adds no new ids.
func (c *Client) ListMarketIDs(ctx context.Context, filter, cursor string) ([]string, string, error) {
	q := url.Values{"limit": {"50"}}
	if filter != "" {
		f, err := url.ParseQuery(filter)
		if err != nil {
			return nil, "", err
		}
		for k, v := range f {
			q[k] = v
		}
	}
	if cursor != "" {
		q.Set("cursor", cursor)
	}
	var r struct {
		Items []struct {
			MarketID string `json:"marketId"`
		} `json:"items"`
		NextCursor *string `json:"nextCursor"`
	}
	if err := c.do(ctx, http.MethodGet, "/markets/?"+q.Encode(), nil, &r); err != nil {
		return nil, "", err
	}
	ids := make([]string, 0, len(r.Items))
	for _, it := range r.Items {
		ids = append(ids, it.MarketID)
	}
	next := ""
	if r.NextCursor != nil {
		next = *r.NextCursor
	}
	return ids, next, nil
}

func (c *Client) QuoteOrder(ctx context.Context, q QuoteRequest) (*Quote, error) {
	var r struct {
		QuoteID   string  `json:"quoteId"`
		MarketID  string  `json:"marketId"`
		Side      string  `json:"side"`
		Shares    flexNum `json:"shares"`
		FeeUSDC   flexNum `json:"feeUsdc"`
		ExpiresAt string  `json:"expiresAt"`
	}
	body := map[string]string{"wallet": q.Wallet, "marketId": q.MarketID, "side": q.Side, "amountUsdc": q.AmountUSDC}
	if err := c.do(ctx, http.MethodPost, "/primaryorderquote/", body, &r); err != nil {
		return nil, err
	}
	return &Quote{QuoteID: r.QuoteID, MarketID: r.MarketID, Side: strings.ToLower(r.Side),
		FeeUSDC: r.FeeUSDC.val(), EstimatedShares: r.Shares.val(), ExpiresAt: r.ExpiresAt}, nil
}

func (c *Client) BuildOrder(ctx context.Context, quoteID, wallet string) (*OrderBuild, error) {
	var r struct {
		OrderID         string        `json:"orderId"`
		Instructions    []Instruction `json:"instructions"`
		RecentBlockhash string        `json:"recentBlockhash"`
	}
	body := map[string]any{"quoteId": quoteID, "wallet": wallet}
	if err := c.do(ctx, http.MethodPost, "/primaryorderbuild/", body, &r); err != nil {
		return nil, err
	}
	return &OrderBuild{OrderID: r.OrderID, Instructions: r.Instructions, RecentBlockhash: r.RecentBlockhash}, nil
}

func (c *Client) SubmitOrder(ctx context.Context, orderID, signature, wallet string) error {
	body := map[string]string{"orderId": orderID, "signature": signature, "wallet": wallet}
	return c.do(ctx, http.MethodPost, "/primaryordersubmit/", body, nil)
}

func (c *Client) VerifyOrder(ctx context.Context, orderID, signature string) (*OrderStatus, error) {
	var r struct {
		Status  string `json:"status"`
		Message string `json:"message"`
		Detail  string `json:"detail"`
	}
	body := map[string]string{"orderId": orderID, "signature": signature}
	if err := c.do(ctx, http.MethodPost, "/primaryorderverify/", body, &r); err != nil {
		return nil, err
	}
	d := r.Detail
	if d == "" {
		d = r.Message
	}
	return &OrderStatus{Status: r.Status, Detail: d}, nil
}

func (c *Client) TradeStatus(ctx context.Context, signature string) (string, error) {
	var r struct {
		Status string `json:"status"`
	}
	if err := c.do(ctx, http.MethodGet, "/trades/"+url.PathEscape(signature)+"/", nil, &r); err != nil {
		return "", err
	}
	return r.Status, nil
}

func (c *Client) Positions(ctx context.Context, wallet string) ([]Position, error) {
	var r struct {
		Positions []struct {
			MarketID  string  `json:"marketId"`
			Side      string  `json:"side"`
			Shares    flexNum `json:"shares"`
			Phase     string  `json:"phase"`
			Claimable bool    `json:"claimable"`
		} `json:"positions"`
	}
	if err := c.do(ctx, http.MethodGet, "/positions/?wallet="+url.QueryEscape(wallet), nil, &r); err != nil {
		return nil, err
	}
	out := make([]Position, 0, len(r.Positions))
	for _, p := range r.Positions {
		out = append(out, Position{MarketID: p.MarketID, Side: strings.ToLower(p.Side), Shares: p.Shares.val(), Phase: p.Phase, Claimable: p.Claimable})
	}
	return out, nil
}

func (c *Client) CreateMarketQuote(ctx context.Context, req CreateMarketRequest) (*CreateQuote, error) {
	var r struct {
		CreateID         string  `json:"createId"`
		ExpectedEventPda string  `json:"expectedEventPda"`
		PaymentUSDC      flexNum `json:"paymentUsdc"` // base units
		ExpiresAt        string  `json:"expiresAt"`
	}
	if err := c.do(ctx, http.MethodPost, "/markets/create/quote/", req, &r); err != nil {
		return nil, err
	}
	return &CreateQuote{CreateID: r.CreateID, ExpectedMarketID: r.ExpectedEventPda, FeeUSDC: r.PaymentUSDC.val() / 1e6, ExpiresAt: r.ExpiresAt}, nil
}

func (c *Client) CreateMarketBuild(ctx context.Context, createID, wallet string) (*CreateBuild, error) {
	var r struct {
		CreateID         string `json:"createId"`
		ExpectedEventPda string `json:"expectedEventPda"`
		Transaction      string `json:"transaction"`
	}
	body := map[string]string{"createId": createID, "wallet": wallet}
	if err := c.do(ctx, http.MethodPost, "/markets/create/build/", body, &r); err != nil {
		return nil, err
	}
	return &CreateBuild{CreateID: r.CreateID, UnsignedTxBase64: r.Transaction, ExpectedMarketID: r.ExpectedEventPda}, nil
}

func (c *Client) RegisterMarket(ctx context.Context, createID, signature string) (*RegisteredMarket, error) {
	var r struct {
		MarketID string `json:"marketId"`
		Status   string `json:"status"`
	}
	body := map[string]string{"createId": createID, "signature": signature}
	if err := c.do(ctx, http.MethodPost, "/markets/register/", body, &r); err != nil {
		return nil, err
	}
	return &RegisteredMarket{MarketID: r.MarketID, Status: r.Status}, nil
}

func (c *Client) BuildClaim(ctx context.Context, wallet, marketID string) (*ClaimBuild, error) {
	var r struct {
		WinningShares   flexNum       `json:"winningShares"`
		Instructions    []Instruction `json:"instructions"`
		RecentBlockhash string        `json:"recentBlockhash"`
	}
	body := map[string]string{"wallet": wallet, "marketId": marketID}
	if err := c.do(ctx, http.MethodPost, "/claim/build/", body, &r); err != nil {
		return nil, err
	}
	return &ClaimBuild{WinningShares: r.WinningShares.val(), Instructions: r.Instructions, RecentBlockhash: r.RecentBlockhash}, nil
}

// flexNum accepts a JSON number, a numeric string, or null. Panta returns
// decimal quantities as strings on most routes and numbers on a few.
type flexNum struct {
	v  float64
	ok bool
}

func (f *flexNum) UnmarshalJSON(b []byte) error {
	s := strings.TrimSpace(string(b))
	if s == "null" || s == `""` {
		return nil
	}
	s = strings.Trim(s, `"`)
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return fmt.Errorf("not a number: %s", b)
	}
	f.v, f.ok = v, true
	return nil
}

func (f flexNum) val() float64 { return f.v }

func (f flexNum) ptr() *float64 {
	if !f.ok {
		return nil
	}
	v := f.v
	return &v
}

// flexTime accepts unix seconds (live API) or an RFC 3339 string (sandbox).
type flexTime struct{ t *time.Time }

func (f *flexTime) UnmarshalJSON(b []byte) error {
	s := strings.Trim(strings.TrimSpace(string(b)), `"`)
	if s == "" || s == "null" {
		return nil
	}
	if n, err := strconv.ParseInt(s, 10, 64); err == nil {
		t := time.Unix(n, 0).UTC()
		f.t = &t
		return nil
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return nil // an unparseable time is treated as unknown, not an error
	}
	f.t = &t
	return nil
}

// IsCode reports whether err is a Panta error with the given code.
func IsCode(err error, code string) bool {
	var pe *Error
	return errors.As(err, &pe) && pe.Code == code
}
