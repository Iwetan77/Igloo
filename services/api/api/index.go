// Package handler is the Vercel entry point: Vercel runs Handler for every
// request (see vercel.json). The server is built once per instance and
// reused while the instance stays warm.
package handler

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
	// No background catalog loop here: serverless instances freeze between
	// requests. The scheduled refresh route keeps markets_cache current.
	handler = api.Handler()
}

// Handler serves every API route.
func Handler(w http.ResponseWriter, r *http.Request) {
	once.Do(setup)
	if initErr != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"code":"STARTUP_FAILED","message":"the API could not start; check the deployment's environment variables"}`))
		return
	}
	handler.ServeHTTP(w, r)
}
