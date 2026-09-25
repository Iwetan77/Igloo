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

## Deploy (Vercel, free)

The API runs as one Vercel Go function (`api/index.go`) that serves every route; `vercel.json`
rewrites all paths to it, pins the region to `fra1` (Frankfurt, next to the Supabase database),
allows 60 s per request, and schedules a daily catalog refresh.

1. Apply migrations through `0007_serverless_state.sql` (order sessions and rate limits live in
   Postgres, because each request may hit a different instance).
2. Vercel → **Add New Project** → import `Iwetan77/Igloo` → **Root Directory:** `services/api`.
   Framework preset: **Other**. No build command is needed.
3. Environment variables: `PANTA_API_KEY`, `PANTA_BASE_URL`, `PANTA_MODE=live`, `DATABASE_URL`
   (transaction pooler, port 6543, `?sslmode=require`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SOLANA_RPC_URL`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `AUTH_MODE=privy`, and `CRON_SECRET`
   (a long random string).
4. Deploy, then open `https://<project>.vercel.app/healthz`.
5. For refreshes every 30 minutes, add the repository secrets `IGLOO_API_URL`
   (`https://<project>.vercel.app`) and `CRON_SECRET`. The workflow in
   `.github/workflows/refresh-catalog.yml` runs from the default branch.

Each refresh call discovers markets for up to 40% of a 50 s budget, then refreshes the stalest
market details, 3 at a time under Panta's rate limit (about 50 markets per call).

`main.go` still runs the same API as a long-lived server (`go run .` or the Dockerfile); it
refreshes the catalog in-process every 15 minutes.

## Layout

- `main.go` runs the API as a long-lived server; `api/index.go` is the Vercel function. Both
  build it with `internal/app`.
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

Quote sessions live in Postgres (`order_sessions`), so any instance can serve any step.

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

## Feeds, markets and people

Needs migrations `0005_social_and_ranking.sql` (`user_interests`, `follows`, `post_views`,
`markets_cache`, `users.onboarded_at`) and `0006_profiles.sql` (`users.username/bio/avatar_url`,
the `avatars` bucket, `markets_cache.end_time`). Profiles and authors include `username`,
`avatar_url` and `likes_received`; markets include `end_time`, and the Markets tab hides ended ones.

Feed market data is served from `markets_cache`; rows older than 60 s refresh from Panta in the
background, so only a never-seen market makes a request wait on Panta.

| Route | Notes |
|---|---|
| `GET /me` (auth) | `{...user, onboarded, interests[], follower_count, following_count}` |
| `PUT /me/interests` (auth) | `{categories:[slugs]}` (1–20), marks the user onboarded, returns `/me` |
| `PATCH /me` (auth) | `{username?, display_name?, bio?, avatar_url?}`; `""` clears (not username). Usernames are lowercased, 3–20 of `a-z0-9_.` → `400 INVALID_USERNAME` / `409 USERNAME_TAKEN`; bio ≤ 160; `avatar_url` must be the caller's own upload from `/uploads/avatar` |
| `POST /uploads/avatar` (auth) | `{content_type: image/jpeg|png|webp}` → signed upload into the public `avatars` bucket (2 MB) |
| `GET /usernames/:username` | Profile by username (case-insensitive) |
| `GET /me/liked` (auth) | Feed-shaped posts the caller liked; private to the caller |
| `GET /feed?tab=for_you` (default) | Ranked; the cursor pins the session so pages don't reshuffle |
| `GET /feed?tab=following` (auth) | Newest posts by people you follow |
| `GET /feed?market_id=` | Newest posts on one market |
| `GET /markets?category=&cursor=` | Open markets that have a question, markets with posts first |
| `GET /markets/:id` | One market (cached, refreshed from Panta when older than a minute) |
| `GET /users/:id`, `GET /users/:id/posts` | Profile with `is_following`, `follows_me`, `is_friend` (mutual) |
| `GET /users/search?q=` | Display-name search, 2–64 chars |
| `POST` / `DELETE /users/:id/follow` (auth) | `{following, follower_count}`; 30/min |
| `POST /events/view` (auth) | `{post_id, watch_ms, completed}` → 204; 300/min |

**Markets catalog.** Panta's listing loops and leaves titles blank, so a background job
(at startup, then every 15 min) unions several filtered listings plus every posted market, fetches
each market's detail (0.7 s apart to stay under Panta's rate limit), and upserts `markets_cache`.
Blank fields from Panta never overwrite known values. Markets whose question names a coin
(Bitcoin, ETH, `$TICKER`, …) are filed under `crypto`, because Panta labels some of them `sports`.

**For You ranking** (`internal/rank`). This looks at up to 500 posts from the last 30 days,
excluding the viewer's own. Each post is scored on:
- interest match: onboarding picks plus learned weights, from views ≥ 3 s, completions, likes, comments, shares and quotes, capped at 5 per category
- following, and friends on top of that
- likes from people you follow
- log-damped engagement
- freshness (36 h half-life)
- how contested the market is (near 50/50)
- per-session jitter
- penalties for already seen and already finished posts

The list is then arranged so the same author or market doesn't repeat back to back, and every
10th slot goes to an out-of-interest post. Weights live in `rank.Default`.

## Quote posts

`POST /posts` with `quoted_post_id` creates a quote of an existing post. The quote always
stays on the original's market: `panta_market_id` may be omitted (it's copied), and a
different one is `400 QUOTE_MARKET_MISMATCH`. An unknown original is `404 QUOTED_POST_NOT_FOUND`.
`/feed` returns `quoted_post` (`{id, video_url, caption, created_at, author{id, display_name}}`,
or `null`) and `quote_count` on every post. This needs migration `0004_quote_posts.sql`
(`posts.quoted_post_id`, `on delete set null`). Quotes count toward the post rate limit.

## Rate limits

Per signed-in user, counted only for valid writes. Over the limit returns
`429 {"code":"RATE_LIMITED"}` with a `Retry-After` header (seconds).

| Action | Limits |
|---|---|
| `POST /posts` | 5 per 10 min, 20 per day |
| `POST /posts/:id/comments` | 10 per minute, 200 per day |
| `POST /uploads/video` | 3 per 10 min, 10 per day (≤ 500 MB/day at the 50 MB cap) |

Counters live in Postgres (`rate_events`), shared by every instance; concurrent requests for one
user are serialised with an advisory lock, so two instances can't both let the limit-breaking
request through. If the limiter's database call fails, requests are allowed (fail open).

## Errors

Every error is `{ "code": "...", "message": "...", "fields"?: {...} }`. Panta's business
codes pass through unchanged (`QUOTE_EXPIRED`, `QUOTE_STALE`, `AMOUNT_TOO_SMALL`,
`MARKET_NOT_FOUND`, `MARKET_NOT_IN_PRIMARY`, `NOT_CLAIMABLE`, `RATE_LIMITED`, ...).
Upstream outages become `502`.
