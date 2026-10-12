"use client";

import { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

/**
 * Drag the knob to the end to confirm. The knob is also a plain button, so a
 * click, Enter or Space confirms for keyboard and assistive-tech users.
 */
export function SlideConfirm({ label, onConfirm, disabled = false }: { label: string; onConfirm: () => void; disabled?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);
  const moved = useRef(false);
  const [offset, setOffset] = useState(0);

  function max() {
    const element = track.current;
    return element ? element.clientWidth - 56 : 0;
  }
  function release() {
    const done = offset >= max() * 0.88;
    start.current = null;
    setOffset(0);
    if (done && !disabled) onConfirm();
  }

  return <div ref={track} className={"slide-confirm" + (disabled ? " disabled" : "")} style={{ ["--slide" as string]: offset + "px" }}>
    <span className="slide-fill" aria-hidden="true" />
    <span className="slide-label" aria-hidden="true">{label}</span>
    <button
      type="button"
      className="slide-knob"
      disabled={disabled}
      aria-label={label}
      onPointerDown={(event) => { start.current = event.clientX - offset; moved.current = false; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => { if (start.current === null) return; const next = Math.max(0, Math.min(max(), event.clientX - start.current)); if (next > 4) moved.current = true; setOffset(next); }}
      onPointerUp={release}
      onPointerCancel={() => { start.current = null; setOffset(0); }}
      onClick={() => { if (!moved.current && !disabled) onConfirm(); }}
    ><ArrowRight size={20} strokeWidth={1.75} /></button>
  </div>;
}
