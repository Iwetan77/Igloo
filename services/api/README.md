# services/api

Go backend for Igloo. Implements the `/api/v1` routes on top of live Panta (Solana mainnet)
and the Supabase Postgres schema in `supabase/migrations`.

## Run

```bash
cp .env.example .env   # fill in values
set -a; . ./.env; set +a
go run .
```

`GET /healthz` returns `{"status":"ok"}` once the database is reachable.

## Deploy (Koyeb free instance)

1. Koyeb → **Create Web Service** → **GitHub** → repo `Iwetan77/Igloo`, branch `main` (or `backend`).
2. Builder: **Dockerfile**. Set the work directory to `services/api` and the Dockerfile path to `Dockerfile`.
3. Instance: **Free**, region **Frankfurt**, which sits next to the Supabase `eu-central-1` database.
4. Port: `8080`, protocol HTTP, public path `/`. Health check: HTTP `/healthz`.
5. Environment variables (copy the values from your local `.env`; mark the secrets as Koyeb secrets):
   `PANTA_API_KEY`, `PANTA_BASE_URL`, `PANTA_MODE=live`, `DATABASE_URL`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SOLANA_RPC_URL`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`,
   `AUTH_MODE=privy`, `PORT=8080`.
6. Deploy. The frontend's `NEXT_PUBLIC_API_BASE_URL` becomes `https://<service>.koyeb.app/api/v1`.

Free instances sleep after an hour without traffic; the first request after that takes a few
seconds. Buy sessions live in memory, so keep a single instance (the free tier only allows one).

## Layout

- `main.go` wires config, store, Panta client, auth and the HTTP server.
- `internal/config` loads and validates the environment.
- `internal/panta` is the typed Panta client. `CompileUnsignedTx` turns Panta's
  instruction lists into an unsigned v0 transaction for the wallet to sign.
- `internal/store` holds the Postgres queries for users, posts, comments, likes and shares.
- `internal/auth` verifies Privy access tokens (ES256, JWKS from `auth.privy.io`).
- `internal/httpapi` has the route handlers.

## Buy flow

1. `POST /orders/quote`: the wallet is the signed-in user's, or `wallet_address` in the body.
2. `POST /orders/build` returns `unsigned_tx_base64`. The client deserializes it as a
   `VersionedTransaction`, signs it with the user's wallet, and broadcasts it on its own RPC.
3. `POST /orders/submit` with the broadcast signature.
4. Poll `GET /orders/verify?signature=` until `confirmed` or `failed`.

The quote → order mapping lives in process memory, so run a single instance.

## Video uploads

1. `POST /uploads/video` (auth) with `{ "content_type": "video/mp4" | "video/webm" | "video/quicktime" }`
   returns `{ path, token, upload_url, public_url }`.
2. The browser uploads with `supabase.storage.from("videos").uploadToSignedUrl(path, token, file)`.
3. `POST /posts` with `video_url: public_url`.

The `videos` bucket is public-read with no anon write policy. Only backend-signed URLs can
upload. This needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; without them the route returns 503.

## Tests

`go test ./...` runs everything. The store tests start a real Postgres (embedded-postgres) and
apply `supabase/migrations/*.sql` from the repo root. Point `IGLOO_MIGRATIONS_DIR` elsewhere
if needed, or use `-short` to skip them.

## Rate limits

Per signed-in user, counted only for valid writes. Over the limit returns
`429 {"code":"RATE_LIMITED"}` with a `Retry-After` header (seconds).

| Action | Limits |
|---|---|
| `POST /posts` | 5 per 10 min, 20 per day |
| `POST /posts/:id/comments` | 10 per minute, 200 per day |
| `POST /uploads/video` | 3 per 10 min, 10 per day (≤ 500 MB/day at the 50 MB cap) |

Counters live in memory, so they reset when the service restarts.

## Errors

Every error is `{ "code": "...", "message": "...", "fields"?: {...} }`. Panta's business
codes pass through unchanged (`QUOTE_EXPIRED`, `QUOTE_STALE`, `AMOUNT_TOO_SMALL`,
`MARKET_NOT_FOUND`, `MARKET_NOT_IN_PRIMARY`, `NOT_CLAIMABLE`, `RATE_LIMITED`, ...).
Upstream outages become `502`.
