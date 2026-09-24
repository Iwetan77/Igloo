// Package storage issues Supabase Storage signed upload URLs so browsers can
// upload directly without any anon write policy on the bucket.
package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Client struct {
	baseURL string // https://<ref>.supabase.co
	key     string // service role / secret key
	http    *http.Client
}

func New(supabaseURL, serviceKey string) *Client {
	return &Client{
		baseURL: strings.TrimRight(supabaseURL, "/"),
		key:     serviceKey,
		http:    &http.Client{Timeout: 10 * time.Second},
	}
}

type SignedUpload struct {
	Path      string
	Token     string
	UploadURL string // PUT the file here (or use supabase-js uploadToSignedUrl)
	PublicURL string // readable once uploaded, if the bucket is public
}

// SignUpload reserves bucket/path for a single upload by the holder of the token.
func (c *Client) SignUpload(ctx context.Context, bucket, path string) (*SignedUpload, error) {
	endpoint := c.baseURL + "/storage/v1/object/upload/sign/" + bucket + "/" + path
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader("{}"))
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", c.key)
	req.Header.Set("Authorization", "Bearer "+c.key)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("supabase storage sign: status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var r struct {
		URL string `json:"url"` // "/object/upload/sign/<bucket>/<path>?token=..."
	}
	if err := json.Unmarshal(body, &r); err != nil {
		return nil, fmt.Errorf("supabase storage sign: %w", err)
	}
	u, err := url.Parse(r.URL)
	if err != nil {
		return nil, fmt.Errorf("supabase storage sign: bad url %q", r.URL)
	}
	token := u.Query().Get("token")
	if token == "" {
		return nil, fmt.Errorf("supabase storage sign: no token in %q", r.URL)
	}
	return &SignedUpload{
		Path:      path,
		Token:     token,
		UploadURL: c.baseURL + "/storage/v1" + r.URL,
		PublicURL: c.baseURL + "/storage/v1/object/public/" + bucket + "/" + path,
	}, nil
}
