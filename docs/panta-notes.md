# Panta network notes (Phase 0 spike, 2026-09-24)

## Verdict

**Panta has no real devnet mode. Every live trade is real money on Solana mainnet.**
The live API (`https://live-api.panta.market/api/v1`) with a `pk_live_` key trades on
**Solana mainnet-beta** against program `6gM5afTQBq5VZCfgpGqcsqzfWd5maLSCKWtGjbEobZMp`,
settling in **mainnet USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`)**. A `pk_test_`
key does not switch to devnet. It returns static sandbox fixtures (one fake market, canned
ids, empty instruction list, fake blockhash) and never touches any chain. So there is no
"devnet-safe real trading" option. **`PANTA_MODE` should default to `mock`.** Use `live` only
if the project owner explicitly decides the demo will spend real mainnet USDC from a funded wallet.

## Evidence (what was actually run)

1. `POST /auth/register/` with a throwaway email worked (201). `POST /account/keys/` with the
   access token returned **401 UNAUTHORIZED whenever the body included `name`**. It returned
   201 with `{"env":"test"}` or `{"env":"live"}`. (This is a Panta bug. It doesn't affect us.)
2. `GET /markets/` with `pk_test_`: exactly one item, `TestMarket1111111111111111111111111111111`,
   with `"disclaimer": "Test mode: this response uses sandbox fixtures and does not access Solana mainnet."`
   With `pk_live_`: the real catalog.
3. Quote/build:
   - `pk_test_`: `POST /primaryorderquote/` returns `quoteId: "qt_sandbox_test"`, `shares: "2.00"`.
     `POST /primaryorderbuild/` returns `instructions: []` and
     `recentBlockhash: "SandboxBlockhash1111…"`. That's not a real blockhash, so there is no
     transaction to decode.
   - `pk_live_`: the catalog has 0 mainnet markets in `primary` phase right now. The only two
     `phase: primary` rows (`EWiohz3L…`, `8qCSNAz6…`) return `404 MARKET_NOT_FOUND` from
     `/primaryorderquote/`. The mainnet secondary market `GXh9iztJ…` returns
     `400 MARKET_NOT_IN_PRIMARY`, so Panta's trading path reads that account on-chain.
   - I didn't run a live create-market quote/build to get a Panta-built tx. That is a
     real-funds flow and the session's permission policy blocked it. Instead, the network was
     established read-only from on-chain data, below.
4. Cluster check. `getMultipleAccounts` on every unique catalog market (50) against both clusters:
   - 44 exist **only on mainnet**, owned by `6gM5afTQ…bZMp` (all resolved/secondary/cancelled).
   - 6 exist **only on devnet**, owned by a different program `4CQ4LWv7194V3Qe3iEYZq33cFPQbmKU3e1xVQkpTegLU`.
     These include both "primary" rows. The live trading endpoints can't find them
     (`MARKET_NOT_FOUND`), so they're stale leftovers in the catalog and not a devnet trading path.
   - The creation tx of mainnet market `GXh9iztJ…` (`transactionHash` from `GET /markets/{id}/`),
     fetched via mainnet `getTransaction`, invokes `6gM5afTQ…` and moves token mint
     **`EPjFWdd5…Dt1v` (mainnet USDC)**. The devnet leftovers use a custom mint
     `8Qm44MpHDMs3mdiqryHxhgqLBVrecWmTdVKwqUoxywEY`, which is neither devnet nor mainnet USDC.
5. What a `pk_test_` key "shouldn't" be able to do. The sandbox accepts everything and validates
   nothing:
   - `amountUsdc: "1000000.00"` gives 200, and the response echoes `amountUsdc: "1.00"`
     (the amount is ignored).
   - A real mainnet market id gives 200 with the same canned quote.
   - `wallet: "notakey"` gives 200.
   - `primaryordersubmit` with a fake signature returns `submitted`, and `primaryorderverify`
     returns `confirmed`.
   - `markets/create/quote` with `{}` returns a canned `cr_sandbox_test`.

   There's no enforcement to test because nothing is real. It's safe, but it proves nothing
   about the real flow.

## Other API facts the backend relies on

- Real endpoint paths differ from the task sheet's names: `POST /primaryorderquote/`,
  `/primaryorderbuild/`, `/primaryordersubmit/`, `/primaryorderverify/` (verify is **POST**
  with `orderId`, not GET by signature), `GET /positions/?wallet=`, `GET /markets/{id}/`,
  `POST /markets/create/quote/`, `/markets/create/build/`, `/markets/register/`, `/claim/build/`.
  Trailing slashes are required (no slash gives a 301).
- Quote **requires the buyer wallet**. Primary build returns **instructions + recentBlockhash**,
  not a transaction, so the backend compiles the v0 `VersionedTransaction` itself (payer = wallet).
- The Cloudflare edge returns 403 to Python's default `User-Agent`, so send an explicit UA.
- `GET /markets/?cursor=` pagination loops. `nextCursor` keeps returning the same 50 rows
  (1,550 rows fetched, 50 unique). The catalog is effectively 50 markets.
- The catalog categories include values **not** in `GET /categories/`: live rows use `weather`,
  `stocks`, `commodities`, `pop-culture`, `gaming`, `business`. The `/categories/` allowlist is
  `sports, crypto, politics, entertainment, finance, science, world, other`.
- The `pk_test_` fixture returns ISO strings for `startTime`/`endTime`. Live returns unix ints.
- Live catalog `title` is often `""`. List rows have `yesPrice`/`noPrice` = `null`, and detail
  rows can also be `null` when Panta's RPC is unavailable.
