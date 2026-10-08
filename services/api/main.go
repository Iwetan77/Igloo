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

	"github.com/Iwetan77/Igloo/services/api/internal/app"
	"github.com/Iwetan77/Igloo/services/api/internal/config"
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

	api, st, err := app.Build(ctx, cfg, log)
	if err != nil {
		return err
	}
	defer st.Close()

	// On Vercel (which sets VERCEL=1) instances freeze between requests and
	// many may run at once, so the scheduled refresh route does this instead.
	if os.Getenv("VERCEL") == "" {
		go api.RunCatalogRefresh(ctx)
	}

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           api.Handler(),
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
