"use client";

import { useRef } from "react";
import type { ReactNode } from "react";
import { percent, usd } from "@/lib/format";
import { setText, useTween } from "@/components/count-up";

/** Probability as a row of thin bars: YES ticks, then NO ticks. */
export function TickMeter({ yes, size, legend = false }: { yes: number | null; size?: "sm"; legend?: boolean }) {
  const chance = percent(yes);
  return <div>
    <div className={"ticks" + (size ? " " + size : "") + (chance === null ? " unknown" : "")} role="img" aria-label={chance === null ? "Probability unavailable" : `YES ${chance} percent, NO ${100 - chance} percent`}>
      <span className="ticks-yes" style={{ width: (chance ?? 0) + "%" }} /><span className="ticks-no" />
    </div>
    {legend && chance !== null && <div className="ticks-legend label"><span className="yes">Yes {chance}%</span><span className="no">No {100 - chance}%</span></div>}
  </div>;
}

/** A dollar figure with the cents set small. `count` makes it count up on arrival, for headline totals. */
export function Money({ value, className = "", unit, count = false }: { value: number | null; className?: string; unit?: string; count?: boolean }) {
  const known = value !== null && Number.isFinite(value);
  const dollars = useRef<HTMLSpanElement>(null);
  const cents = useRef<HTMLElement>(null);
  useTween(known && count ? value : null, (n) => {
    const [whole, fraction] = usd(n).split(".");
    setText(dollars.current, "$" + whole);
    setText(cents.current, "." + fraction);
  });
  if (!known) return <span className={"display " + className}>{"\u2014"}</span>;
  const [whole, fraction] = usd(value).split(".");
  return <span className={"display " + className}><span ref={dollars}>{"$" + whole}</span><sup ref={cents}>{"." + fraction}</sup>{unit && <small className="money-unit">{unit}</small>}</span>;
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><span className="empty-icon">{icon}</span><strong>{title}</strong>{children && <p>{children}</p>}{action}</div>;
}

export function SideTag({ side }: { side: "YES" | "NO" }) {
  return <span className={"tag " + (side === "YES" ? "tag-yes" : "tag-no")}>{side}</span>;
}
