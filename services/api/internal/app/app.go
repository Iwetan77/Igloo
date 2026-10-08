// Package app wires the API from configuration. Both entry points use it:
// main.go (a long-running server) and api/index.go (a Vercel function).
package app

import (
	"context"
	"log/slog"

	"github.com/Iwetan77/Igloo/services/api/internal/auth"
	"github.com/Iwetan77/Igloo/services/api/internal/config"
	"github.com/Iwetan77/Igloo/services/api/internal/httpapi"
	"github.com/Iwetan77/Igloo/services/api/internal/panta"
	"github.com/Iwetan77/Igloo/services/api/internal/storage"
	"github.com/Iwetan77/Igloo/services/api/internal/store"
)

// Build opens the database and assembles the API server. The caller owns
// the returned store and must Close it.
func Build(ctx context.Context, cfg config.Config, log *slog.Logger) (*httpapi.Server, *store.Store, error) {
	st, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, nil, err
	}

	var verifier auth.Verifier = auth.NewPrivyVerifier(cfg.PrivyAppID)
	var wallets auth.WalletChecker = auth.NewPrivyWallets(cfg.PrivyAppID, cfg.PrivyAppSecret)
	if cfg.AuthMode == "dev" {
		log.Warn("AUTH_MODE=dev: accepting unsigned dev:<privy_user_id> tokens and any wallet; never use in production")
		verifier, wallets = auth.DevVerifier{}, auth.AnyWallet{}
	}

	var sc *storage.Client
	if cfg.SupabaseURL != "" && cfg.SupabaseServiceRoleKey != "" {
		sc = storage.New(cfg.SupabaseURL, cfg.SupabaseServiceRoleKey)
	} else {
		log.Warn("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set: POST /uploads/video will return 503")
	}

	api := httpapi.New(st, panta.New(cfg.PantaBaseURL, cfg.PantaAPIKey), verifier, wallets, sc, log).
		WithCronSecret(cfg.CronSecret)
	return api, st, nil
}
