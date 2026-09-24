// Command api serves the Igloo backend on :$PORT.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Iwetan77/Igloo/services/api/internal/auth"
	"github.com/Iwetan77/Igloo/services/api/internal/config"
	"github.com/Iwetan77/Igloo/services/api/internal/httpapi"
	"github.com/Iwetan77/Igloo/services/api/internal/panta"
	"github.com/Iwetan77/Igloo/services/api/internal/store"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	if err := run(log); err != nil {
		log.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	st, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer st.Close()

	var verifier auth.Verifier = auth.NewPrivyVerifier(cfg.PrivyAppID)
	var wallets auth.WalletChecker = auth.NewPrivyWallets(cfg.PrivyAppID, cfg.PrivyAppSecret)
	if cfg.AuthMode == "dev" {
		log.Warn("AUTH_MODE=dev: accepting unsigned dev:<privy_user_id> tokens and any wallet; never use in production")
		verifier, wallets = auth.DevVerifier{}, auth.AnyWallet{}
	}

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           httpapi.New(st, panta.New(cfg.PantaBaseURL, cfg.PantaAPIKey), verifier, wallets, log).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	errc := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", srv.Addr, "panta", cfg.PantaBaseURL, "auth", cfg.AuthMode)
		errc <- srv.ListenAndServe()
	}()
	select {
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}
