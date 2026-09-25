# Frontend status

Branch: `frontend`.

## Implemented

- Google sign-in with Privy and an embedded Solana wallet created on login.
- Bearer-authenticated user sync using the linked Solana address, with retry after `USER_NOT_SYNCED`.
- Vertical video feed with pagination, post deep links, likes, comments, sharing, and demo fallback when the live feed is empty.
- Supabase Realtime subscriptions for likes and comments. Writes remain on the backend.
- Buy flow: quote, build, Privy signing, mainnet RPC broadcast, submit, and verification polling. Backend error codes have user-facing copy, including `MARKET_NOT_IN_PRIMARY`.
- Account view with mainnet USDC balance and positions.
- Video composer using the backend-signed upload URL for the public-read `videos` bucket, followed by `POST /posts`.
- Quote action on each live video, direct-parent previews in feed, and a quote composer that inherits the original market without a picker. Original posts still select a market.
- Privy modal uses Igloo background, accent, wordmark, and login heading via supported appearance configuration.

## Configuration

Set `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SOLANA_RPC_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in ignored `apps/web/.env.local`. The temporary backend tunnel URL belongs only in that environment value.

## Verification

- `npm run build`: passed on 2026-09-25. The Privy package emits a non-blocking optional Farcaster module warning.
- `npm run lint`: passed on 2026-09-25.
- Public backend `GET /api/v1/feed?limit=1`: HTTP 200 on 2026-09-25, with an empty posts list.
- First live Google sign-in, Solana wallet creation, and backend account sync succeeded on 2026-09-25, confirmed by the user account screen showing a Solana address and Account connected. The Privy creation modal stayed open until dismissed; a redundant fallback wallet creation call has been removed.
- Two-session Realtime and signed video upload still need interactive checks.
- Quote API rollout and a real quote submission are pending backend confirmation. Older feed payloads remain supported; missing quote fields render as no parent and zero quotes.
- The themed Privy login modal was visually checked in a fresh browser at a true 390px viewport. Desktop and mobile feed captures were reviewed; mobile had no horizontal overflow.
- No Panta market currently accepts buys. The flow is implemented, but a successful mainnet trade cannot be verified until an opening sale exists.
- For You uses the five real live feed posts, including one quote; seed fallback appears only for zero posts or feed errors and is labeled Demo.
- Live Markets list, Crypto category filtering, and one market detail page with two videos and Quote controls were visually checked at 390px with no overflow. Market end times disable buys and refresh on open pages.
- Onboarding, Following, follows, profile/search API, and authenticated watch-event sends are implemented but need a signed-in verification pass after migration 0005. View events queue for retry and the API handles HTTP 204.
- Real signed upload, two-browser comments, and quote submission are deferred at the owner's request until a video is ready.
