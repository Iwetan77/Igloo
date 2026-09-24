# services/api — STATUS

Branch: `backend`.

## Every Panta trade is real mainnet money

Phase 0 result (details in `docs/panta-notes.md`): Panta has **no devnet trading**. `pk_live_`
keys trade real USDC on Solana mainnet. `pk_test_` keys return static canned fixtures that
touch no chain. `PANTA_MODE` defaults to **`mock`**. Turning on `live` for the demo means a
funded mainnet wallet spends real USDC. That's your call, not something the backend decides.

Also: at spike time the live catalog had **zero mainnet markets open for primary buys**. So
`live` mode currently can't complete a buy even with money, unless someone creates a market
(that costs real USDC too).

## Phases

| Phase | State | Evidence |
|---|---|---|
| 0 Panta spike | done (one step substituted, see note) | `docs/panta-notes.md` |
| 1 Skeleton | in progress | |
| 2 Panta proxy | not started | |
| 3 App endpoints | not started | |
| 4 Stretch | not started | |

Phase 0 note: step 3 ("decode a Panta-built tx and check its blockhash") couldn't run as
written. `pk_test_` builds have no instructions and a fake blockhash, and no live market
accepts primary quotes. A live create-market build was blocked by the session's real-funds
permission policy. I established the network read-only instead, by looking up catalog market
accounts and a market's creation transaction on both clusters. That's conclusive for the
verdict, but it isn't the literal step.

## Blocked on

(nothing yet)
