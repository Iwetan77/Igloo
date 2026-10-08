"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";

/** Eases a number from its last shown value to `target`, so figures count up on arrival. */
export function useCountUp(target: number | null, duration = 900) {
  const [shown, setShown] = useState<number | null>(target === null ? null : 0);
  const last = useRef(0);
  useEffect(() => {
    if (target === null || !Number.isFinite(target)) { setShown(target); return; }
    if (prefersReducedMotion()) { last.current = target; setShown(target); return; }
    const origin = last.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const value = origin + (target - origin) * (1 - Math.pow(1 - t, 3));
      last.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return shown;
}

export function CountUp({ value, format = (n) => String(Math.round(n)) }: { value: number | null; format?: (n: number) => string }) {
  const shown = useCountUp(value);
  return <>{shown === null ? "—" : format(shown)}</>;
}
