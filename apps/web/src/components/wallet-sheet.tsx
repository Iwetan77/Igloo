"use client";

import { useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUpRight, Check, Copy, History, TriangleAlert, X } from "lucide-react";
import { uiCopy } from "@/lib/copy";
import { shortId } from "@/lib/format";
import { Money } from "@/components/ui";
import type { Session } from "@/lib/use-session";
import "@/styles/wallet.css";

export function WalletSheet({ session, onClose, notify }: { session: Session; onClose: () => void; notify: (message: string) => void }) {
  const [view, setView] = useState<"home" | "deposit">("home");
  const address = session.address || "";
  const copy = () => { void navigator.clipboard.writeText(address).then(() => notify("Address copied.")); };

  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="sheet wallet-sheet" role="dialog" aria-modal="true" aria-label="Wallet">
    {view === "deposit" ? <>
      <div className="sheet-head"><button type="button" className="icon-btn sm" onClick={() => setView("home")} aria-label="Back"><ArrowLeft size={17} strokeWidth={1.5} /></button><h2 className="wallet-title">Deposit USDC</h2><button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close"><X size={17} strokeWidth={1.5} /></button></div>
      <div className="deposit-card slab"><span className="label">Your Solana address</span><p className="deposit-address">{address}</p><button type="button" className="btn btn-primary btn-block" onClick={copy}><Copy size={16} strokeWidth={1.5} />Copy address</button></div>
      <div className="notice warn"><TriangleAlert size={18} strokeWidth={1.5} /><span><strong>Network warning</strong>Send only USDC on the Solana network. Other tokens or networks may be lost permanently.</span></div>
    </> : <>
      <div className="sheet-head"><h2 className="wallet-title">Your wallet</h2><button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close wallet"><X size={17} strokeWidth={1.5} /></button></div>
      <div className="wallet-hero slab">
        <div className="slab-section"><span className="label">Total balance</span>
        <Money value={session.balance} unit="USDC" className="wallet-balance" /></div>
        <div className="slab-section wallet-tags"><span className="tag">Solana mainnet</span>{session.synced ? <span className="tag tag-live">Account connected</span> : <span className="tag">{address ? "Connecting" : "No wallet yet"}</span>}</div>
      </div>
      {address ? <button type="button" className="address-row" onClick={copy} aria-label="Copy wallet address"><span className="label">Address</span><span className="address-value">{shortId(address)}</span><Copy size={16} strokeWidth={1.5} /></button>
        : <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!session.ready || session.walletCreating} onClick={() => { void session.createSolanaWallet(); }}>{session.walletCreating ? "Creating wallet…" : "Create Solana wallet"}</button>}
      {session.syncError && <p className="inline-error">{session.syncError}</p>}
      {address && session.syncError && <button type="button" className="btn btn-block" onClick={() => { void session.syncNow().catch(() => notify(uiCopy("error.generic"))); }}>Retry sync</button>}
      {session.meError && <p className="inline-error">{session.meError}</p>}{session.balanceError && <p className="inline-error">{session.balanceError}</p>}
      {address && <div className="wallet-actions"><button type="button" className="btn btn-primary btn-lg" onClick={() => setView("deposit")}><ArrowDown size={17} strokeWidth={1.5} />Deposit</button><a className="btn btn-lg" href={"https://solscan.io/account/" + address} target="_blank" rel="noreferrer"><History size={17} strokeWidth={1.5} />History<ArrowUpRight size={14} /></a></div>}
      {session.synced && <p className="wallet-note label"><Check size={12} />Trades sign with this embedded wallet</p>}
      <button type="button" className="btn btn-danger btn-block wallet-signout" onClick={() => { void session.logout(); onClose(); }}>Sign out</button>
    </>}
  </section></div>;
}
