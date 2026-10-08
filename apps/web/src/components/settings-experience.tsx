"use client";

import { useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, CircleHelp, Info, LogOut, UserRound, Wallet } from "lucide-react";
import { useSession } from "@/lib/use-session";
import { AppShell } from "@/components/app-shell";
import { WalletSheet } from "@/components/wallet-sheet";
import { EmptyState } from "@/components/ui";
import "@/styles/settings.css";

const faqs = [
  { q: "How do I deposit USDC?", a: "Open your wallet from the balance chip or Profile → Wallet, tap Deposit, and send USDC on the Solana network to the address shown. Other tokens or networks can be lost." },
  { q: "What happens when a market resolves?", a: "Trading closes at the market's end date. Once the outcome is settled, positions on the winning side become claimable under Portfolio → Resolved." },
  { q: "How do I claim my winnings?", a: "Go to Portfolio → Resolved, tap Claim winnings on a position marked Ready to claim, then sign the transaction in your wallet." },
  { q: "Can I cancel a trade?", a: "You can back out at any step before you sign. Once a buy is signed and confirmed on Solana it can't be reversed." },
  { q: "Who can see my posts?", a: "Videos you post are public on Igloo and appear on the market they're linked to, in feeds, and on your profile." },
];

type View = "home" | "support" | "about";

export function SettingsExperience() {
  const session = useSession();
  const [view, setView] = useState<View>("home");
  const [open, setOpen] = useState(0);
  const [wallet, setWallet] = useState(false);
  const [toast, setToast] = useState("");
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3000); };
  const back = (title: string) => <header className="screen-head"><button type="button" className="icon-btn" onClick={() => setView("home")} aria-label="Back to settings"><ArrowLeft size={18} strokeWidth={1.5} /></button><h1 className="grow">{title}</h1></header>;
  const icon = { size: 18, strokeWidth: 1.5 };

  return <AppShell active="settings" session={session}>
    <main className="screen settings">
      {!session.authenticated ? <>
        <header className="screen-head"><h1 className="page-title">Settings</h1></header>
        <EmptyState icon={<UserRound size={26} strokeWidth={1.4} />} title="Sign in to manage your account" action={<button type="button" className="btn btn-primary" onClick={session.login}>Sign in</button>} />
      </> : view === "support" ? <>
        {back("Support")}
        <h2 className="label settings-section">Frequently asked questions</h2>
        <div className="faq">{faqs.map((item, index) => <div key={item.q} className={"faq-item" + (open === index ? " open" : "")}>
          <button type="button" aria-expanded={open === index} onClick={() => setOpen(open === index ? -1 : index)}>{item.q}<ChevronDown size={17} strokeWidth={1.5} /></button>
          {open === index && <p>{item.a}</p>}
        </div>)}</div>
      </> : view === "about" ? <>
        {back("About")}
        <section className="about-card hero-tide"><span className="wordmark"><span className="logo-square" />Igloo</span><p>Watch the market. Make your call.</p></section>
        <div className="card card-pad"><div className="kv"><span>Network</span><strong>Solana mainnet</strong></div><div className="kv"><span>Markets</span><strong>Panta</strong></div><div className="kv"><span>Settlement</span><strong>USDC</strong></div></div>
      </> : <>
        <header className="screen-head"><h1 className="page-title">Settings</h1></header>
        <div className="settings-group">
          <a className="settings-row" href="/profile?edit=1"><UserRound {...icon} /><span>Account</span><small className="label">Name, handle, bio</small><ChevronRight size={17} strokeWidth={1.5} /></a>
          <button type="button" className="settings-row" onClick={() => setWallet(true)}><Wallet {...icon} /><span>Wallet</span><small className="label">Balance, deposit</small><ChevronRight size={17} strokeWidth={1.5} /></button>
          <button type="button" className="settings-row" onClick={() => setView("support")}><CircleHelp {...icon} /><span>Support</span><small className="label">FAQ</small><ChevronRight size={17} strokeWidth={1.5} /></button>
          <button type="button" className="settings-row" onClick={() => setView("about")}><Info {...icon} /><span>About</span><ChevronRight size={17} strokeWidth={1.5} /></button>
        </div>
        <button type="button" className="settings-row danger" onClick={() => { void session.logout().then(() => window.location.assign("/")); }}><LogOut {...icon} /><span>Sign out</span></button>
      </>}
    </main>
    {wallet && <WalletSheet session={session} onClose={() => setWallet(false)} notify={notify} />}
    {toast && <div className="toast" role="status">{toast}</div>}
  </AppShell>;
}
