"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, BriefcaseBusiness, Search, UserRound, Wallet } from "lucide-react";
import { compactUsd } from "@/lib/format";
import { useMarketClock } from "@/lib/markets";
import { demoPosts } from "@/lib/seed";
import type { Session } from "@/lib/use-session";
import { DesktopMarketRail } from "@/components/desktop-market-rail";
import { ProfileAvatar } from "@/components/profile-avatar";
import { WalletSheet } from "@/components/wallet-sheet";
import "@/styles/feed.css";
import "@/styles/desktop-page.css";

/** The same content column, discovery strip and context rail used on Home. */
export function DesktopPageFrame({ children, session, onSearch, onMarkets, onPost }: {
  children: ReactNode;
  session: Session;
  onSearch: () => void;
  onMarkets: () => void;
  onPost: () => void;
}) {
  const router = useRouter();
  const now = useMarketClock();
  const [wallet, setWallet] = useState(false);
  const [toast, setToast] = useState("");
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3500); };
  const account = (path: string) => session.authenticated ? router.push(path) : session.login();

  return <div className="desktop-page-layout">
    <div className="desktop-page-column">
      <header className="desktop-feed-header">
        <button type="button" className="desktop-search slab" onClick={onSearch} aria-label="Search markets and people"><Search size={18} strokeWidth={1.5} /><span>Search creators and markets...</span></button>
        <div className="desktop-wallet">
          {session.authenticated ? <><span className="label">Balance</span><button type="button" className="btn btn-primary btn-sm" onClick={() => setWallet(true)} aria-label="Wallet balance">{session.balance === null ? "Wallet" : <span className="tabular">{compactUsd(session.balance)} USDC</span>}</button></> : <button type="button" className="btn btn-primary btn-sm" onClick={session.login}>Sign in</button>}
        </div>
      </header>
      <div className="desktop-page-discovery"><DesktopMarketRail posts={demoPosts} session={session} now={now} onMarkets={onMarkets} /></div>
      <div className="desktop-page-content">{children}</div>
    </div>
    <aside className="desktop-page-aside" aria-label="Account and quick access">
      <div className="label desktop-context-title"><UserRound size={13} strokeWidth={1.5} />Your account</div>
      <section className="slab desktop-account-card">
        <div className="slab-section">
          <div className="desktop-account-identity"><ProfileAvatar src={session.me?.avatar_url} name={session.me?.display_name} size={40} /><div><h2>{session.authenticated ? session.me?.display_name || "Your account" : "Make your call"}</h2><span className="label">{session.authenticated ? session.me?.username ? "@" + session.me.username : "Profile" : "Watch · Predict · Connect"}</span></div></div>
        </div>
        <div className="slab-section">
          {session.authenticated ? <><span className="label">Available balance</span><p className="display desktop-account-balance">{session.balance === null ? "—" : compactUsd(session.balance)}<small> USDC</small></p><p className="desktop-account-copy">{session.balanceError || "Your wallet and positions, in one place."}</p></> : <><h3>Watch the market.<br />Join the conversation.</h3><p className="desktop-account-copy">Sign in to post takes, follow creators and track your positions.</p></>}
        </div>
        <div className="slab-section"><button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => session.authenticated ? setWallet(true) : session.login()}>{session.authenticated ? <><Wallet size={16} strokeWidth={1.5} />Open wallet</> : "Sign in"}</button></div>
      </section>
      <div className="rows desktop-context-links">
        <button type="button" className="row" onClick={onMarkets}><span className="row-main"><span className="row-title">Explore markets</span><span className="row-sub">Find your next prediction</span></span><ArrowUpRight size={16} /></button>
        <button type="button" className="row" onClick={() => account("/portfolio")}><span className="row-main"><span className="row-title">Your positions</span><span className="row-sub">Open and resolved</span></span><BriefcaseBusiness size={16} strokeWidth={1.5} /></button>
        <button type="button" className="row" onClick={onPost}><span className="row-main"><span className="row-title">Post a take</span><span className="row-sub">Share your perspective</span></span><ArrowUpRight size={16} /></button>
      </div>
    </aside>
    {wallet && <WalletSheet session={session} onClose={() => setWallet(false)} notify={notify} />}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}
