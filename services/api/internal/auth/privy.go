// Package auth verifies Privy access tokens.
package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var ErrUnauthorized = errors.New("unauthorized")

// Verifier turns a bearer token into a Privy user id (the token's sub,
// e.g. "did:privy:abc123").
type Verifier interface {
	Verify(ctx context.Context, token string) (privyUserID string, err error)
}

// PrivyVerifier checks ES256 access tokens against the app's JWKS.
type PrivyVerifier struct {
	appID   string
	jwksURL string
	http    *http.Client

	mu        sync.Mutex
	keys      map[string]*ecdsa.PublicKey
	fetchedAt time.Time
}

func NewPrivyVerifier(appID string) *PrivyVerifier {
	return &PrivyVerifier{
		appID:   appID,
		jwksURL: "https://auth.privy.io/api/v1/apps/" + appID + "/jwks.json",
		http:    &http.Client{Timeout: 10 * time.Second},
	}
}

func (v *PrivyVerifier) Verify(ctx context.Context, token string) (string, error) {
	claims := jwt.RegisteredClaims{}
	_, err := jwt.ParseWithClaims(token, &claims, func(t *jwt.Token) (any, error) {
		kid, _ := t.Header["kid"].(string)
		return v.key(ctx, kid)
	},
		jwt.WithValidMethods([]string{"ES256"}),
		jwt.WithIssuer("privy.io"),
		jwt.WithAudience(v.appID),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(30*time.Second),
	)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrUnauthorized, err)
	}
	if claims.Subject == "" {
		return "", fmt.Errorf("%w: token has no subject", ErrUnauthorized)
	}
	return claims.Subject, nil
}

// key returns the signing key for kid, refetching the JWKS when the kid is
// unknown (key rotation) but at most once a minute.
func (v *PrivyVerifier) key(ctx context.Context, kid string) (*ecdsa.PublicKey, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if k := v.lookup(kid); k != nil {
		return k, nil
	}
	if time.Since(v.fetchedAt) < time.Minute && v.keys != nil {
		return nil, fmt.Errorf("unknown signing key %q", kid)
	}
	keys, err := v.fetch(ctx)
	v.fetchedAt = time.Now()
	if err != nil {
		return nil, fmt.Errorf("fetch privy jwks: %w", err)
	}
	v.keys = keys
	if k := v.lookup(kid); k != nil {
		return k, nil
	}
	return nil, fmt.Errorf("unknown signing key %q", kid)
}

func (v *PrivyVerifier) lookup(kid string) *ecdsa.PublicKey {
	if kid == "" && len(v.keys) == 1 {
		for _, k := range v.keys {
			return k
		}
	}
	return v.keys[kid]
}

func (v *PrivyVerifier) fetch(ctx context.Context) (map[string]*ecdsa.PublicKey, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.jwksURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := v.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("jwks status %d", resp.StatusCode)
	}
	var set struct {
		Keys []struct {
			Kid string `json:"kid"`
			Kty string `json:"kty"`
			Crv string `json:"crv"`
			X   string `json:"x"`
			Y   string `json:"y"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&set); err != nil {
		return nil, err
	}
	out := map[string]*ecdsa.PublicKey{}
	for _, k := range set.Keys {
		if k.Kty != "EC" || k.Crv != "P-256" {
			continue
		}
		x, err1 := base64.RawURLEncoding.DecodeString(k.X)
		y, err2 := base64.RawURLEncoding.DecodeString(k.Y)
		if err1 != nil || err2 != nil {
			continue
		}
		out[k.Kid] = &ecdsa.PublicKey{Curve: elliptic.P256(), X: new(big.Int).SetBytes(x), Y: new(big.Int).SetBytes(y)}
	}
	if len(out) == 0 {
		return nil, errors.New("jwks has no P-256 keys")
	}
	return out, nil
}

// DevVerifier accepts "dev:<privy_user_id>" tokens. Enabled only with
// AUTH_MODE=dev, for exercising the API with curl without a Privy login.
type DevVerifier struct{}

func (DevVerifier) Verify(_ context.Context, token string) (string, error) {
	id, ok := strings.CutPrefix(token, "dev:")
	if !ok || id == "" {
		return "", fmt.Errorf("%w: dev tokens look like dev:<privy_user_id>", ErrUnauthorized)
	}
	return id, nil
}
