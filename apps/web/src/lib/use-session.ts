"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useCreateWallet, useWallets } from "@privy-io/react-auth/solana";
import { ApiError, syncUser } from "@/lib/api";
import { getUsdcBalance } from "@/lib/balance";

export function useSession() {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const [synced, setSynced] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState("");
  const syncKey = useRef("");
  const [walletCreating, setWalletCreating] = useState(false);

  const wallet = wallets.find((entry) => entry.standardWallet.name.toLowerCase().includes("privy")) ?? wallets[0];
  const linkedAddress = user?.linkedAccounts.flatMap((account) =>
    account.type === "wallet" && account.chainType === "solana" ? [account.address] : [],
  )[0];
  const address = wallet?.address ?? linkedAddress;

  const createSolanaWallet = useCallback(async () => {
    if (!ready || !authenticated || !walletsReady || address || walletCreating) return;
    setWalletCreating(true);
    setSyncError("");
    try {
      await createWallet();
    } catch (error) {
      console.error("Solana wallet creation failed", error);
      setSyncError("Could not create your Solana wallet. Please try again.");
    } finally {
      setWalletCreating(false);
    }
  }, [ready, authenticated, walletsReady, address, walletCreating, createWallet]);

  const syncNow = useCallback(async () => {
    if (!user?.id || !address) throw new Error("Wallet is still connecting");
    const token = await getAccessToken();
    if (!token) throw new Error("Missing access token");
    const record = await syncUser({
      privy_user_id: user.id,
      wallet_address: address,
      display_name: user.google?.name ?? undefined,
    }, token);
    if (record.wallet_address !== address) throw new Error("Wallet address mismatch");
    setSynced(true);
    setSyncError("");
    return token;
  }, [user, getAccessToken, address]);

  useEffect(() => {
    if (!authenticated || !user?.id || !address) {
      setSynced(false);
      return;
    }
    const key = user.id + ":" + address;
    if (syncKey.current === key) return;
    syncKey.current = key;
    setSynced(false);
    syncNow().catch(() => {
      syncKey.current = "";
      setSyncError("Your wallet is ready, but your account could not sync. Please retry.");
    });
  }, [authenticated, user?.id, address, syncNow]);

  useEffect(() => {
    if (!address) {
      setBalance(null);
      return;
    }
    getUsdcBalance(address).then((value) => {
      setBalance(value);
      setBalanceError("");
    }).catch(() => setBalanceError("USDC balance is unavailable right now."));
  }, [address]);

  const authorized = useCallback(async <T,>(action: (token: string) => Promise<T>): Promise<T> => {
    if (!authenticated) throw new Error("LOGIN_REQUIRED");
    let token = await getAccessToken();
    if (!token) throw new Error("LOGIN_REQUIRED");
    if (!synced) token = await syncNow();
    try {
      return await action(token);
    } catch (error) {
      if (error instanceof ApiError && error.code === "USER_NOT_SYNCED") {
        token = await syncNow();
        return action(token);
      }
      throw error;
    }
  }, [authenticated, getAccessToken, synced, syncNow]);

  return {
    ready: ready,
    authenticated: authenticated,
    user: user,
    login: login,
    logout: logout,
    getAccessToken: getAccessToken,
    wallet,
    address,
    walletCreating,
    createSolanaWallet,
    synced,
    syncError,
    balance,
    balanceError,
    syncNow,
    authorized,
  };
}

export type Session = ReturnType<typeof useSession>;
