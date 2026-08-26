/** Formats a Rappen integer as a Swiss-style CHF string, e.g. 15000 -> "CHF 150.–". */
export function formatRappenAsChf(rappen: number): string {
  const francs = rappen / 100;
  const formatted = francs.toLocaleString("de-CH", {
    minimumFractionDigits: francs % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `CHF ${formatted}.–`;
}

export interface SavingsResult {
  equivalentValueRappen: number;
  savingsRappen: number;
}

/**
 * "Sell the pricing, don't just state it" - the equivalent single-ticket value and
 * saving, calculated from the actual number of home games, never maintained as text.
 * Returns null when there's nothing to compare yet (no games scheduled, or this
 * product has no single-ticket reference price) rather than showing a nonsensical
 * negative saving.
 */
export function calculateSavings(
  passPriceRappen: number,
  singleTicketPriceRappen: number | undefined,
  gameCount: number
): SavingsResult | null {
  if (!singleTicketPriceRappen || gameCount <= 0) return null;

  const equivalentValueRappen = singleTicketPriceRappen * gameCount;
  const savingsRappen = equivalentValueRappen - passPriceRappen;

  if (savingsRappen <= 0) return null;

  return { equivalentValueRappen, savingsRappen };
}
