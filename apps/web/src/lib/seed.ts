import seedPosts from "../../../../content/seed-posts.json";
import type { FeedPost } from "@/lib/types";

const demoVideos = [
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  "https://media.w3.org/2010/05/sintel/trailer.mp4",
  "https://media.w3.org/2010/05/bunny/trailer.mp4",
];

export const demoPosts: FeedPost[] = seedPosts.map((post, index) => ({
  id: "demo-" + (index + 1),
  panta_market_id: post.panta_market_id,
  video_url: post.video_url.includes("placeholder-video-url")
    ? demoVideos[index % demoVideos.length]
    : post.video_url,
  caption: post.caption,
  created_at: "2026-09-24T00:00:00Z",
  author: { id: "demo", display_name: "Igloo", wallet_address: "" },
  market: {
    question: post.market_question,
    yes_price: null,
    no_price: null,
    phase: null,
    category: post.category,
  },
  like_count: 0,
  comment_count: 0,
  share_count: 0,
  liked_by_me: false,
  demo: true,
}));
