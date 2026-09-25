"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import categories from "../../../../content/categories.json";
import { errorCopy } from "@/lib/copy";
import type { Session } from "@/lib/use-session";

export function OnboardingPicker({ session }: { session: Session }) {
  const [selected, setSelected] = useState<string[]>(session.me?.interests || []);
  const [saving, setSaving] = useState(false);
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

  return <div className="overlay onboarding-overlay"><section className="sheet onboarding-sheet" role="dialog" aria-modal="true" aria-label="Choose interests">
    <span className="eyebrow">Make Igloo yours</span>
    <h2>What are you watching?</h2>
    <p className="sheet-question">Pick at least three topics.</p>
    <div className="interest-grid">{categories.map((category) => <button key={category.id} type="button" className={"interest-chip" + (selected.includes(category.id) ? " active" : "")} aria-pressed={selected.includes(category.id)} onClick={() => toggle(category.id)}>{selected.includes(category.id) && <Check size={15} />}{category.label}</button>)}</div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <button type="button" className="solid-action" disabled={selected.length < 3 || saving} onClick={() => { void save(); }}>{saving ? "Saving..." : "Continue"}</button>
  </section></div>;
}
