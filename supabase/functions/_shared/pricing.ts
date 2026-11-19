/**
 * Pure, dependency-free integer-cent pricing module.
 *
 * IMPORTANT:
 * `src/lib/pricing.ts` and `supabase/functions/_shared/pricing.ts` MUST stay
 * byte-identical. `scripts/test-tiered-pricing.mjs` asserts this.
 *
 * All money values are integer cents (`200` = `$2.00`).
 * Never use floating-point dollars for totals or fee calculations.
 */

export const ACTIVE_PRICING_VERSION = "flat_2usd_15pct_v1";

export const MIN_VOTES_PER_TRANSACTION = 1;
export const MAX_VOTES_PER_TRANSACTION = 1000;

export const UNIT_PRICE_CENTS = 200;
export const SERVICE_FEE_PERCENT = 15;

export interface VotePriceBreakdownCents {
  unitPriceCents: 200;
  voteQuantity: number;
  subtotalCents: number;
  serviceFeePercent: 15;
  serviceFeeCents: number;
  taxCents: 0;
  totalAmountCents: number;
}

export function getUnitPriceCents(_candidateType?: string | null): 200 {
  return UNIT_PRICE_CENTS;
}

/** Strict server-side quantity validation. */
export function isValidVoteQuantity(q: unknown): q is number {
  return (
    typeof q === "number" &&
    Number.isInteger(q) &&
    q >= MIN_VOTES_PER_TRANSACTION &&
    q <= MAX_VOTES_PER_TRANSACTION
  );
}

/**
 * Canonical integer-cent pricing calculation.
 * Individual and couple candidates both cost $2.00 (200 cents) per vote,
 * with a flat 15% service fee on the voting subtotal and $0.00 tax.
 */
export function calculateVotePrice(voteQuantity: number): VotePriceBreakdownCents {
  if (!isValidVoteQuantity(voteQuantity)) {
    throw new RangeError(`Invalid vote quantity: ${String(voteQuantity)}`);
  }

  const subtotalCents = voteQuantity * UNIT_PRICE_CENTS;
  const serviceFeeCents = Math.round((subtotalCents * SERVICE_FEE_PERCENT) / 100);
  const taxCents = 0 as const;
  const totalAmountCents = subtotalCents + serviceFeeCents + taxCents;

  return {
    unitPriceCents: UNIT_PRICE_CENTS,
    voteQuantity,
    subtotalCents,
    serviceFeePercent: SERVICE_FEE_PERCENT,
    serviceFeeCents,
    taxCents,
    totalAmountCents,
  };
}

/**
 * Wrapper accepting candidateType for call-site ergonomics; pricing is identical
 * for individual and couple candidates.
 */
export function calculateVotePricingCents(
  _candidateType: string | null | undefined,
  voteQuantity: number
): VotePriceBreakdownCents {
  return calculateVotePrice(voteQuantity);
}
