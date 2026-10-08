"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, CircleX, Mail, Wallet } from "lucide-react";
import type { Session } from "@/lib/use-session";
import "@/styles/intro.css";

const SEEN_KEY = "igloo.introSeen";

function readSeen() {
  try { return window.localStorage.getItem(SEEN_KEY) === "1"; } catch { return false; }
}
function writeSeen() {
  try { window.localStorage.setItem(SEEN_KEY, "1"); } catch { /* Storage can be unavailable. */ }
}

function XMark() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.17h1.7L7.4 4.73H5.58l11.09 14.44Z" /></svg>;
}
function GoogleMark() {
  return <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.6 12.23c0-.7-.06-1.37-.18-2.02H12v3.83h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.33 2.98-7.33ZM12 22c2.7 0 4.96-.9 6.62-2.43l-3.24-2.5c-.9.6-2.04.95-3.38.95-2.6 0-4.8-1.76-5.59-4.12H3.07v2.6A10 10 0 0 0 12 22Zm-5.59-8.1a6 6 0 0 1 0-3.8V7.5H3.07a10 10 0 0 0 0 9l3.34-2.6ZM12 5.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.5l3.34 2.6C7.2 7.74 9.4 5.98 12 5.98Z" /></svg>;
}

type Method = "twitter" | "email" | "wallet" | "google";
const methods: { id: Method; label: string; icon: ReactNode }[] = [
  { id: "twitter", label: "Continue with X", icon: <XMark /> },
  { id: "email", label: "Continue with Email", icon: <Mail size={17} strokeWidth={1.5} /> },
  { id: "wallet", label: "Continue with Wallet", icon: <Wallet size={17} strokeWidth={1.5} /> },
  { id: "google", label: "Continue with Google", icon: <GoogleMark /> },
];

/**
 * Signed-out first visit: an ink splash that settles into the sign-in screen
 * (X, email, wallet or Google). Shown once per browser; `?intro=1` reopens it.
 */
export function IntroFlow({ session }: { session: Session }) {
  const signedOut = session.ready && !session.authenticated;
  const [open, setOpen] = useState(false);
  const [splash, setSplash] = useState(true);

  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).get("intro") === "1";
    if (forced || (signedOut && !readSeen())) setOpen(true);
  }, [signedOut]);
  useEffect(() => {
    if (!open || !splash) return;
    const timer = window.setTimeout(() => setSplash(false), 1800);
    return () => window.clearTimeout(timer);
  }, [open, splash]);
  // Signing in hands over to the setup flow.
  useEffect(() => { if (session.authenticated) setOpen(false); }, [session.authenticated]);

  if (!open) return null;
  const close = () => { writeSeen(); setOpen(false); };
  const signIn = (method?: Method) => { writeSeen(); session.login(method ? { loginMethods: [method], ...(method === "wallet" ? { walletChainType: "solana-only" as const } : {}) } : undefined); };

  return <div className={"intro" + (splash ? " is-splash" : "")} role="dialog" aria-modal="true" aria-label="Sign in to Igloo">
    <div className="intro-inner">
      <div className="intro-top" aria-hidden={splash}><span className="wordmark">Igloo<sup>®</sup></span><button type="button" className="btn btn-quiet btn-sm" tabIndex={splash ? -1 : 0} onClick={close}>Browse first</button></div>
      <button type="button" className="slab intro-hero" onClick={() => setSplash(false)} tabIndex={splash ? 0 : -1} aria-label={splash ? "Continue" : undefined}>
        <span className="intro-mark" aria-hidden="true"><CircleX size={26} strokeWidth={1.75} /></span>
        <span className="intro-brand">Igloo<sup>®</sup></span>
        <span className="intro-tagline">Watch the market.<br />Make your call.</span>
        <span className="intro-dot" aria-hidden="true" />
      </button>
      {!splash && <div className="intro-auth">
        <div className="rows intro-methods">{methods.map((method) => <button type="button" key={method.id} className="row intro-method" onClick={() => signIn(method.id)}>
          <span className="intro-method-icon">{method.icon}</span><span className="row-title">{method.label}</span><ArrowRight size={16} strokeWidth={1.5} />
        </button>)}</div>
        <p className="intro-terms">By continuing, you agree to Igloo&apos;s Terms of Service and Privacy Policy.</p>
        <p className="intro-signin">Already have an account? <button type="button" className="link-btn" onClick={() => signIn()}>Sign in</button></p>
      </div>}
    </div>
  </div>;
}
