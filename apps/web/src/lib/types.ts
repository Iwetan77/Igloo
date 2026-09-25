export type Market = {
  question: string | null;
  yes_price: number | null;
  no_price: number | null;
  phase: string | null;
  category: string | null;
};

export type FeedPost = {
  id: string;
  panta_market_id: string;
  video_url: string;
  caption: string | null;
  created_at: string;
  author: { id: string; display_name: string | null; wallet_address: string };
  market: Market;
  like_count: number;
  comment_count: number;
  share_count: number;
  liked_by_me: boolean;
  demo?: boolean;
};

export type FeedPage = { posts: FeedPost[]; next_cursor: string | null };
export type Side = "YES" | "NO";
export type Quote = {
  quote_id: string;
  fee_usdc: number;
  estimated_shares: number;
  expires_at: string;
};
export type OrderStatus = { status: "pending" | "confirmed" | "failed"; detail?: string };
export type Comment = {
  id: string;
  body: string;
  created_at: string;
  author: { id: string; display_name: string | null };
};
export type Position = {
  panta_market_id: string;
  side: Side;
  shares: number;
  phase: string;
  claimable: boolean;
};
