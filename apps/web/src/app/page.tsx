"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, LogOut, Wallet } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useCreateWallet, useWallets } from "@privy-io/react-auth/solana";
import { syncUser } from "@/lib/api";
import { getUsdcBalance } from "@/lib/balance";

function AccountView() {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [synced, setSynced] = useState(false);
  const [copied, setCopied] = useState(false);
  const creationStarted = useRef(false);
  const lastSynced = useRef("");

  const wallet = wallets.find((entry) => entry.standardWallet.name === "Privy") ?? wallets[0];
  const address = wallet?.address;

  useEffect(() => {
    if (!ready || !authenticated || !walletsReady || address || creationStarted.current) return;
    const linkedSolanaWallet = user?.linkedAccounts.some(
      (account) => account.type === "wallet" && account.chainType === "solana"
    );
    if (linkedSolanaWallet) return;
    creationStarted.current = true;
    createWallet().catch(() => {
      creationStarted.current = false;
      setSyncError("Could not create your Solana wallet. Please try signing in again.");
    });
  }, [ready, authenticated, walletsReady, address, user, createWallet]);

  useEffect(() => {
    if (!authenticated || !user?.id || !address) return;
    const key = `${user.id}:${address}`;
    if (lastSynced.current === key) return;
    lastSynced.current = key;
    setSynced(false);
    setSyncError("");
    getAccessToken().then((token) => {
      if (!token) throw new Error("Missing access token");
      return syncUser({
        privy_user_id: user.id,
        wallet_address: address,
        display_name: user.google?.name ?? undefined,
      }, token);
    }).then((record) => {
      if (record.wallet_address !== address) throw new Error("Wallet address mismatch");
      setSynced(true);
    }).catch(() => {
      lastSynced.current = "";
      setSyncError("Your wallet is ready, but your account could not sync. Please retry.");
    });
  }, [authenticated, user, address, getAccessToken]);

  useEffect(() => {
    if (!address) return;
    getUsdcBalance(address).then((value) => {
      setBalance(value);
      setBalanceError("");
    }).catch(() => setBalanceError("Balance unavailable. Check the Solana RPC connection."));
  }, [address]);

  async function copyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  const title = authenticated ? "Your account" : "Watch the market. Make your call.";
  const message = authenticated
    ? "Your Solana wallet is connected to Igloo."
    : "Sign in with Google to set up your wallet and join the conversation.";

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark" />Igloo</div>
        <div className="topbar-actions">
          <span className="status">{authenticated ? (synced ? "Account connected" : "Connecting account") : "Prediction markets"}</span>
          {authenticated && <button type="button" className="ghost" onClick={logout}><LogOut size={16} aria-hidden /> Sign out</button>}
        </div>
      </header>
      <main className="main">
        <section>
          <p className="kicker">{authenticated ? "Wallet" : "Welcome to Igloo"}</p>
          <h1>{title}</h1>
          <p className="lead">{message}</p>
          {!authenticated && (
            <button className="primary" type="button" onClick={login} disabled={!ready}>
              {ready ? "Continue with Google" : "Loading sign in"}
            </button>
          )}
          {authenticated && syncError && (
            <button className="ghost" type="button" onClick={() => { lastSynced.current = ""; setSyncError(""); setSynced(false); }}>
              Retry account sync
            </button>
          )}
          <p className="feedback" role="status">{syncError || balanceError}</p>
        </section>
        <section className="account" aria-label="Wallet balance">
          <p className="account-label">Available balance</p>
          <p className="balance">{authenticated ? (balance === null ? "—" : balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : "—"}</p>
          <span className="unit">USDC</span>
          <div className="wallet-row">
            <Wallet size={18} color="#B9F381" aria-hidden />
            <span className="wallet-address">{authenticated ? (address ?? "Creating Solana wallet…") : "Sign in to view wallet"}</span>
            {address && <button type="button" className="icon-button" onClick={copyAddress} title={copied ? "Copied" : "Copy wallet address"} aria-label={copied ? "Copied" : "Copy wallet address"}><Copy size={16} /></button>}
          </div>
        </section>
      </main>
      <footer className="foot"><span>Igloo</span><span>Built for the next call.</span></footer>
    </div>
  );
}

export default function Home() {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return <div className="shell"><header className="topbar"><div className="brand"><span className="brand-mark" />Igloo</div></header><main className="main"><section><p className="kicker">Configuration needed</p><h1>Connect your Privy app.</h1><p className="lead">Set NEXT_PUBLIC_PRIVY_APP_ID in apps/web/.env.local to enable Google sign in.</p></section></main></div>;
  }
  return <AccountView />;
}

