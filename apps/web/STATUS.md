# Frontend status

Branch: `frontend` (user-requested professional branch name).

## Phase 1: Authentication

- Next.js App Router and TypeScript app scaffolded.
- Privy configured for Google login.
- A Solana embedded wallet is created after login when none exists.
- The real wallet address is sent to `POST /api/v1/users/sync` with a Privy access token.
- The account view reads mainnet USDC token accounts through `NEXT_PUBLIC_SOLANA_RPC_URL`.
- `npm run build`: passed on 2026-09-24 with a non-blocking optional Privy/Farcaster module warning.
- `npm run lint`: passed on 2026-09-24.
- Manual login gate: blocked. No Privy app ID, Solana RPC URL, or running API base URL is configured here, so a real Google login and synced Solana address cannot be verified.

## Blocked on

- Configure `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_API_BASE_URL`, and `NEXT_PUBLIC_SOLANA_RPC_URL` in `apps/web/.env.local`, then run the backend and perform the manual login gate.
- Confirm the Solana network and its USDC mint. The current balance read uses the mainnet USDC mint.
- The current seed posts have placeholder video URLs; the feed phase will need playable assets or approved demo replacements.

Phases 2-6 have not started because the Phase 1 manual gate has not passed.

