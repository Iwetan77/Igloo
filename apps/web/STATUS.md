# Frontend status

Branch: `frontend` (user-requested professional branch name).

## Phase 1: Authentication

- Next.js App Router and TypeScript app scaffolded.
- Privy configured for Google login.
- A Solana embedded wallet is created after login when none exists.
- The real wallet address is sent to `POST /api/v1/users/sync` with a Privy access token.
- The account view reads mainnet USDC token accounts through `NEXT_PUBLIC_SOLANA_RPC_URL`.
- Build gate: pending dependency installation and build.
- Manual gate: pending a configured Privy app ID, Solana RPC URL, running backend, and a real Google login.

## Blocked on

- Environment values for `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_API_BASE_URL`, and `NEXT_PUBLIC_SOLANA_RPC_URL` are not present. A real synced Solana address cannot be verified without them.
- The backend is being built in parallel. Phase 1 requires a live `/users/sync` response before proceeding to the feed gate.
- The current seed posts have placeholder video URLs; the feed phase will need playable assets or approved demo replacements.

Phases 2-6 have not started because the Phase 1 manual gate has not passed.

