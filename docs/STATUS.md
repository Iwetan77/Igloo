# Status — data layer (schema, content, docs)

Progress notes for the `supabase/`, `content/`, and `docs/` work. Branch: `data`.

## Done

- `supabase/migrations/0001_init.sql` — full schema (`users`, `posts`,
  `comments`, `likes`, `shares`, `positions_cache`) plus Realtime enabled on
  `comments` and `likes`.
- `content/categories.json` — category list. See note 1.
- `content/copy.json` — UI copy. All required keys plus two extras (note 3).
- `content/seed-posts.json` — 10 fallback posts.
- `README.md` — local setup instructions.
- `docs/DEMO_SCRIPT.md` — step-by-step demo walkthrough.

## Notes

### 1. Categories — real Panta data, but test keys return sandbox fixtures

I registered a throwaway Panta account, minted a `pk_test_` key, and hit the
categories endpoint. Two things worth knowing:

- The live endpoint is `GET /api/v1/categories/` (trailing slash required). The
  `GET /markets/categories` path from the design notes doesn't return a list.
- A `pk_test_` key returns a sandbox fixture with only four slugs —
  `crypto`, `politics`, `sports`, `entertainment` — and a `"disclaimer"` saying
  it's test mode.
- Panta's docs list the full production allowlist of eight slugs: `sports`,
  `crypto`, `politics`, `entertainment`, `finance`, `science`, `world`, `other`.

I wrote all eight documented slugs into `content/categories.json` as
`{ "id": <slug>, "label": <Title Case> }`. `id` holds the slug to pass to
Panta's `category` params; `label` is for display.

### 2. Seed-post `category` casing

`content/seed-posts.json` uses title-case categories (e.g. `"Crypto"`) to match
the example shape, while `categories.json` uses lowercase slugs as `id`. If the
backend needs seed-post `category` to match the Panta slug (`"crypto"`) instead,
that's a one-line change.

### 3. `copy.json` extra keys

Added two keys beyond the required set:

- `comments.empty` — shown when a post has no comments.
- `error.generic` — generic fallback error message.

### 4. Migration not verified locally

The schema is copied straight from the spec, but I couldn't run
`supabase db reset` here (no Supabase CLI / Docker in this environment), so the
migration hasn't been applied against a fresh local stack yet. Worth running
once before relying on it.
