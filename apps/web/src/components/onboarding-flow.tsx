"use client";

import { useEffect, useState } from "react";
import { Camera, Check, LoaderCircle } from "lucide-react";
import { ApiError, getUserByUsername } from "@/lib/api";
import { uploadAvatar } from "@/lib/avatar";
import { categories } from "@/lib/categories";
import { errorCopy } from "@/lib/copy";
import { ProfileAvatar } from "@/components/profile-avatar";
import type { Session } from "@/lib/use-session";
import "@/styles/onboarding.css";

const USERNAME = /^[a-z0-9_.]{3,20}$/;
type Step = "profile" | "interests" | "welcome";
type Availability = "idle" | "checking" | "available" | "taken" | "invalid";

/**
 * Full-screen first-run setup: handle and name, then interests, then a short
 * welcome. Stays mounted through the welcome even after `me` is complete.
 */
export function OnboardingFlow({ session }: { session: Session }) {
  const me = session.me;
  const needsProfile = Boolean(me && !me.username);
  const needsInterests = Boolean(me && !me.onboarded);
  const [active, setActive] = useState(false);
  const [plan, setPlan] = useState<Step[]>([]);
  const [step, setStep] = useState<Step>("profile");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState(me?.display_name || "");
  const [availability, setAvailability] = useState<Availability>("idle");
  const [selected, setSelected] = useState<string[]>(me?.interests || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { authorized } = session;

  useEffect(() => {
    if (!active && (needsProfile || needsInterests)) {
      const steps: Step[] = needsProfile ? ["profile"] : [];
      if (needsInterests) steps.push("interests");
      setPlan(steps);
      setStep(steps[0]);
      setActive(true);
    }
  }, [active, needsProfile, needsInterests]);

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
    const timer = window.setTimeout(() => setActive(false), 2600);
    return () => window.clearTimeout(timer);
  }, [step]);

  if (!active || !me) return null;

  async function saveProfile() {
    if (saving || availability === "taken" || !USERNAME.test(username.trim())) return;
    setSaving(true);
    setError("");
    try {
      await session.updateProfile({ username: username.trim(), ...(displayName.trim() ? { display_name: displayName.trim() } : {}) });
      setStep(plan.includes("interests") ? "interests" : "welcome");
    } catch (cause) { setError(errorCopy(cause)); }
    finally { setSaving(false); }
  }
  async function saveInterests() {
    if (selected.length < 3 || saving) return;
    setSaving(true);
    setError("");
    try {
      await session.saveInterests(selected);
      setStep("welcome");
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

  const index = plan.indexOf(step) + 1;
  const status = { idle: "", checking: "Checking", available: "Available", taken: "Taken", invalid: "3–20 a–z, 0–9, _ or ." }[availability];

  return <div className="onboarding" role="dialog" aria-modal="true" aria-label="Set up your Igloo account">
    {step === "welcome" ? <div className="onboarding-welcome">
      <span className="welcome-mark"><Check size={40} strokeWidth={1.25} /></span>
      <h1>Welcome to Igloo</h1>
      <p>Your live prediction feed is ready.</p>
      <button type="button" className="btn btn-primary" onClick={() => setActive(false)}>Enter</button>
      <span className="label live-dot welcome-foot">Entering workspace</span>
    </div> : <div className="onboarding-panel">
      {plan.length > 1 && <span className="tag onboarding-step">Step {index} of {plan.length}</span>}
      {step === "profile" ? <>
        <h1>Set up your profile</h1>
        <p className="onboarding-lede">Choose how you appear across markets, feeds, and comments.</p>
        <label className="onboarding-avatar"><span className="avatar-ring"><ProfileAvatar src={me.avatar_url} name={me.display_name} size={96} /></span><span className="onboarding-avatar-edit" aria-hidden="true"><Camera size={15} strokeWidth={1.5} /></span><span className="visually-hidden">Upload a profile photo</span><input type="file" className="visually-hidden" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void chooseAvatar(event.target.files?.[0]); }} /></label>
        <label className="field"><span className="label">Username (unique handle)</span><span className={"input-wrap" + (availability === "available" ? " ok" : availability === "taken" || availability === "invalid" ? " bad" : "")}><span>@</span><input autoFocus maxLength={20} value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))} placeholder="username" aria-describedby="username-status" />{status && <span id="username-status" className={"label username-status " + availability}>{availability === "checking" ? <LoaderCircle size={12} className="spin" /> : availability === "available" ? <Check size={12} /> : null}{status}</span>}</span></label>
        <label className="field"><span className="label">Display name</span><input className="input" maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" /></label>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <button type="button" className="btn btn-primary btn-lg btn-block onboarding-cta" disabled={saving || availability === "taken" || availability === "checking" || !USERNAME.test(username.trim())} onClick={() => { void saveProfile(); }}>{saving ? "Saving…" : "Continue"}</button>
      </> : <>
        <h1>What are you into?</h1>
        <p className="onboarding-lede">Pick at least three topics to tune your live prediction feed.</p>
        <div className="interest-chips">{categories.map((category) => <button key={category.id} type="button" className={"chip" + (selected.includes(category.id) ? " active" : "")} aria-pressed={selected.includes(category.id)} onClick={() => setSelected((current) => current.includes(category.id) ? current.filter((item) => item !== category.id) : [...current, category.id])}>{category.label}</button>)}</div>
        <p className="label">{selected.length} selected{selected.length < 3 ? " · " + (3 - selected.length) + " more" : ""}</p>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <button type="button" className="btn btn-primary btn-lg btn-block onboarding-cta" disabled={saving || selected.length < 3} onClick={() => { void saveInterests(); }}>{saving ? "Saving…" : "Finish setup"}</button>
      </>}
    </div>}
  </div>;
}
