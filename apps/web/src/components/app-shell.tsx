"use client";

import type { ReactNode } from "react";
import { BriefcaseBusiness, ChartSpline, House, Plus, Search, Settings, UserRound } from "lucide-react";
import { ProfileAvatar } from "@/components/profile-avatar";
import type { Session } from "@/lib/use-session";

export type NavKey = "home" | "markets" | "portfolio" | "profile" | "settings" | null;

type Handlers = {
  onHome?: () => void;
  onMarkets?: () => void;
  onSearch?: () => void;
  onPost?: () => void;
};

const go = (path: string) => window.location.assign(path);

/** Side rail on desktop, five-slot bottom bar with a centre post orb on phones. */
export function AppShell({ active, session, children, className = "", ...handlers }: Handlers & {
  active: NavKey;
  session: Session;
  children: ReactNode;
  className?: string;
}) {
  const signedIn = (path: string) => () => session.authenticated ? go(path) : session.login();
  const home = handlers.onHome ?? (() => go("/"));
  const markets = handlers.onMarkets ?? (() => go("/?tab=markets"));
  const search = handlers.onSearch ?? (() => go("/?search=1"));
  const post = handlers.onPost ?? (() => session.authenticated ? go("/?compose=1") : session.login());
  const me = session.me;
  const icon = { size: 19, strokeWidth: 1.5 };

  return <div className={"shell " + className}>
    <aside className="side-nav" aria-label="Main navigation">
      <span className="wordmark"><span className="logo-square" />Igloo</span>
      <button type="button" className={"side-link" + (active === "home" ? " active" : "")} onClick={home}><House {...icon} />Home</button>
      <button type="button" className={"side-link" + (active === "markets" ? " active" : "")} onClick={markets}><ChartSpline {...icon} />Markets</button>
      <button type="button" className="side-link" onClick={search}><Search {...icon} />Search</button>
      <button type="button" className={"side-link" + (active === "portfolio" ? " active" : "")} onClick={signedIn("/portfolio")}><BriefcaseBusiness {...icon} />Portfolio</button>
      <button type="button" className={"side-link" + (active === "profile" ? " active" : "")} onClick={signedIn("/profile")}><UserRound {...icon} />Profile</button>
      <button type="button" className={"side-link" + (active === "settings" ? " active" : "")} onClick={signedIn("/settings")}><Settings {...icon} />Settings</button>
      <button type="button" className="btn btn-primary side-post" onClick={post} aria-label="Post a take"><Plus size={18} />Post a take</button>
      <div className="side-foot">
        <button type="button" className="side-me" onClick={signedIn("/profile")}>
          <ProfileAvatar src={me?.avatar_url} name={me?.display_name} size={34} />
          <span><small>{session.authenticated ? "Signed in" : "Guest"}</small><b>{session.authenticated ? (me?.username ? "@" + me.username : me?.display_name || "Profile") : "Sign in"}</b></span>
        </button>
      </div>
    </aside>
    <div className="shell-main">{children}</div>
    <nav className="bottom-nav" aria-label="Mobile navigation">
      <button type="button" className={active === "home" ? "active" : ""} onClick={home}><House {...icon} />Home</button>
      <button type="button" className={active === "markets" ? "active" : ""} onClick={markets}><ChartSpline {...icon} />Markets</button>
      <button type="button" className="post-orb" onClick={post} aria-label="Post a take"><Plus size={22} strokeWidth={1.75} /></button>
      <button type="button" className={active === "portfolio" ? "active" : ""} onClick={signedIn("/portfolio")}><BriefcaseBusiness {...icon} />Portfolio</button>
      <button type="button" className={active === "profile" || active === "settings" ? "active" : ""} onClick={signedIn("/profile")}><UserRound {...icon} />Profile</button>
    </nav>
  </div>;
}
