"use client";

import { useLayoutEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * Eases from the last shown value to `target`, calling `apply` each frame.
 * Callers write straight to the DOM, so counting never re-renders React.
 */
export function useTween(target: number | null, apply: (value: number) => void, duration = 900) {
  const last = useRef<number | null>(null);
  const write = useRef(apply);
  useLayoutEffect(() => { write.current = apply; });
  useLayoutEffect(() => {
    if (target === null || !Number.isFinite(target)) return;
    const origin = last.current ?? 0;
    if (prefersReducedMotion() || origin === target) { last.current = target; write.current(target); return; }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const value = origin + (target - origin) * (1 - Math.pow(1 - t, 3));
      last.current = value;
      write.current(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    write.current(origin);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
}

/** Writes into the text node React rendered, so React's own updates still land. */
export function setText(element: HTMLElement | null, text: string) {
  const node = element?.firstChild;
  if (node && node.nodeType === Node.TEXT_NODE) node.nodeValue = text;
}

const whole = (n: number) => String(Math.round(n));

export function CountUp({ value, format = whole }: { value: number | null; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useTween(value, (n) => setText(ref.current, format(n)));
  return <span ref={ref}>{value === null || !Number.isFinite(value) ? "—" : format(value)}</span>;
}
