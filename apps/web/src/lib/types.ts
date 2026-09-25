export type Market = {
  question: string | null;
  yes_price: number | null;
  no_price: number | null;
  phase: string | null;
  end_time?: string | null;
  category: string | null;
};

export type Author = { id: string; display_name: string | null; username?: string | null; avatar_url?: string | null; wallet_address?: string; is_following?: boolean; is_friend?: boolean };

export type QuotedPost = {
  id: string;
  video_url: string;
  caption: string | null;
  created_at: string;
  author: Author;
};

export type FeedPost = {
  id: string;
  panta_market_id: string;
  video_url: string;
  caption: string | null;
  created_at: string;
  author: Author;
  market: Market;
  like_count: number;
  comment_count: number;
  share_count: number;
  quote_count?: number;
  quoted_post?: QuotedPost | null;
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
  author: Author;
};
export type Position = {
  panta_market_id: string;
  side: Side;
  shares: number;
  phase: string;
  claimable: boolean;
};
export type FeedTab = "for_you" | "following";
export type MarketSummary = {
  panta_market_id: string;
  question: string | null;
  category: string | null;
  phase: string | null;
  end_time?: string | null;
  yes_price: number | null;
  no_price: number | null;
  image_url: string | null;
  post_count: number;
};
export type MarketPage = { markets: MarketSummary[]; next_cursor: string | null };
export type Me = {
  id: string;
  display_name: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  likes_received: number;
  wallet_address: string;
  onboarded: boolean;
  interests: string[];
  follower_count: number;
  following_count: number;
};
export type UserProfile = {
  id: string;
  display_name: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  likes_received: number;
  follower_count: number;
  following_count: number;
  post_count: number;
  is_following: boolean;
  follows_me: boolean;
  is_friend: boolean;
};