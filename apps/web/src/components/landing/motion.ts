"use client";

import { useEffect, useState, type DependencyList, type RefObject } from "react";

export const EASE_REVEAL = "cubic-bezier(.2,.7,.2,1)";

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Window size, with a stable server default until mounted. */
export function useViewport() {
  const [size, setSize] = useState({ vw: 1280, vh: 800 });
  useEffect(() => {
    const update = () => setSize({ vw: window.innerWidth, vh: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return size;
}

type Reveal = { play: () => void; cancel: () => void };

/**
 * Builds paused animations with `setup`, then plays them once when the element
 * is 30% visible. Skipped under prefers-reduced-motion, so the element stays
 * in its final state.
 */
export function useRevealOnce<T extends Element>(
  ref: RefObject<T | null>,
  setup: (el: T) => Reveal | undefined,
  deps: DependencyList = [],
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const ctl = setup(el);
    if (!ctl) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting)) {
          ctl.play();
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      ctl.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Signature motion: each [data-w] word goes from 0.12 opacity / 14px blur to sharp. */
export function useBlurReveal<T extends Element>(ref: RefObject<T | null>, baseDelay = 0) {
  useRevealOnce(ref, (el) => {
    const anims = Array.from(el.querySelectorAll("[data-w]")).map((w, i) => {
      const a = w.animate(
        [
          { opacity: 0.12, filter: "blur(14px)" },
          { opacity: 1, filter: "blur(0px)" },
        ],
        { duration: 950, delay: baseDelay + i * 95, easing: EASE_REVEAL, fill: "both" },
      );
      a.pause();
      return a;
    });
    return {
      play: () => anims.forEach((a) => a.play()),
      cancel: () => anims.forEach((a) => a.cancel()),
    };
  });
}
