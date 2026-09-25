// An illustrative $1/share scenario, not Panta's projected settlement payout.
export function dollarPerShareIllustration(estimatedShares: number): number | null {
  return Number.isFinite(estimatedShares) && estimatedShares >= 0 ? estimatedShares : null;
}
