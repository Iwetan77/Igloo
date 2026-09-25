import copy from "../../../../content/copy.json";
import { ApiError } from "@/lib/api";

type CopyKey = keyof typeof copy;

export function uiCopy(key: CopyKey): string {
  return copy[key];
}

export function optionalCopy(key: string, fallback: string): string {
  return (copy as Record<string, string>)[key] || fallback;
}

const missingCopy: Record<string, string> = {
  AMOUNT_TOO_SMALL: "This amount is below the market minimum.",
  MARKET_NOT_IN_PRIMARY: "This market is not open for buying right now.",
  MARKET_NOT_FOUND: "This market is unavailable.",
  QUOTED_POST_NOT_FOUND: "The original post is no longer available.",
  QUOTE_MARKET_MISMATCH: "This quote must use the original post's market.",
  RATE_LIMITED: "Too many requests. Please wait a moment and try again.",
  PANTA_UPSTREAM: "The market service is temporarily unavailable.",
  USER_NOT_SYNCED: "Your account is still connecting. Please try again.",
  USERNAME_TAKEN: "That username is taken. Try another.",
  INVALID_USERNAME: "Use 3-20 lowercase letters, numbers, underscores, or periods.",
  INVALID_BIO: "Bio must be 160 characters or fewer.",
};

export function errorCopy(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "QUOTE_EXPIRED" || error.code === "QUOTE_STALE") return uiCopy("buy.error.expired");
    if (error.code in missingCopy) return missingCopy[error.code];
    if (error.code.startsWith("PANTA_")) return missingCopy.PANTA_UPSTREAM;
  }
  return uiCopy("error.generic");
}
