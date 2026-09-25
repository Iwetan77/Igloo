# Status — data layer (schema, content, docs)

Progress notes for the `supabase/`, `content/`, and `docs/` work. Branch: `data`.

## Done

- `supabase/migrations/0001_init.sql` — full schema (`users`, `posts`,
  `comments`, `likes`, `shares`, `positions_cache`) plus Realtime on `comments`
  and `likes`. Verified applying cleanly to Postgres 18 and the live project.
- `supabase/migrations/0002_rls.sql` — row-level security on all six tables plus
  public-read policies on `comments` and `likes`.
- `supabase/migrations/0003_storage.sql` — `videos` storage bucket (idempotent),
  no `storage.objects` policies.
- `supabase/migrations/0004_quote_posts.sql` — `posts.quoted_post_id` (null =
  original) plus an index; quote/stitch posts, `on delete set null`.
- `supabase/migrations/0005_social_and_ranking.sql` — `user_interests`, `follows`,
  `post_views`, `markets_cache`, plus ranking indexes; backend-only (RLS on, no
  policies).
- `supabase/migrations/0006_profiles.sql` — username/bio/avatar on `users`
  (with constraints), `avatars` storage bucket, and `markets_cache.end_time`.
- `supabase/seed.sql` — idempotent demo data (demo user marked onboarded with
  interests, username `igloo` + bio, 8 seed posts + 2 quote posts, 2 comments,
  2 likes). Not run here; the owner runs it in the SQL editor.
- `content/categories.json` — 15 categories (note 1).
- `content/copy.json` — UI copy, onboarding/tab/profile labels, and backend
  error-code messages (note 3).
- `content/seed-posts.json` — 8 posts backed by real Panta markets, with real,
  playable seed videos (notes 2 and 4).
- `README.md` / `docs/DEMO_SCRIPT.md` — setup and walkthrough (note 5).

## Notes

### 1. Categories

Live Panta markets use slugs beyond the eight in Panta's own docs example. Added
`weather`, `stocks`, `commodities`, `pop-culture`, `gaming`, `business`, and
`macroeconomics` (with labels). The full list is 15 slugs, sorted alphabetically,
stored as `{ "id": <slug>, "label": <Title Case> }`.

### 2. Seed posts — real Panta market IDs

Panta currently has only **five genuinely live markets** (the rest are finished
June–August events whose labels Panta hasn't updated). The seed posts are built
from these five, with multiple takes and quote posts to reach 9 total posts:

- `GXh9iztJTm5v6qDWnR4YcKHbSc3AUZ2VEMGfKEegd92V` — "Will GTA 6 release on
  November 19th, 2026" (`gaming`).
- `BpPmo7wHrh8bi3ea2ohiVy64sxEnSTufx67zTA9ntnfT` — "Will $ANSEM reach a $1B
  market cap by December 31, 2026?" (`crypto`).
- `1Nm7PCxoHUwGk1J9NoSfy26TQZkitwDf6mamFTZDn1r` — "Will Bitcoin (BTC) be priced
  at $81,000.00 or higher on Tuesday, September 8, 2026, at 12:00 PM UTC?"
  (`crypto`).
- `C2XGH1Z6YivhXMqRRBhKDHnFZTAoqkRcwBFTEZ7bdUrr` — "Will Witty Cruz top The
  Pantas FPL Leaderboard by end of GW3?" (`sports`).
- `69A5oC4BXuHC1hG6EVpLZbgSH4GQGVBMgQKwHz3YhbZk` — "Will Bitcoin drop below 58k
  in 2026?" (`crypto`).

`seed-posts.json` holds 8 originals (second takes on GTA 6, $ANSEM, and
Bitcoin-58k); `seed.sql` adds 2 quote posts (of GTA 6 and $ANSEM) for 10 total.
Quirk: Panta mislabels several markets' `category` as `"sports"`; the seed posts
use the semantically correct category.

### 3. copy.json

Added the backend error-code messages so the frontend can map codes to copy:
`MARKET_NOT_IN_PRIMARY`, `AMOUNT_TOO_SMALL`, `QUOTE_EXPIRED`, `QUOTE_STALE`,
`WALLET_NOT_LINKED`, `USER_NOT_SYNCED`, `RATE_LIMITED`, and `UPSTREAM` (covers
`PANTA_*` / `PRIVY_UNAVAILABLE` / `STORAGE_UNAVAILABLE`).

Also added onboarding copy (`onboarding.title`, `onboarding.subtitle`,
`onboarding.pick_minimum`, `onboarding.continue`), tab names (`tab.for_you`,
`tab.following`, `tab.markets`), empty states (`following.empty`,
`market.posts.empty`), and profile labels (`profile.followers`,
`profile.following`, `profile.friends`, `profile.follow`, `profile.unfollow`).
Existing keys unchanged.

### 4. Seed videos — real, playable, openly licensed

The `placeholder-video-url` links resolved to nothing, so each seed post now uses
a short, openly licensed MP4 (verified HTTP 200, `video/*`):

| Seed post | URL | Licence / source |
| --- | --- | --- |
| GTA 6 | `https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4` | Sintel trailer, © Blender Foundation, CC BY 3.0 — https://durian.blender.org/ |
| $ANSEM | `https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4` | Big Buck Bunny, © Blender Foundation, CC BY 3.0 — https://peach.blender.org/ |
| Bitcoin | `https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_1MB.mp4` | Sintel, © Blender Foundation, CC BY 3.0 — https://durian.blender.org/ |
| FPL | `https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4` | Big Buck Bunny, © Blender Foundation, CC BY 3.0 — https://peach.blender.org/ |

The quote post in `seed.sql` reuses the same family: `Big_Buck_Bunny_1080_10s_1MB.mp4`
(Big Buck Bunny, © Blender Foundation, CC BY 3.0).

### 5. README / demo script corrections

- Panta runs on Solana mainnet only — no mock mode, buys spend real USDC.
- Backend `DATABASE_URL` must use the Supabase transaction pooler (port `6543`,
  `?sslmode=require`); port `5432` times out on TLS.
- Backend run command is `go run .` (not `go run ./...`), and it reads env vars,
  so source `.env` first: `set -a && . ./.env && set +a && go run .`.
- Setup order: `0001` → `0002` → `0003` → `0004` → `0005` → `0006`, then
  `seed.sql`.
- Video uploads go through the backend: `POST /api/v1/uploads/video` → upload to
  the returned signed URL → `POST /posts`.
- Privy needs Solana embedded wallets enabled.
- The dev backend is exposed through a temporary Cloudflare tunnel whose URL can
  change.
- No Panta market currently accepts buys (opening-sale phase only), so the demo
  script shows the buy sheet without completing a purchase.
