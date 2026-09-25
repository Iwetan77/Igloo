"use client";

import { useEffect, useState } from "react";

export type Countdown = { label: string; ended: boolean; remainingMs: number };

export function formatCountdown(endTime: string | null | undefined, now: number): Countdown | null {
  if (!endTime) return null;
  const end = Date.parse(endTime);
  if (!Number.isFinite(end)) return null;
  const remainingMs = Math.max(0, end - now);
  if (remainingMs === 0) return { label: "Ended", ended: true, remainingMs };
  const seconds = Math.ceil(remainingMs / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const shortSeconds = seconds % 60;
  const label = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${shortSeconds}s`;
  return { label, ended: false, remainingMs };
}

export function useCountdown(endTime?: string | null): Countdown | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [endTime]);
  return now === null ? null : formatCountdown(endTime, now);
}
