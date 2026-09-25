# Igloo

Prediction-market social feed: watch short video takes on real prediction
markets, trade YES/NO, and discuss them in comments.

This README covers how to get the app running locally. See `docs/` for the demo
script and status notes.

## Prerequisites

- Node.js 20+ (and `npm`)
- Go 1.22+
- Supabase CLI (`supabase`) — for applying migrations and running a local stack
- A Supabase project (hosted or local) — for Postgres + Realtime
- A Privy app with **Solana embedded wallets enabled** — for sign-in and trading

## Repo layout

```
apps/web/      Next.js frontend (TypeScript)
services/api/  Go backend (the only code that talks to Panta and Supabase)
supabase/      SQL migrations
content/       Static JSON (categories, UI copy, seed posts)
docs/          README-adjacent docs and demo script
```

## 1. Create the Supabase project and apply migrations

Create a Supabase project first (hosted or local). Migrations live in
`supabase/migrations/` and run in order — `0001_init.sql` (schema),
`0002_rls.sql` (row-level security), `0003_storage.sql` (storage bucket). Then
run `supabase/seed.sql` once to load demo data.

```bash
# local Supabase stack
supabase start
supabase db reset        # applies supabase/migrations/*.sql in order

# or, against a hosted project
supabase link --project-ref <your-project-ref>
supabase db push
```

`0001` creates the `users`, `posts`, `comments`, `likes`, `shares`, and
`positions_cache` tables and enables Realtime on `comments` and `likes`.
`0002` enables row-level security on those tables and allows public reads on
`comments` and `likes` (the backend connects as the database owner and bypasses
RLS — this only locks down the browser's anon key).
`0003` creates the `videos` storage bucket. Uploads go through backend-signed
URLs, so no `storage.objects` policies are added on purpose.

For a non-empty feed, run `supabase/seed.sql` in the Supabase SQL editor — it
inserts a demo user, the four seed posts, and a couple of comments and likes
(safe to run twice).

## 2. Run the backend (`services/api`)

```bash
cd services/api
cp .env.example .env   # then fill in the values (see .env.example notes)
go run ./...
```

The API listens on its default port (see `services/api/.env.example`) and serves
`/api/v1/...`.

Video uploads go through the backend: `POST /api/v1/uploads/video` returns a
signed URL, the client uploads the file to that URL, then calls `POST /posts`
with the resulting `video_url`.

## 3. Run the frontend (`apps/web`)

```bash
cd apps/web
cp .env.example .env.local   # then fill in the values (see .env.example notes)
npm install
npm run dev
```

Open the printed localhost URL. The frontend calls the backend at
`NEXT_PUBLIC_API_BASE_URL` — point it at the running `services/api` instance.
In dev the backend is often exposed through a temporary Cloudflare tunnel whose
URL can change, so update `NEXT_PUBLIC_API_BASE_URL` to whatever the current
tunnel URL is.

## 4. Environment variables

Each app has a `.env.example` in its own directory:

- `apps/web/.env.example` — `NEXT_PUBLIC_PRIVY_APP_ID`,
  `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SOLANA_RPC_URL`.
- `services/api/.env.example` — `PANTA_API_KEY`, `PANTA_BASE_URL`,
  `PANTA_MODE`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`,
  `SOLANA_RPC_URL`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`.

These are the exact variable names the apps read — don't rename them.

Notes:

- Panta runs on **Solana mainnet only** — there is no mock mode, and buys spend
  real USDC.
- Set `DATABASE_URL` to the Supabase **transaction pooler** URL (port `6543`),
  with `?sslmode=require`. The direct connection port (`5432`) times out on TLS.

## 5. Run everything side by side

```bash
# terminal 1
supabase start && supabase db reset

# terminal 2
cd services/api && go run ./...

# terminal 3
cd apps/web && npm run dev
```

If the live feed is empty or Panta is unreachable, the backend can fall back to
`content/seed-posts.json` for local demo data.
