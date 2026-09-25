"use client";

import { useCallback, useEffect, useRef } from "react";
import { postView } from "@/lib/api";
import type { Session } from "@/lib/use-session";

type ViewSignal = { event_id: string; post_id: string; watch_ms: number; completed: boolean; user_id: string };
type Playback = { id: string; startedAt: number | null; watchMs: number; completed: boolean };
const STORAGE_KEY = "igloo.pendingViews";

function readQueue(): ViewSignal[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function writeQueue(items: ViewSignal[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* Storage may be unavailable. */ }
}

export function useWatchSignals(activeId: string, session: Session) {
  const { authenticated, authorized, user } = session;
  const playback = useRef<Playback | null>(null);
  const draining = useRef(false);

  const drain = useCallback(async () => {
    if (!authenticated || !user?.id || draining.current) return;
    draining.current = true;
    try {
      const items = readQueue();
      for (const item of items) {
        if (item.user_id !== user.id) continue;
        try {
          await authorized((token) => postView(item.post_id, item.watch_ms, item.completed, token));
          const remaining = readQueue();
          writeQueue(remaining.filter((entry) => entry.event_id !== item.event_id));
        } catch { break; }
      }
    } finally { draining.current = false; }
  }, [authenticated, authorized, user?.id]);

  const stopClock = useCallback(() => {
    const current = playback.current;
    if (current?.startedAt !== null && current?.startedAt !== undefined) {
      current.watchMs += Math.max(0, performance.now() - current.startedAt);
      current.startedAt = null;
    }
  }, []);

  const flush = useCallback(() => {
    const current = playback.current;
    if (!current) return;
    stopClock();
    playback.current = null;
    if (!authenticated || !user?.id || current.id.startsWith("demo-")) return;
    writeQueue([...readQueue(), { event_id: crypto.randomUUID(), post_id: current.id, watch_ms: Math.round(current.watchMs), completed: current.completed, user_id: user.id }]);
    void drain();
  }, [drain, authenticated, user?.id, stopClock]);

  useEffect(() => {
    if (activeId) playback.current = { id: activeId, startedAt: null, watchMs: 0, completed: false };
    return () => flush();
  }, [activeId, flush]);

  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    const timer = window.setInterval(() => { void drain(); }, 15000);
    void drain();
    return () => { window.removeEventListener("pagehide", onHide); window.clearInterval(timer); };
  }, [drain, flush]);

  return {
    onPlay(id: string) {
      if (!playback.current && id === activeId) playback.current = { id, startedAt: null, watchMs: 0, completed: false };
      if (playback.current?.id === id && playback.current.startedAt === null) playback.current.startedAt = performance.now();
    },
    onPause(id: string) { if (playback.current?.id === id) stopClock(); },
    onTimeUpdate(id: string, video: HTMLVideoElement) {
      if (playback.current?.id === id && Number.isFinite(video.duration) && video.duration > 0 && video.currentTime >= video.duration - 0.25) playback.current.completed = true;
    },
    onEnded(id: string) { if (playback.current?.id === id) playback.current.completed = true; },
  };
}
