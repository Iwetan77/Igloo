import copy from "../../../../content/copy.json";
import { ApiError } from "@/lib/api";

type CopyKey = keyof typeof copy;

export function uiCopy(key: CopyKey): string {
  return copy[key];
}

const missingCopy: Record<string, string> = {
  AMOUNT_TOO_SMALL: "This amount is below the market minimum.",
  MARKET_NOT_IN_PRIMARY: "This market is not open for buying right now.",
  MARKET_NOT_FOUND: "This market is unavailable.",
  RATE_LIMITED: "Too many requests. Please wait a moment and try again.",
  PANTA_UPSTREAM: "The market service is temporarily unavailable.",
  USER_NOT_SYNCED: "Your account is still connecting. Please try again.",
};

export function errorCopy(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "QUOTE_EXPIRED" || error.code === "QUOTE_STALE") return uiCopy("buy.error.expired");
    if (error.code in missingCopy) return missingCopy[error.code];
    if (error.code.startsWith("PANTA_")) return missingCopy.PANTA_UPSTREAM;
  }
  return uiCopy("error.generic");
}
