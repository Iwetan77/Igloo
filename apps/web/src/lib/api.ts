import type { Comment, FeedPage, FeedTab, MarketPage, MarketSummary, Me, OrderStatus, Position, Quote, Side, UserProfile } from "@/lib/types";

export type SyncedUser = {
  id: string;
  privy_user_id: string;
  wallet_address: string;
  display_name: string | null;
  created_at: string;
};

export class ApiError extends Error {
  constructor(public code: string, public status: number, message?: string, public fields?: unknown) {
    super(message || code);
  }
}

const configured = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");
if (!configured) throw new Error("NEXT_PUBLIC_API_BASE_URL is required");
const base = configured.endsWith("/api/v1") ? configured : configured + "/api/v1";

export async function apiRequest<T>(
  path: string,
  options: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown; token?: string | null; signal?: AbortSignal; keepalive?: boolean } = {},
): Promise<T> {
  const response = await fetch(base + path, {
    method: options.method || "GET",
    headers: {
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.token ? { Authorization: "Bearer " + options.token } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
    cache: "no-store",
    keepalive: options.keepalive,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as
      | { code?: string; message?: string; fields?: unknown }
      | null;
    throw new ApiError(payload?.code || "HTTP_ERROR", response.status, payload?.message, payload?.fields);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function syncUser(
  input: { privy_user_id: string; wallet_address: string; display_name?: string },
  token: string,
) {
  return apiRequest<SyncedUser>("/users/sync", { method: "POST", body: input, token });
}

export function getFeed(cursor?: string | null, token?: string | null, scope?: { tab?: FeedTab; marketId?: string }) {
  const query = new URLSearchParams({ limit: "10" });
  if (cursor) query.set("cursor", cursor);
  if (scope?.marketId) query.set("market_id", scope.marketId);
  else if (scope?.tab) query.set("tab", scope.tab);
  return apiRequest<FeedPage>("/feed?" + query, { token });
}

export function getMe(token: string) {
  return apiRequest<Me>("/me", { token });
}
export function putInterests(categories: string[], token: string) {
  return apiRequest<Me>("/me/interests", { method: "PUT", body: { categories }, token });
}
export function getMarkets(category?: string, cursor?: string | null, token?: string | null) {
  const query = new URLSearchParams();
  if (category) query.set("category", category);
  if (cursor) query.set("cursor", cursor);
  return apiRequest<MarketPage>("/markets" + (query.size ? "?" + query : ""), { token });
}
export function getMarket(id: string, token?: string | null) {
  return apiRequest<MarketSummary>("/markets/" + encodeURIComponent(id), { token });
}
export function getUserProfile(id: string, token: string) {
  return apiRequest<UserProfile>("/users/" + encodeURIComponent(id), { token });
}
export function getUserByUsername(username: string, token: string) {
  return apiRequest<UserProfile>("/usernames/" + encodeURIComponent(username), { token });
}
export function patchMe(input: { username?: string; display_name?: string; bio?: string; avatar_url?: string }, token: string) {
  return apiRequest<Me>("/me", { method: "PATCH", body: input, token });
}
export function getLikedPosts(cursor: string | null, token: string) {
  return apiRequest<FeedPage>("/me/liked" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""), { token });
}
export function requestAvatarUpload(content_type: string, token: string) {
  return apiRequest<{ path: string; token: string; upload_url: string; public_url: string }>(
    "/uploads/avatar", { method: "POST", body: { content_type }, token },
  );
}
export function getUserPosts(id: string, token: string, cursor?: string | null) {
  return apiRequest<FeedPage>("/users/" + encodeURIComponent(id) + "/posts" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""), { token });
}
export function searchUsers(query: string, token?: string | null) {
  return apiRequest<{ users: UserProfile[] }>("/users/search?q=" + encodeURIComponent(query), { token });
}
export function searchMarkets(query: string, token?: string | null) {
  return apiRequest<MarketPage>("/markets?limit=20&q=" + encodeURIComponent(query), { token });
}
export function setFollow(id: string, following: boolean, token: string) {
  return apiRequest<{ following: boolean; follower_count: number }>("/users/" + encodeURIComponent(id) + "/follow", {
    method: following ? "POST" : "DELETE", token,
  });
}
export function postView(post_id: string, watch_ms: number, completed: boolean, token: string) {
  return apiRequest<unknown>("/events/view", {
    method: "POST", body: { post_id, watch_ms, completed }, token, keepalive: true,
  });
}

export function quoteOrder(
  panta_market_id: string, side: Side, usdc_amount: number, token: string,
) {
  return apiRequest<Quote>("/orders/quote", {
    method: "POST", body: { panta_market_id, side, usdc_amount }, token,
  });
}
export function buildOrder(quote_id: string, token: string) {
  return apiRequest<{ unsigned_tx_base64: string }>("/orders/build", {
    method: "POST", body: { quote_id }, token,
  });
}
export function submitOrder(quote_id: string, signature: string, token: string) {
  return apiRequest<{ status: "pending" }>("/orders/submit", {
    method: "POST", body: { quote_id, signature }, token,
  });
}
export function verifyOrder(signature: string, token: string) {
  return apiRequest<OrderStatus>("/orders/verify?signature=" + encodeURIComponent(signature), { token });
}
export function getPositions(wallet_address: string, token?: string | null) {
  return apiRequest<{ positions: Position[] }>(
    "/positions?wallet_address=" + encodeURIComponent(wallet_address), { token },
  );
}
export function getComments(id: string) {
  return apiRequest<{ comments: Comment[] }>("/posts/" + encodeURIComponent(id) + "/comments");
}
export function createComment(id: string, body: string, token: string) {
  return apiRequest<Comment>("/posts/" + encodeURIComponent(id) + "/comments", {
    method: "POST", body: { body }, token,
  });
}
export function toggleLike(id: string, token: string) {
  return apiRequest<{ liked: boolean; like_count: number }>(
    "/posts/" + encodeURIComponent(id) + "/like", { method: "POST", token },
  );
}
export function sharePost(id: string, token: string) {
  return apiRequest<{ share_count: number }>(
    "/posts/" + encodeURIComponent(id) + "/share", { method: "POST", token },
  );
}
export function createPost(
  input: { video_url: string; caption?: string } & ({ panta_market_id: string; quoted_post_id?: never } | { quoted_post_id: string; panta_market_id?: never }),
  token: string,
) {
  return apiRequest<{ id: string; panta_market_id: string; video_url: string; caption: string | null; quoted_post_id: string | null; author_user_id: string; created_at: string }>(
    "/posts", { method: "POST", body: input, token },
  );
}


export function requestVideoUpload(content_type: string, token: string) {
  return apiRequest<{ path: string; token: string; upload_url: string; public_url: string }>(
    "/uploads/video", { method: "POST", body: { content_type }, token },
  );
}

export function buildClaim(panta_market_id: string, token: string) {
  return apiRequest<{ winning_shares: number; unsigned_tx_base64: string }>("/claims/build", {
    method: "POST", body: { panta_market_id }, token,
  });
}

export type CreateMarketInput = {
  question: string;
  resolution_rule: string;
  sources_of_truth: string[];
  category: string;
  start_time: number;
  end_time: number;
  resolution_time: number;
  market_type?: string;
  title?: string;
  description?: string;
  image_url?: string;
};
export function quoteMarketCreation(input: CreateMarketInput, token: string) {
  return apiRequest<{ create_id: string; expected_panta_market_id: string; fee_usdc: number; expires_at: string }>(
    "/markets/quote", { method: "POST", body: input, token },
  );
}
export function buildMarketCreation(create_id: string, token: string) {
  return apiRequest<{ create_id: string; unsigned_tx_base64: string; expected_panta_market_id: string }>(
    "/markets/build", { method: "POST", body: { create_id }, token },
  );
}
export function registerMarket(create_id: string, signature: string, token: string) {
  return apiRequest<{ panta_market_id: string; status: string }>(
    "/markets/register", { method: "POST", body: { create_id, signature }, token },
  );
}
