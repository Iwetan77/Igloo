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

## Repo layout

```
apps/web/      Next.js frontend (TypeScript)
services/api/  Go backend (the only code that talks to Panta and Supabase)
supabase/      SQL migrations
content/       Static JSON (categories, UI copy, seed posts)
docs/          README-adjacent docs and demo script
```

## 1. Apply the database migrations

Migrations live in `supabase/migrations/`. Apply them to your Supabase project:

```bash
# local Supabase stack
supabase start
supabase db reset        # applies supabase/migrations/*.sql against local DB

# or, against a hosted project
supabase link --project-ref <your-project-ref>
supabase db push
```

This creates the `users`, `posts`, `comments`, `likes`, `shares`, and
`positions_cache` tables and enables Realtime on `comments` and `likes`.

## 2. Run the backend (`services/api`)

```bash
cd services/api
cp .env.example .env   # then fill in the values (see .env.example notes)
go run ./...
```

The API listens on its default port (see `services/api/.env.example`) and serves
`/api/v1/...`.

## 3. Run the frontend (`apps/web`)

```bash
cd apps/web
cp .env.example .env.local   # then fill in the values (see .env.example notes)
npm install
npm run dev
```

Open the printed localhost URL. The frontend calls the backend at
`NEXT_PUBLIC_API_BASE_URL` — point it at the running `services/api` instance.

## 4. Environment variables

Each app has a `.env.example` in its own directory:

- `apps/web/.env.example` — `NEXT_PUBLIC_PRIVY_APP_ID`,
  `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SOLANA_RPC_URL`.
- `services/api/.env.example` — `PANTA_API_KEY`, `PANTA_BASE_URL`,
  `PANTA_MODE` (`live` or `mock`), `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SOLANA_RPC_URL`, `PRIVY_APP_ID`,
  `PRIVY_APP_SECRET`.

The variable names are fixed by the shared contract — don't rename them. Set
`PANTA_MODE=mock` to develop without a live Panta account.

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
