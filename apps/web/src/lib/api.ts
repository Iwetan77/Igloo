import type { Comment, FeedPage, OrderStatus, Position, Quote, Side } from "@/lib/types";

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
  options: { method?: "GET" | "POST"; body?: unknown; token?: string | null; signal?: AbortSignal } = {},
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
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as
      | { code?: string; message?: string; fields?: unknown }
      | null;
    throw new ApiError(payload?.code || "HTTP_ERROR", response.status, payload?.message, payload?.fields);
  }
  return response.json() as Promise<T>;
}

export function syncUser(
  input: { privy_user_id: string; wallet_address: string; display_name?: string },
  token: string,
) {
  return apiRequest<SyncedUser>("/users/sync", { method: "POST", body: input, token });
}

export function getFeed(cursor?: string | null, token?: string | null, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: "10" });
  if (cursor) query.set("cursor", cursor);
  return apiRequest<FeedPage>("/feed?" + query, { token, signal });
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
  input: { panta_market_id: string; video_url: string; caption?: string },
  token: string,
) {
  return apiRequest<{ id: string; panta_market_id: string; video_url: string; caption: string | null; author_user_id: string; created_at: string }>(
    "/posts", { method: "POST", body: input, token },
  );
}


export function requestVideoUpload(content_type: string, token: string) {
  return apiRequest<{ path: string; token: string; upload_url: string; public_url: string }>(
    "/uploads/video", { method: "POST", body: { content_type }, token },
  );
}

