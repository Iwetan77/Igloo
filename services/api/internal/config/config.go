// Package config loads service configuration from the environment.
package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	Port string

	// PantaMode only supports "live": Panta trades on Solana mainnet only
	// and this service does not mock it.
	PantaMode    string
	PantaAPIKey  string
	PantaBaseURL string

	SupabaseURL            string
	SupabaseServiceRoleKey string
	// DatabaseURL is the Postgres connection string for the Supabase database.
	// The service role key alone cannot open a Postgres connection. Required.
	DatabaseURL string

	SolanaRPCURL string

	PrivyAppID     string
	PrivyAppSecret string
	// AuthMode is "privy" (default) or "dev". In dev mode a bearer token of the
	// form "dev:<privy_user_id>" is accepted so the API can be exercised with curl.
	AuthMode string

	// CronSecret authorises the scheduled catalog refresh route; empty
	// disables the route.
	CronSecret string
}

func Load() (Config, error) {
	c := Config{
		Port:                   env("PORT", "8080"),
		PantaMode:              strings.ToLower(env("PANTA_MODE", "live")),
		PantaAPIKey:            os.Getenv("PANTA_API_KEY"),
		PantaBaseURL:           strings.TrimRight(env("PANTA_BASE_URL", "https://live-api.panta.market/api/v1"), "/"),
		SupabaseURL:            os.Getenv("SUPABASE_URL"),
		SupabaseServiceRoleKey: os.Getenv("SUPABASE_SERVICE_ROLE_KEY"),
		DatabaseURL:            os.Getenv("DATABASE_URL"),
		SolanaRPCURL:           os.Getenv("SOLANA_RPC_URL"),
		PrivyAppID:             os.Getenv("PRIVY_APP_ID"),
		PrivyAppSecret:         os.Getenv("PRIVY_APP_SECRET"),
		AuthMode:               strings.ToLower(env("AUTH_MODE", "privy")),
		CronSecret:             os.Getenv("CRON_SECRET"),
	}
	if c.PantaMode != "live" {
		return c, fmt.Errorf("PANTA_MODE=%q is not supported: only live (Solana mainnet) is implemented", c.PantaMode)
	}
	if !strings.HasPrefix(c.PantaAPIKey, "pk_live_") {
		// pk_test_ keys only return canned sandbox fixtures (see docs/panta-notes.md).
		return c, fmt.Errorf("PANTA_API_KEY must be a pk_live_ key")
	}
	if c.DatabaseURL == "" {
		return c, fmt.Errorf("DATABASE_URL is required (Supabase Postgres connection string)")
	}
	switch c.AuthMode {
	case "privy":
		if c.PrivyAppID == "" || c.PrivyAppSecret == "" {
			return c, fmt.Errorf("AUTH_MODE=privy requires PRIVY_APP_ID and PRIVY_APP_SECRET (set AUTH_MODE=dev for local curl testing)")
		}
	case "dev":
	default:
		return c, fmt.Errorf("AUTH_MODE must be privy or dev, got %q", c.AuthMode)
	}
	return c, nil
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
