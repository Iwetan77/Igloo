// Package handler is the Vercel entry point: Vercel runs Handler for every
// request (see vercel.json). The API itself is built in package serverless.
package handler

import (
	"net/http"

	"github.com/Iwetan77/Igloo/services/api/serverless"
)

// Handler serves every API route.
func Handler(w http.ResponseWriter, r *http.Request) { serverless.ServeHTTP(w, r) }
