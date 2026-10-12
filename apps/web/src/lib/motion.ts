"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Give the tapped card a small press response, then navigate immediately.
 * A full-viewport expansion delayed navigation and obscured the stable rail.
 */
export function expandInto(from: HTMLElement | null, go: () => void) {
  if (from && !prefersReducedMotion() && typeof from.animate === "function") {
    try {
      from.animate([{ transform: "scale(1)" }, { transform: "scale(0.985)" }, { transform: "scale(1)" }], {
        duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      });
    } catch { /* Optional feedback must never prevent navigation. */ }
  }
  go();
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
    if (active) observer.observe(active);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [key]);
  return { host, bar };
}
