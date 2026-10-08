"use client";

import { flushSync } from "react-dom";

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Update = () => void;
type TransitionDocument = Document & { startViewTransition?: (arg: Update | { update: Update; types: string[] }) => unknown };

function supportsTypes() {
  const vt = (window as unknown as { ViewTransition?: { prototype: object } }).ViewTransition;
  return Boolean(vt && "types" in vt.prototype);
}

/**
 * Applies a state change inside a view transition, so the new view wipes down
 * over the old one (see the ::view-transition rules in globals.css). "tab"
 * marks a switch within one page, which also slides the active tab pill.
 * Browsers without view transitions, or with reduced motion, just update.
 */
export function withTransition(update: Update, type: "page" | "tab" = "tab") {
  const doc = typeof document === "undefined" ? null : document as TransitionDocument;
  if (!doc?.startViewTransition || prefersReducedMotion()) { update(); return; }
  const run = () => flushSync(update);
  if (supportsTypes()) doc.startViewTransition({ update: run, types: [type] });
  else doc.startViewTransition(run);
}
