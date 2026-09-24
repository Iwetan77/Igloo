# services/api — STATUS

Branch: `backend`.

## Open issues

1. **Every Panta trade is real mainnet money.** Details are in `docs/panta-notes.md`. Panta
   has no devnet. `pk_test_` keys return canned fixtures that touch no chain. Per your
   instruction, **nothing is mocked**. The service runs only against live Panta and requires
   a `pk_live_` key. `PANTA_MODE` is still read, but only `live` is
   accepted.
2. **Right now no mainnet market is open for buying.** The quote calls do hit real mainnet
   markets on live Panta, and Panta refuses them. Rechecked 2026-09-24 ~23:30 WAT. The
   unfiltered `GET /markets/` loops on the same 50 rows, but filtered queries (`status=`,
   `phase=`, `category=`) turn up 96 unique markets, 14 of them labelled `primary`. I quoted
   all 14 for 1 USDC directly against Panta:
   - 2 are devnet leftovers: `MARKET_NOT_FOUND`.
   - 7 return `MARKET_NOT_IN_PRIMARY`.
   - 5 return `INVALID_MARKET_PARAMS`.

   The 12 mainnet ones are sports fixtures that started in July 2026. The catalog label is
   stale, and Panta's own buy endpoint won't sell into them. Everything else is secondary,
   resolved or cancelled, and Panta's API only supports primary buys. So a successful
   quote → build needs a market that is actually in its primary phase: a new Panta listing,
   or one we create (costs real USDC).
3. **`/users/sync` is unauthenticated per the API spec.** Anyone who knows a Privy user id can
   rebind that user's wallet and display name. The backend enforces a match whenever a token
   *is* sent. I recommend making the route require auth and having the frontend
   always send the token.

## Additions beyond the original API spec

| What | Why |
|---|---|
| New env var `DATABASE_URL` (required) | The plan was to talk to Postgres directly with `SUPABASE_SERVICE_ROLE_KEY`, but a service-role key can't open a Postgres connection. That needs the DB connection string. |
| New env var `AUTH_MODE` (`privy` default, or `dev`) | `dev` accepts `Bearer dev:<privy_user_id>` so routes can be tested with curl without a Privy login. It logs a warning at startup. Never set it in a deployed env. |
| New env var `PORT` (default 8080) | Standard. |
| `POST /orders/quote` also accepts an optional `wallet_address` | Panta needs the buyer wallet at quote time and the spec'd body has none. If a valid Bearer token for a synced user is sent, that user's wallet is used and `wallet_address` can be omitted. Frontend: just send the token. |
| Protected routes return `403 USER_NOT_SYNCED` | Valid token, but `/users/sync` hasn't been called for that Privy user yet. Bad or missing token is `401`. |

## Concrete types the spec left open

- Prices, shares and fees are JSON **numbers** (`yes_price`, `no_price`, `fee_usdc`,
  `estimated_shares`, `shares`). `usdc_amount` accepts a number or numeric string.
- `side` is `"YES"`/`"NO"` in and out (including `/positions`).
- `market` in `/feed` is always an object, but any field can be `null`. Live Panta often has
  an empty question and no spot price, intermittently. The same market showed
  `question: ""` / prices `null` on one call and a real question and prices a minute later.
  If Panta is unreachable, every field is null. **Frontend needs a fallback for a null question.**
- `next_cursor` is an opaque string, or `null` on the last page. `limit` defaults to 10, max 50.
- Errors: `{ "code", "message"?, "fields"? }`. Panta codes pass through.
- `POST /posts` and `POST /posts/:id/comments` return **201**. Everything else succeeds with 200.
- `POST /posts` checks that `panta_market_id` exists on Panta (404 `MARKET_NOT_FOUND` otherwise).
- Stretch routes use snake_case: `/markets/quote` takes `{question, resolution_rule,
  sources_of_truth[], category, start_time, end_time, resolution_time, image_url,
  market_type?, title?, description?}` and returns `{create_id, expected_panta_market_id,
  fee_usdc, expires_at}`. `/markets/build {create_id}` returns `{create_id, unsigned_tx_base64,
  expected_panta_market_id}`. `/markets/register {create_id, signature}` returns
  `{panta_market_id, status}`. `/claims/build {panta_market_id}` returns
  `{winning_shares, unsigned_tx_base64}`. The wallet is always the signed-in user's.

## Phases

| Phase | State |
|---|---|
| 0 Panta spike | Done. One step was substituted (see below). Verdict: mainnet only. |
| 1 Skeleton | Gate passed. |
| 2 Panta proxy | Code done. Gate partly met: no live market accepts a quote (flag 2). |
| 3 App endpoints | Gate passed against real Postgres running the Supabase migration. |
| 4 Stretch | Code done. Only error paths verified, because success paths spend real USDC. |

### Phase 0
See `docs/panta-notes.md`. Step 3 ("decode a Panta-built tx") couldn't run as written.
`pk_test_` builds have no instructions, no live market accepts quotes, and a live
create-market build was blocked by this session's real-funds permission policy. I established
the network read-only from on-chain data instead: market accounts and a market's creation
transaction, checked against both clusters.

