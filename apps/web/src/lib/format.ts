export function shortId(value: string): string {
  return value.length > 18 ? value.slice(0, 6) + "…" + value.slice(-4) : value;
}

/** Price per share in cents, e.g. 0.674 -> "67.4¢". */
export function cents(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : (value * 100).toFixed(1).replace(/\.0$/, "") + "¢";
}

/** YES chance as a whole percent, or null when unknown. */
export function percent(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.max(0, Math.min(100, Math.round(value * 100)));
}

export function usd(value: number, digits = 2): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function compactUsd(value: number): string {
  if (value >= 1_000_000) return "$" + (value / 1_000_000).toFixed(1).replace(/\.0$/, "") + "m";
  if (value >= 10_000) return "$" + Math.round(value / 1000) + "k";
  if (value >= 1_000) return "$" + (value / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return "$" + value.toFixed(2);
}

export function shares(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function shortDate(value?: string | null): string {
  if (!value) return "TBD";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "TBD" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Panta phases read as plain words. */
export function phaseLabel(phase?: string | null): string {
  const value = (phase || "").toLowerCase();
  if (!value || value === "primary") return "Primary sale";
  if (value === "secondary") return "Trading";
  return value.charAt(0).toUpperCase() + value.slice(1);
}
