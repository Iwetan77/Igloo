# Status — data layer (schema, content, docs)

Progress notes for the `supabase/`, `content/`, and `docs/` work. Branch: `data`.

## Done

- `supabase/migrations/0001_init.sql` — full schema (`users`, `posts`,
  `comments`, `likes`, `shares`, `positions_cache`) plus Realtime on `comments`
  and `likes`. Verified applying cleanly to Postgres 18 and the live project.
- `supabase/migrations/0002_rls.sql` — row-level security on all six tables plus
  public-read policies on `comments` and `likes` (matching what was run by hand).
- `content/categories.json` — 15 categories (see note 1).
- `content/copy.json` — UI copy (required keys plus `comments.empty` and
  `error.generic`).
- `content/seed-posts.json` — 4 posts backed by real Panta markets (note 2).
- `README.md` — local setup, updated for mainnet-only Panta and the pooler
  `DATABASE_URL` (note 3).
- `docs/DEMO_SCRIPT.md` — demo walkthrough; buy flow is show-only (note 3).

## Notes

### 1. Categories

Live Panta markets use slugs beyond the eight in Panta's own docs example. Added
`weather`, `stocks`, `commodities`, `pop-culture`, `gaming`, `business`, and
`macroeconomics` (with labels). The full list is 15 slugs, sorted alphabetically,
stored as `{ "id": <slug>, "label": <Title Case> }`.

### 2. Seed posts — real Panta market IDs

Replaced the fake `demo-*` IDs with four real markets (fetched with a `pk_live_`
key):

- `GXh9iztJTm5v6qDWnR4YcKHbSc3AUZ2VEMGfKEegd92V` — "Will GTA 6 release on
  November 19th, 2026" (`gaming`).
- `BpPmo7wHrh8bi3ea2ohiVy64sxEnSTufx67zTA9ntnfT` — "Will $ANSEM reach a $1B
  market cap by December 31, 2026?" (`crypto`).
- `1Nm7PCxoHUwGk1J9NoSfy26TQZkitwDf6mamFTZDn1r` — "Will Bitcoin (BTC) be priced
  at $81,000.00 or higher on Tuesday, September 8, 2026, at 12:00 PM UTC?"
  (`crypto`).
- `C2XGH1Z6YivhXMqRRBhKDHnFZTAoqkRcwBFTEZ7bdUrr` — "Will Witty Cruz top The
  Pantas FPL Leaderboard by end of GW3?" (`sports`).

Two quirks worth knowing:

- Panta's API returns `category: "sports"` for the two crypto markets (likely a
  catalog mislabel); the seed posts use the semantically correct `crypto`.
- Some markets have an empty `title`/`description` in the API response (the
  Bitcoin question lives in `description`; the $ANSEM and FPL questions were
  supplied by the team). Seed posts carry the correct question text regardless.

### 3. README / demo script corrections

- Panta runs on Solana mainnet only — no mock mode, buys spend real USDC.
- The backend's `DATABASE_URL` must use the Supabase transaction pooler
  (port `6543`, `?sslmode=require`); port `5432` times out on TLS.
- Migration order is `0001_init.sql` then `0002_rls.sql`.
- No Panta market currently accepts buys (opening-sale phase only), so the demo
  script shows the buy sheet without completing a purchase.
