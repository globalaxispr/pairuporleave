// ============================================================================
// Authoritative vote pricing (integer cents ONLY). Pure module: no Deno / npm
// imports so it can be unit-tested under Node and mirrored byte-for-byte in
// src/lib/pricing.ts (parity enforced by scripts/test-tiered-pricing.mjs).
//
// Tiered service fee (pricing_version "tiered_v2"):
//   1-19 votes  -> 80 cents service fee PER VOTE
//   20+ votes   -> 50 cents service fee PER VOTE, applied to ALL votes in the
//                  checkout (threshold = quantity in THIS checkout only).
// NOTE: the total for 20 votes is intentionally lower than for 19 votes
//       (explicitly approved by the owner). Do NOT "fix" this.
// The service fee NEVER changes the number of votes credited.
// ============================================================================

export const TIERED_PRICING_VERSION = "tiered_v2";
export const LEGACY_PRICING_VERSION = "legacy_base_v0";

export const MIN_VOTES_PER_TRANSACTION = 1;
export const MAX_VOTES_PER_TRANSACTION = 1000;

export const INDIVIDUAL_VOTE_PRICE_CENTS = 100;
export const COUPLE_VOTE_PRICE_CENTS = 200;

export const SERVICE_FEE_STANDARD_CENTS_PER_VOTE = 80;
export const SERVICE_FEE_DISCOUNT_CENTS_PER_VOTE = 50;
export const SERVICE_FEE_DISCOUNT_THRESHOLD_VOTES = 20;

export interface VotePriceBreakdownCents {
  unitPriceCents: 100 | 200;
  voteQuantity: number;
  subtotalCents: number;
  /** Service fee per vote in cents (0 when fees are disabled). */
  serviceFeePerVoteCents: number;
  serviceFeeCents: number;
  taxCents: number;
  totalAmountCents: number;
  /** True when the 20+ vote discounted fee tier applies. */
  discountTierApplied: boolean;
}

export function getUnitPriceCents(candidateType: string | null | undefined): 100 | 200 {
  return candidateType === "couple" ? COUPLE_VOTE_PRICE_CENTS : INDIVIDUAL_VOTE_PRICE_CENTS;
}

export function getServiceFeePerVoteCents(voteQuantity: number): number {
  return voteQuantity >= SERVICE_FEE_DISCOUNT_THRESHOLD_VOTES
    ? SERVICE_FEE_DISCOUNT_CENTS_PER_VOTE
    : SERVICE_FEE_STANDARD_CENTS_PER_VOTE;
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
 * Calculate price. Throws on invalid quantity (server must validate first;
 * the client UI clamps before calling).
 */
export function calculateVotePricingCents(
  candidateType: string | null | undefined,
  voteQuantity: number,
  applyServiceFee: boolean,
  taxCents = 0
): VotePriceBreakdownCents {
  if (!isValidVoteQuantity(voteQuantity)) {
    throw new RangeError(`Invalid vote quantity: ${String(voteQuantity)}`);
  }
  const unitPriceCents = getUnitPriceCents(candidateType);
  const subtotalCents = voteQuantity * unitPriceCents;
  const serviceFeePerVoteCents = applyServiceFee ? getServiceFeePerVoteCents(voteQuantity) : 0;
  const serviceFeeCents = voteQuantity * serviceFeePerVoteCents;
  return {
    unitPriceCents,
    voteQuantity,
    subtotalCents,
    serviceFeePerVoteCents,
    serviceFeeCents,
    taxCents,
    totalAmountCents: subtotalCents + serviceFeeCents + taxCents,
    discountTierApplied:
      applyServiceFee && voteQuantity >= SERVICE_FEE_DISCOUNT_THRESHOLD_VOTES,
  };
}
