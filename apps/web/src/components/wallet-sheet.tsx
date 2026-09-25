"use client";

import { Check, Copy, X } from "lucide-react";
import { uiCopy } from "@/lib/copy";
import type { Session } from "@/lib/use-session";

export function WalletSheet({ session, onClose, notify }: { session: Session; onClose: () => void; notify: (message: string) => void }) {
  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="sheet account-sheet" role="dialog" aria-modal="true" aria-label="Wallet">
    <div className="sheet-head"><div><span className="eyebrow">Igloo account</span><h2>Your wallet</h2></div><button type="button" className="icon-action" onClick={onClose} aria-label="Close wallet" title="Close"><X size={20} /></button></div>
    <p className="wallet-balance">{session.balance === null ? "\u2014" : session.balance.toFixed(2)} <span>USDC</span></p>
    <div className="address-line"><span>{session.address || "Connecting wallet"}</span>{session.address && <button type="button" className="icon-action" onClick={() => { void navigator.clipboard.writeText(session.address || ""); notify("Address copied."); }} aria-label="Copy wallet address" title="Copy"><Copy size={17} /></button>}</div>
    <p className="account-state">{session.synced ? <><Check size={16} />Account connected</> : session.syncError || (!session.address ? "Create your Solana wallet to continue." : "Connecting account...")}</p>
    {!session.address && <button type="button" className="subtle-button" disabled={!session.ready || session.walletCreating} onClick={() => { void session.createSolanaWallet(); }}>{session.walletCreating ? "Creating wallet..." : "Create Solana wallet"}</button>}
    {session.address && session.syncError && <button type="button" className="subtle-button" onClick={() => { void session.syncNow().catch(() => notify(uiCopy("error.generic"))); }}>Retry sync</button>}
    {session.meError && <p className="inline-error">{session.meError}</p>}{session.balanceError && <p className="inline-error">{session.balanceError}</p>}
    <button type="button" className="signout-button" onClick={() => { void session.logout(); onClose(); }}>Sign out</button>
  </section></div>;
}
