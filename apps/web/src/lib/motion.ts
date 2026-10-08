"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Update = () => void;
type TransitionDocument = Document & { startViewTransition?: (update: Update) => unknown };

/**
 * Swaps whole pages inside a view transition. The page itself is not
 * animated by the transition (each page plays its own entrance); only
 * persistent pieces with a view-transition-name, like the dock pill, glide
 * between their old and new places.
 */
export function withTransition(update: Update) {
  const doc = typeof document === "undefined" ? null : document as TransitionDocument;
  if (!doc?.startViewTransition || prefersReducedMotion()) { update(); return; }
  doc.startViewTransition(() => flushSync(update));
}

/**
 * Grows an ink panel out of the tapped card until it fills the screen, then
 * runs `go` (the navigation) and fades the panel away over the new page.
 */
export function expandInto(from: HTMLElement | null, go: () => void) {
  if (!from || prefersReducedMotion() || typeof from.animate !== "function") { go(); return; }
  const rect = from.getBoundingClientRect();
  const radius = getComputedStyle(from).borderRadius || "22px";
  const ghost = document.createElement("div");
  ghost.className = "expand-ghost";
  Object.assign(ghost.style, { top: rect.top + "px", left: rect.left + "px", width: rect.width + "px", height: rect.height + "px", borderRadius: radius });
  document.body.appendChild(ghost);
  const grow = ghost.animate([
    { top: rect.top + "px", left: rect.left + "px", width: rect.width + "px", height: rect.height + "px", borderRadius: radius },
    { top: "0px", left: "0px", width: window.innerWidth + "px", height: window.innerHeight + "px", borderRadius: "0px" },
  ], { duration: 460, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" });
  grow.onfinish = () => {
    go();
    window.setTimeout(() => {
      const fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" });
      fade.onfinish = () => ghost.remove();
    }, 90);
  };
}

/** "forward" when a step or tab index grows, "back" when it shrinks. */
export function useDirection(index: number): "forward" | "back" {
  const previous = useRef(index);
  const direction = index >= previous.current ? "forward" : "back";
  useEffect(() => { previous.current = index; }, [index]);
  return direction;
}

/**
 * Positions a sliding highlight under whichever child has `.active`, inside
 * `host`. The first placement is instant; later ones glide.
 */
export function useIndicator<T extends HTMLElement>(key: unknown) {
  const host = useRef<T>(null);
  const bar = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const root = host.current;
    const indicator = bar.current;
    if (!root || !indicator) return;
    const place = () => {
      const active = root.querySelector<HTMLElement>(":scope > .active, :scope > * > .active");
      if (!active) { indicator.style.opacity = "0"; return; }
      indicator.style.opacity = "1";
      indicator.style.width = active.offsetWidth + "px";
      indicator.style.height = active.offsetHeight + "px";
      indicator.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
    };
    place();
    const active = root.querySelector<HTMLElement>(":scope > .active");
    if (active && root.scrollWidth > root.clientWidth) {
      root.scrollTo({ left: active.offsetLeft - (root.clientWidth - active.offsetWidth) / 2, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
    root.classList.add("indicator-on");
    const frame = requestAnimationFrame(() => indicator.classList.add("ready"));
    const observer = new ResizeObserver(place);
    observer.observe(root);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [key]);
  return { host, bar };
}
