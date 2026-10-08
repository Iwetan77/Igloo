"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Camera, Check, Copy, KeyRound, LoaderCircle, TriangleAlert, Users } from "lucide-react";
import { ApiError, getFeed, getUserByUsername, setFollow } from "@/lib/api";
import { uploadAvatar } from "@/lib/avatar";
import { categories } from "@/lib/categories";
import { errorCopy } from "@/lib/copy";
import { useDirection } from "@/lib/motion";
import { shortId } from "@/lib/format";
import { ProfileAvatar, authorName } from "@/components/profile-avatar";
import type { Author } from "@/lib/types";
import type { Session } from "@/lib/use-session";
import "@/styles/onboarding.css";

const USERNAME = /^[a-z0-9_.]{3,20}$/;
type Step = "wallet" | "profile" | "x" | "follow" | "interests" | "welcome";
const ORDER: Step[] = ["wallet", "profile", "x", "follow", "interests", "welcome"];
type Availability = "idle" | "checking" | "available" | "taken" | "invalid";
// Linking X leaves the page for X's OAuth screen; this brings the user back to the same step.
const RESUME_KEY = "igloo.onboardingStep";

function readResume(): Step | null {
  try { return window.sessionStorage.getItem(RESUME_KEY) as Step | null; } catch { return null; }
}
function writeResume(step: Step | null) {
  try { if (step) window.sessionStorage.setItem(RESUME_KEY, step); else window.sessionStorage.removeItem(RESUME_KEY); } catch { /* Storage can be unavailable. */ }
}

/**
 * Full-screen first-run setup after sign-in, in four numbered steps (wallet,
 * profile, X, people to follow), then preferences and a short welcome. Stays
 * mounted through the welcome even after `me` is complete.
 */