### Phase 1 gate
- `go build ./... && go vet ./...`: clean.
- Server started against Postgres 18 (embedded-postgres, a real server binary) with
  `supabase/migrations/0001_init.sql` from `origin/data` applied unmodified. I pre-created the
  `supabase_realtime` publication, which Supabase provides. `GET /api/v1/feed` returned
  `{"next_cursor":null,"posts":[]}` with 200.

### Phase 2 gate (live Panta, pk_live_ key)
```
POST /orders/quote  {EWiohz3L… (catalog "primary", devnet-only), YES, 1}   -> 404 {"code":"MARKET_NOT_FOUND"}
POST /orders/quote  {GXh9iztJ… (mainnet, secondary), NO, "1.00", wallet}  -> 400 {"code":"MARKET_NOT_IN_PRIMARY"}
POST /orders/quote  (no token, no wallet_address)                        -> 400 WALLET_REQUIRED
POST /orders/quote  side "MAYBE"                                         -> 400 INVALID_SIDE
POST /orders/build  {quote_id:"qt_nope"}                                 -> 400 QUOTE_EXPIRED
GET  /positions?wallet_address=G7PExRdw… (real holder)
     -> 200 {"positions":[{"panta_market_id":"GXh9…","side":"YES","shares":5,"phase":"secondary","claimable":false},
                          {"panta_market_id":"GXh9…","side":"NO","shares":5,"phase":"secondary","claimable":false}]}
GET  /positions?wallet_address=nope                                      -> 400 INVALID_WALLET
```
**Not verified:** a successful quote → build against Panta. No market accepts one (flag 2).
To cover the build step, `internal/panta/tx_test.go` compiles Panta-shaped instructions and
decodes them back. It checks v0, fee payer = wallet, blockhash, one zeroed signature slot,
and that the program and data are preserved. Those are the things that would make a wallet
refuse to sign. As a second, independent check, the same bytes decoded with the Rust
`solana decode-transaction` CLI: `Version: 0`, account 0 `srw-` fee payer, signature
`(none)`, and the program and data intact. What this doesn't prove is that Panta's *real*
build response has the field shapes in its docs. Re-run the quote → build curl as soon as a
primary market exists.

### Phase 3 gate (real Postgres + live Panta market data, `AUTH_MODE=dev`)
```
POST /users/sync                                   -> 200 user row
POST /posts   (no token)                           -> 401 UNAUTHORIZED
POST /posts   (Bearer garbage)                     -> 401 UNAUTHORIZED
POST /posts   (valid token, never synced)          -> 403 USER_NOT_SYNCED
POST /posts   (market NotARealMarket111)           -> 404 MARKET_NOT_FOUND
POST /posts   x2 (real mainnet markets)            -> 201
POST /posts/:id/comments {"body":"calling it now"} -> 201
GET  /posts/:id/comments                           -> 200, contains that comment
POST /posts/:id/like                               -> {"liked":true,"like_count":1}; again -> {"liked":false,"like_count":0}
POST /posts/:id/share                              -> {"share_count":1}
GET  /posts/<unknown uuid>/comments                -> 404 POST_NOT_FOUND
GET  /feed?limit=1 (token)  -> newest post with author, live market
       {"question":"Will Witty Cruz top The Pantas FPL Leaderboard by end of GW3?","yes_price":0.50083264,
        "no_price":0.49916736,"phase":"secondary","category":"sports"},
       like/comment/share counts, liked_by_me:true, next_cursor
GET  /feed?limit=1&cursor=… -> the older post, next_cursor:null
```
**Not verified:** real Privy tokens. I have no Privy app, so `PrivyVerifier` (ES256 against
`https://auth.privy.io/api/v1/apps/<id>/jwks.json`, `iss=privy.io`, `aud=<app id>`) has never
seen a real token. The first frontend login is its first test. It hasn't run against Supabase
itself either, only vanilla Postgres 18 with the same migration. The connection uses pgx's
simple protocol so it works through Supabase's pooler.

### Phase 4
```
POST /claims/build   {GXh9…}                -> 400 NOT_CLAIMABLE (Panta)
POST /markets/build  {cr_nope}              -> 400 CREATE_EXPIRED (Panta)
POST /markets/register {cr_nope, "x"}       -> 400 INVALID_MARKET_PARAMS + fields (Panta)
POST /markets/quote  (no token)             -> 401
```

## Blocked on

- **Owner:** a funded mainnet wallet and a market in primary phase, to run a real buy end to end.
  Also a decision on flag 3.
- **Content (`content/categories.json`):** live Panta markets use categories outside the
  `/categories/` allowlist (`weather`, `stocks`, `commodities`, `pop-culture`, `gaming`,
  `business`). The feed passes them through as-is, so the frontend needs a label fallback
  or categories.json needs those entries.
- **Deploy:** `DATABASE_URL`, `PRIVY_APP_ID` and a `pk_live_` `PANTA_API_KEY` for whatever
  environment this runs in.
