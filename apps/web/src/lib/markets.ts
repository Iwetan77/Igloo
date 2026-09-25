"use client";

import { useEffect, useState } from "react";

export function marketEnded(endTime?: string | null, now = Date.now()): boolean {
  if (!endTime) return false;
  const timestamp = Date.parse(endTime);
  return Number.isFinite(timestamp) && timestamp <= now;
}

export function useMarketClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