export function OnboardingFlow({ session }: { session: Session }) {
  const me = session.me;
  const needsProfile = Boolean(me && !me.username);
  const needsInterests = Boolean(me && !me.onboarded);
  const [active, setActive] = useState(false);
  const [plan, setPlan] = useState<Step[]>([]);
  const [step, setStep] = useState<Step>("profile");
  const stepDirection = useDirection(ORDER.indexOf(step));
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState(me?.display_name || "");
  const [availability, setAvailability] = useState<Availability>("idle");
  const [selected, setSelected] = useState<string[]>(me?.interests || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [people, setPeople] = useState<Author[] | null>(null);
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const { authorized, xHandle } = session;

  useEffect(() => {
    if (!active && (needsProfile || needsInterests)) {
      const steps: Step[] = session.address ? ["wallet"] : [];
      if (needsProfile) steps.push("profile");
      if (!xHandle) steps.push("x");
      steps.push("follow");
      if (needsInterests) steps.push("interests");
      const resume = readResume();
      setPlan(steps);
      setStep(resume && steps.includes(resume) ? resume : steps[0]);
      if (resume) setUnderstood(true);
      setActive(true);
    }
  }, [active, needsProfile, needsInterests, session.address, xHandle]);

  // People to follow: the authors behind the live For You feed.
  useEffect(() => {
    if (step !== "follow" || people !== null) return;
    void authorized((token) => getFeed(null, token, { tab: "for_you" })).then((page) => {
      const byId = new Map<string, Author>();
      for (const post of page.posts) if (post.author.id !== me?.id && !post.demo) byId.set(post.author.id, post.author);
      setPeople([...byId.values()].slice(0, 6));
    }).catch(() => setPeople([]));
  }, [step, people, authorized, me?.id]);

  useEffect(() => {
    const value = username.trim();
    if (!value) { setAvailability("idle"); return; }
    if (!USERNAME.test(value)) { setAvailability("invalid"); return; }
    setAvailability("checking");
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void authorized((token) => getUserByUsername(value, token))
        .then((user) => { if (!cancelled) setAvailability(user.id === me?.id ? "available" : "taken"); })
        .catch((cause) => { if (!cancelled) setAvailability(cause instanceof ApiError && cause.status === 404 ? "available" : "idle"); });
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [username, authorized, me?.id]);

  useEffect(() => {
    if (step !== "welcome") return;
    writeResume(null);
    const timer = window.setTimeout(() => setActive(false), 2800);
    return () => window.clearTimeout(timer);
  }, [step]);

  if (!active || !me) return null;

  const position = plan.indexOf(step);
  const go = (to: Step) => { setError(""); setStep(to); };
  const next = (from: Step) => go(plan[plan.indexOf(from) + 1] ?? "welcome");
  const isLast = (current: Step) => plan.indexOf(current) === plan.length - 1;
  async function toggleFollow(author: Author) {
    const on = !following[author.id];
    setFollowing((current) => ({ ...current, [author.id]: on }));
    try { await authorized((token) => setFollow(author.id, on, token)); }
    catch (cause) { setFollowing((current) => ({ ...current, [author.id]: !on })); setError(errorCopy(cause)); }
  }
  async function saveProfile() {
    if (saving || availability === "taken" || !USERNAME.test(username.trim())) return;
    setSaving(true);
    setError("");
    try {
      await session.updateProfile({ username: username.trim(), ...(displayName.trim() ? { display_name: displayName.trim() } : {}) });
      next("profile");
    } catch (cause) { setError(errorCopy(cause)); }
    finally { setSaving(false); }
  }
  async function saveInterests() {
    if (selected.length < 3 || saving) return;
    setSaving(true);
    setError("");
    try {
      await session.saveInterests(selected);
      next("interests");
    } catch (cause) { setError(errorCopy(cause)); }
    finally { setSaving(false); }
  }
  async function chooseAvatar(file?: File) {
    if (!file) return;
    setSaving(true);
    setError("");
    try { await uploadAvatar(session, file); }
    catch (cause) { setError(cause instanceof ApiError ? errorCopy(cause) : cause instanceof Error ? cause.message : errorCopy(cause)); }
    finally { setSaving(false); }
  }
  async function backUp() {
    setError("");
    try { await session.backUpWallet(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : errorCopy(cause)); }
  }
  function linkX() {
    writeResume("x");
    session.linkTwitter();
  }

  // Numbered steps exclude preferences, which the design shows as its own screen.
  const numbered: Step[] = plan.filter((item) => item !== "interests");
  const stepNumber = numbered.indexOf(step) + 1;
  const stepLabel = step === "interests" ? "Preferences" : `Step ${stepNumber} of ${numbered.length}`;
  const intro = (title: string, lede: string) => <div className="slab onboarding-intro"><h1>{title}</h1><p className="onboarding-lede">{lede}</p></div>;
  const status = { idle: "", checking: "Checking", available: "Available", taken: "Taken", invalid: "3–20 a–z, 0–9, _ or ." }[availability];
  const cta = (label: string, onClick: () => void, disabled = false) => <button type="button" className="btn btn-primary btn-lg btn-block onboarding-cta" disabled={disabled} onClick={onClick}>{label}</button>;

  if (step === "welcome") return <div className="onboarding" role="dialog" aria-modal="true" aria-label="Welcome to Igloo">
    <button type="button" className="onboarding-welcome slab" onClick={() => setActive(false)}>
      <span className="welcome-mark"><Check size={44} strokeWidth={1.75} /></span>
      <h1>Welcome to Igloo</h1>
      <p>Your live prediction feed is ready.</p>
      <span className="label live-dot welcome-foot">Entering workspace…</span>
    </button>
  </div>;

  return <div className="onboarding" role="dialog" aria-modal="true" aria-label="Set up your Igloo account">
    <div className="onboarding-shell">
      <div className="onboarding-top">
        {position > 0 ? <button type="button" className="icon-btn sm" onClick={() => go(plan[position - 1])} aria-label="Back"><ArrowLeft size={17} strokeWidth={1.5} /></button> : <span className="onboarding-top-spacer" />}
        <span className="onboarding-step"><span className="tag" key={stepLabel}>{stepLabel}</span>
          {numbered.length > 1 && <span className="onboarding-progress" aria-hidden="true">{plan.map((item, index) => <span key={item} className={index < position ? "done" : index === position ? "active" : ""} />)}</span>}
        </span>
        <span className="onboarding-top-spacer" />
      </div>
      <div className={"onboarding-panel step-body " + stepDirection} key={step}>
        {step === "wallet" ? <>
          {session.embeddedWallet
            ? intro("Your wallet is ready.", "Igloo created a self-custodial Solana wallet when you signed in. It holds your USDC and signs your trades.")
            : intro("Wallet linked.", "Your trades sign with the Solana wallet you connected. Igloo never holds its keys.")}
          <div className="onboarding-wallet">
            <div className="slab onboarding-account">
              <span className="onboarding-account-icon"><KeyRound size={18} strokeWidth={1.5} /></span>
              <span className="row-main"><span className="label">Active wallet · Solana</span><span className="onboarding-address">{shortId(session.address || "")}</span></span>
              <button type="button" className="icon-btn sm" onClick={() => { void navigator.clipboard.writeText(session.address || "").then(() => setCopied(true)).catch(() => undefined); }} aria-label={copied ? "Address copied" : "Copy wallet address"}>{copied ? <Check size={16} /> : <Copy size={16} strokeWidth={1.5} />}</button>
            </div>
            {session.embeddedWallet ? <div className="notice warn onboarding-backup">
              <TriangleAlert size={18} strokeWidth={1.5} />
              <div>
                <strong>Back up your wallet key</strong>
                Your wallet is tied to the account you signed in with. If you lose access to it without a backup, you lose your funds and open positions.
                <button type="button" className="btn btn-sm onboarding-export" onClick={() => { void backUp(); }}><KeyRound size={14} strokeWidth={1.5} />Export private key</button>
                <label className="onboarding-check"><input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} /><span className="onboarding-box" aria-hidden="true"><Check size={13} strokeWidth={2.5} /></span>I understand my recovery responsibilities</label>
              </div>
            </div> : <p className="label onboarding-note">Deposit USDC on Solana any time from Profile → Wallet.</p>}
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          {cta("Continue", () => next("wallet"), session.embeddedWallet && !understood)}
        </> : step === "profile" ? <>
          {intro("Set up your profile.", "Choose how you appear across markets, prediction feeds, and comments.")}
          <label className="onboarding-avatar"><span className="avatar-ring"><ProfileAvatar src={me.avatar_url} name={me.display_name} size={96} /></span><span className="onboarding-avatar-edit" aria-hidden="true">{saving ? <LoaderCircle size={14} className="spin" /> : <Camera size={15} strokeWidth={1.5} />}</span><span className="visually-hidden">Upload a profile photo</span><input type="file" className="visually-hidden" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void chooseAvatar(event.target.files?.[0]); }} /></label>
          <label className="field"><span className="label">Username (unique handle)</span><span className={"input-wrap" + (availability === "available" ? " ok" : availability === "taken" || availability === "invalid" ? " bad" : "")}><span>@</span><input maxLength={20} value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))} placeholder="username" aria-describedby="username-status" />{status && <span id="username-status" className={"label username-status " + availability}>{availability === "checking" ? <LoaderCircle size={12} className="spin" /> : availability === "available" ? <Check size={12} /> : null}{status}</span>}</span></label>
          <label className="field"><span className="label">Display name</span><input className="input" maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" /></label>
          {error && <p className="inline-error" role="alert">{error}</p>}
          {cta(saving ? "Saving…" : "Continue", () => { void saveProfile(); }, saving || availability === "taken" || availability === "checking" || !USERNAME.test(username.trim()))}
        </> : step === "x" ? <>
          {intro("Link your X account.", "Show people who is making the call. Your verified handle sits next to your takes.")}
          <div className="onboarding-x">
            <span className="onboarding-x-mark" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.17h1.7L7.4 4.73H5.58l11.09 14.44Z" /></svg></span>
            {xHandle ? <span className="input-wrap ok onboarding-x-handle"><span>@</span><span className="onboarding-x-value">{xHandle}</span><span className="label username-status available"><Check size={12} />Linked</span></span>
              : <button type="button" className="btn btn-lg btn-block" onClick={linkX}>Link X account</button>}
            <p className="field-hint">Optional. Igloo only reads your handle and never posts for you.</p>
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <div className="onboarding-cta onboarding-stack">{cta("Continue", () => next("x"), !xHandle)}<button type="button" className="btn btn-quiet btn-block" onClick={() => next("x")}>Skip for now</button></div>
        </> : step === "follow" ? <>
          {intro("Follow popular predictors.", "Start with the sharpest callers. Their takes and positions land in your Following feed.")}
          <div className="rows onboarding-people">
            {people === null && <p className="loading-line"><LoaderCircle size={16} className="spin" />Finding people</p>}
            {people?.length === 0 && <p className="empty-note"><Users size={16} /> No suggestions yet. Find people later from Search.</p>}
            {people?.map((author) => <div className="row" key={author.id}><ProfileAvatar src={author.avatar_url} name={author.display_name} size={40} /><span className="row-main"><span className="row-title">{author.display_name || authorName(author)}</span>{author.username && <span className="row-sub">@{author.username}</span>}</span><button type="button" className={"btn btn-sm follow-toggle" + (following[author.id] ? " on" : " btn-primary")} aria-pressed={Boolean(following[author.id])} onClick={() => { void toggleFollow(author); }}>{following[author.id] ? <><Check size={12} />Following</> : "Follow"}</button></div>)}
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <div className="onboarding-cta onboarding-stack">{cta(isLast("follow") ? "Finish setup" : "Continue", () => next("follow"))}<button type="button" className="btn btn-quiet btn-block" onClick={() => next("follow")}>Skip suggestions</button></div>
        </> : <>
          {intro("What are you into?", "Pick at least three topics to tune your live prediction feed.")}
          <div className="interest-chips">{categories.map((category) => <button key={category.id} type="button" className={"chip" + (selected.includes(category.id) ? " active" : "")} aria-pressed={selected.includes(category.id)} onClick={() => setSelected((current) => current.includes(category.id) ? current.filter((item) => item !== category.id) : [...current, category.id])}>{selected.includes(category.id) && <Check size={13} />}{category.label}</button>)}</div>
          <p className="label onboarding-count">{selected.length} selected{selected.length < 3 ? " · " + (3 - selected.length) + " more" : ""}</p>
          {error && <p className="inline-error" role="alert">{error}</p>}
          {cta(saving ? "Saving…" : "Finish setup", () => { void saveInterests(); }, saving || selected.length < 3)}
        </>}
      </div>
    </div>
  </div>;
}
