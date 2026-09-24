# Igloo — DeepSeek (data) Status

Owner: DeepSeek builder. Branch: `deepseek/data`. Owned paths: `supabase/`,
`content/`, `docs/` (except `docs/panta-notes.md`, written by Claude).

## Progress

| Task | Deliverable | Status |
| --- | --- | --- |
| 1 | `supabase/migrations/0001_init.sql` | Done — schema copied verbatim from contract §2 + Realtime on `comments`, `likes` |
| 2 | `content/categories.json` | Done — see note below on real vs. placeholder |
| 3 | `content/copy.json` | Done — all required keys + 2 extra |
| 4 | `content/seed-posts.json` | Done — 10 posts |
| 5 | `README.md` | Done |
| 6 | `docs/DEMO_SCRIPT.md` | Done |

## Flags for Agba / other builders

### 1. Categories: real Panta data, but test-key returns sandbox fixtures
I registered a throwaway Panta account and minted a `pk_test_` key, then called
the categories endpoint. Two findings:

- The **actual endpoint is `GET /api/v1/categories/`** (trailing slash), not
  `GET /markets/categories` as written in the contract §2/§5. `/markets/categories`
  returns a 401-style fixture market object, not a list.
- With a `pk_test_` key the response is a **sandbox fixture** — only four slugs:
  `["crypto", "politics", "sports", "entertainment"]` — with a `"disclaimer":
  "Test mode: this response uses sandbox fixtures ..."` field.
- The official docs `ResponseExample` lists the full production allowlist of
  **eight** slugs: `sports, crypto, politics, entertainment, finance, science,
  world, other`.

I wrote all **eight** documented slugs into `content/categories.json` as
`{ "id": <slug>, "label": <Title Case> }`. This is real Panta category data (from
their docs), not a made-up placeholder — but it is **not** what the `pk_test_`
key returns at runtime. The `id` values are the slugs to pass to create-quote
`category` and list `category` query.

### 2. Seed-post `category` casing ambiguity
`content/seed-posts.json` uses title-case categories (e.g. `"Crypto"`) to match
the contract's own example (`"category": "Crypto"`), while `categories.json`
uses lowercase slugs as `id`. If the backend needs seed-post `category` to match
the Panta slug (`"crypto"`) instead of the label, that's a one-line change — I
didn't do it because the contract example literally shows `"Crypto"`. Flagging
rather than guessing.

### 3. `copy.json` — extra keys added (for ChatGPT's builder)
Beyond the required keys I added two:
- `comments.empty` — shown when a post has no comments.
- `error.generic` — generic fallback error message.

## Blocked on

Nothing. I built purely against the contract shapes (schema + content) and do
not depend on `apps/web/` or `services/api/`.

## Notes

- `.env.example` files are owned by the app owners (ChatGPT for `apps/web`,
  Claude for `services/api`); I did not create them.
- `docs/panta-notes.md` is Claude's; I did not create it.
