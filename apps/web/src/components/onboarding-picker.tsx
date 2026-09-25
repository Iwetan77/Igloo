"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import categories from "../../../../content/categories.json";
import { errorCopy } from "@/lib/copy";
import type { Session } from "@/lib/use-session";

export function OnboardingPicker({ session }: { session: Session }) {
  const [selected, setSelected] = useState<string[]>(session.me?.interests || []);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function save() {
    if (selected.length < 3 || saving) return;
    setSaving(true);
    setError("");
    try {
      await session.saveInterests(selected);
    } catch (cause) {
      setError(errorCopy(cause));
    } finally {
      setSaving(false);
    }
  }

  const needsInterests = session.me?.onboarded === false;
  async function saveUsername() {
    const value = username.trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,20}$/.test(value) || saving) return;
    setSaving(true);
    setError("");
    try { await session.updateProfile({ username: value }); }
    catch (cause) { setError(errorCopy(cause)); }
    finally { setSaving(false); }
  }

  return <div className="overlay onboarding-overlay"><section className="sheet onboarding-sheet" role="dialog" aria-modal="true" aria-label="Choose interests">
    <span className="eyebrow">Make Igloo yours</span>
    <h2>{needsInterests ? "What are you watching?" : "Choose your username"}</h2>
    <p className="sheet-question">{needsInterests ? "Pick at least three topics." : "Your name around Igloo."}</p>
    {needsInterests ? <div className="interest-grid">{categories.map((category) => <button key={category.id} type="button" className={"interest-chip" + (selected.includes(category.id) ? " active" : "")} aria-pressed={selected.includes(category.id)} onClick={() => toggle(category.id)}>{selected.includes(category.id) && <Check size={15} />}{category.label}</button>)}</div> : <label className="username-entry"><span>@</span><input autoFocus aria-label="Username" maxLength={20} value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))} placeholder="username" /></label>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    <button type="button" className="solid-action" disabled={saving || (needsInterests ? selected.length < 3 : !/^[a-z0-9_.]{3,20}$/.test(username.trim()))} onClick={() => { void (needsInterests ? save() : saveUsername()); }}>{saving ? "Saving..." : "Continue"}</button>
  </section></div>;
}
