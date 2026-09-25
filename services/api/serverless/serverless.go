// Package serverless exposes the API as one http.Handler for serverless
// hosts. It exists because Vercel's Go builder recompiles api/index.go under
// its own module path, which Go forbids from importing internal/ packages;
// this public package is allowed to, and api/index.go imports only it.
package serverless

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"sync"

	"github.com/Iwetan77/Igloo/services/api/internal/app"
	"github.com/Iwetan77/Igloo/services/api/internal/config"
)

var (
	once    sync.Once
	handler http.Handler
	initErr error
)

func setup() {
	log := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	cfg, err := config.Load()
	if err != nil {
		initErr = err
		log.Error("config", "err", err)
		return
	}
	api, _, err := app.Build(context.Background(), cfg, log)
	if err != nil {
		initErr = err
		log.Error("startup", "err", err)
		return
	}
	// No background catalog loop: serverless instances freeze between
	// requests. The scheduled refresh route keeps markets_cache current.
	handler = api.Handler()
}

// ServeHTTP builds the API once per instance and serves the request with it.
func ServeHTTP(w http.ResponseWriter, r *http.Request) {
	once.Do(setup)
	if initErr != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"code":"STARTUP_FAILED","message":"the API could not start; check the deployment's environment variables"}`))
		return
	}
	handler.ServeHTTP(w, r)
}
