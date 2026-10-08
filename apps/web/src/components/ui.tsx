import type { ReactNode } from "react";
import { percent, usd } from "@/lib/format";

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

/** A dollar figure with the cents set small, like a statement balance. */
export function Money({ value, className = "", unit }: { value: number | null; className?: string; unit?: string }) {
  if (value === null || !Number.isFinite(value)) return <span className={"display " + className}>{"—"}</span>;
  const [whole, fraction] = usd(value).split(".");
  return <span className={"display " + className}>${whole}<sup>.{fraction}</sup>{unit && <small className="money-unit">{unit}</small>}</span>;
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><span className="empty-icon">{icon}</span><strong>{title}</strong>{children && <p>{children}</p>}{action}</div>;
}

export function SideTag({ side }: { side: "YES" | "NO" }) {
  return <span className={"tag " + (side === "YES" ? "tag-yes" : "tag-no")}>{side}</span>;
}
