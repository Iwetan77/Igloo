"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLinkAccount, usePrivy } from "@privy-io/react-auth";
import { useCreateWallet, useExportWallet, useWallets } from "@privy-io/react-auth/solana";
import { ApiError, getMe, patchMe, putInterests, syncUser } from "@/lib/api";
import type { Me } from "@/lib/types";
import { getUsdcBalance } from "@/lib/balance";

function useSessionState() {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const { exportWallet } = useExportWallet();
  const { linkTwitter } = useLinkAccount();
  const [synced, setSynced] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState("");
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
  // Privy holds the key for embedded wallets, so the user must back it up; external wallets bring their own.
  const embeddedWallet = Boolean(wallet?.standardWallet.name.toLowerCase().includes("privy"));
  const xHandle = user?.twitter?.username ?? null;
  const backUpWallet = useCallback(() => exportWallet(address ? { address } : undefined), [exportWallet, address]);

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
    try {
      setMe(await getMe(token));
      setMeError("");
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) {
        setMeError("Your profile is temporarily unavailable.");
      }
    }
    return token;
  }, [user, getAccessToken, address]);

  useEffect(() => {
    if (!authenticated || !user?.id || !address) {
      setSynced(false);
      setMe(null);
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

  const saveInterests = useCallback(async (categories: string[]) => {
    const token = await authorized((value) => putInterests(categories, value).then(() => value));
    setMe((current) => current ? { ...current, interests: categories, onboarded: true } : current);
    try { setMe(await getMe(token)); } catch { /* optimistic state remains until next refresh */ }
  }, [authorized]);

  const updateProfile = useCallback(async (input: { username?: string; display_name?: string; bio?: string; avatar_url?: string }) => {
    const profile = await authorized((token) => patchMe(input, token));
    setMe(profile);
    return profile;
  }, [authorized]);

  const refreshMe = useCallback(async () => {
    const profile = await authorized((token) => getMe(token));
    setMe(profile);
    return profile;
  }, [authorized]);
  return {
    ready: ready,
    authenticated: authenticated,
    user: user,
    login: login,
    logout: logout,
    getAccessToken: getAccessToken,
    wallet,
    address,
    embeddedWallet,
    backUpWallet,
    xHandle,
    linkTwitter,
    walletCreating,
    createSolanaWallet,
    synced,
    me,
    meError,
    saveInterests,
    updateProfile,
    refreshMe,
    syncError,
    balance,
    balanceError,
    syncNow,
    authorized,
  };
}

export type Session = ReturnType<typeof useSessionState>;

const SessionContext = createContext<Session | null>(null);

/** Keep account and balance state alive while the Next router changes pages. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useSessionState();
  return createElement(SessionContext.Provider, { value: session }, children);
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside SessionProvider");
  return session;
}
