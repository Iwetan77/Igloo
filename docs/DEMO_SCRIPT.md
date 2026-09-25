# Igloo — Demo Script

A literal walkthrough for driving the live demo. Follow one line at a time.

## Before you start

- Point the app at the current backend URL (`NEXT_PUBLIC_API_BASE_URL`). In dev the backend runs behind a temporary Cloudflare tunnel, and its URL can change.
- Sign-in uses a Privy **embedded Solana wallet** — no external wallet app is needed.

## Sign in

1. Open the app's localhost URL in a fresh browser tab.
2. Tap **Sign in**.
3. Complete the Privy flow in the popup — it creates/connects an embedded Solana wallet.
4. Confirm you land back on the app, signed in, with the feed visible.

## Scroll the feed

5. Scroll down the feed to show several posts load.
6. Point out a post's market question, YES/NO prices, and the like/comment/share counts.

## Buy flow (show only — no live purchase)

7. On one post, tap the **YES** button.
8. Note the buy sheet opens with the amount entry and the YES/NO prices.
9. Explain that markets are currently in opening-sale phase and don't accept buys yet, so a live purchase isn't part of the demo.

## Comment

10. On the same post, tap the **comments** icon.
11. Type a short comment in the comment box.
12. Tap **Post**.
13. Confirm the new comment appears at the top of the list.

## Share

14. Tap the **share** icon on the post.
15. If the native share sheet opens, pick a destination and send it.
16. If a fallback appears instead, tap **Copy link**.
17. Open a new browser tab and paste the copied link to confirm it loads the post.

## Post a new video

18. Tap the **+** (create) button in the bottom bar.
19. Pick or record a short video.
20. Add a caption.
21. Tap **Post** — the video uploads through the backend (signed URL), then the post is created.
22. Confirm the new post appears at the top of the feed.
