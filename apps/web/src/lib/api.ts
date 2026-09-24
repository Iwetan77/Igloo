export type SyncedUser = {
  id: string;
  privy_user_id: string;
  wallet_address: string;
  display_name: string | null;
  created_at: string;
};

export async function syncUser(input: {
  privy_user_id: string;
  wallet_address: string;
  display_name?: string;
}, token: string): Promise<SyncedUser> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";
  const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/users/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`User sync failed (${response.status})`);
  return response.json() as Promise<SyncedUser>;
}

