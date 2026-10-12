"use client";

import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { prefersReducedMotion } from "@/lib/motion";
import { THEME_KEY } from "@/lib/theme-boot";

export type Theme = "light" | "dark";
const CANVAS: Record<Theme, string> = { light: "#ebeae4", dark: "#081517" };

const listeners = new Set<() => void>();
function current(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    current,
    () => "light",
  );
}

type TransitionDocument = Document & { startViewTransition?: (update: () => void) => { ready: Promise<void> } };

/**
 * Switches theme, revealing the new one as a circle that grows out of
 * `origin` (the switch that was tapped).
 */
export function setTheme(next: Theme, origin?: HTMLElement | null) {
  const apply = () => {
    document.documentElement.dataset.theme = next;
    syncThemeColor(next);
    listeners.forEach((listener) => listener());
  };
  try { window.localStorage.setItem(THEME_KEY, next); } catch { /* Storage can be unavailable. */ }
  const doc = document as TransitionDocument;
  if (!doc.startViewTransition || prefersReducedMotion()) { apply(); return; }
  const rect = origin?.getBoundingClientRect();
  const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const y = rect ? rect.top + rect.height / 2 : 0;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = doc.startViewTransition(() => flushSync(apply));
  void transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 620, easing: "cubic-bezier(0.45, 0, 0.2, 1)", pseudoElement: "::view-transition-new(root)" },
    );
  }).catch(() => undefined);
}

/** Keeps the browser chrome colour in step with the theme. */
export function syncThemeColor(theme: Theme) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", CANVAS[theme]);
}

/** The light/dark switch, as used in Settings and the side rail. */
export function useThemeSwitch() {
  const theme = useTheme();
  return {
    dark: theme === "dark",
    toggle: (origin?: HTMLElement | null) => setTheme(theme === "dark" ? "light" : "dark", origin),
  };
}
