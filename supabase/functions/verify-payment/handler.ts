// Dependency-injected handler for verify-payment Edge Function
// Performs read lookup and safe server-verified Stripe fallback recovery when a
// returning customer's checkout session has not yet been fulfilled by the webhook.

import type { SupabaseClient } from "npm:@supabase/supabase-js@^2";
import { createHandlers, type StripeSessionVerifier } from "../stripe-webhook/handlers.ts";

const SESSION_STRIPE_COOLDOWN_MS = 5_000;
const sessionLastStripeCheck = new Map<string, number>();

export function resetVerifyPaymentCooldowns(): void {
  sessionLastStripeCheck.clear();
}

function canCheckStripeForSession(sessionId: string, nowMs = Date.now()): boolean {
  const last = sessionLastStripeCheck.get(sessionId);
  if (last !== undefined && nowMs - last < SESSION_STRIPE_COOLDOWN_MS) {
    return false;
  }
  sessionLastStripeCheck.set(sessionId, nowMs);
  if (sessionLastStripeCheck.size > 2000) {
    for (const [k, ts] of sessionLastStripeCheck.entries()) {
      if (nowMs - ts >= SESSION_STRIPE_COOLDOWN_MS) {
        sessionLastStripeCheck.delete(k);
      }
    }
  }
  return true;
}

export function createVerifyPaymentHandler(params: {
  supabaseAdmin: SupabaseClient;
  stripe?: StripeSessionVerifier | null;
}) {
  const { supabaseAdmin, stripe } = params;
  const { reconcilePaymentSession } = createHandlers({ supabaseAdmin, stripe });

  async function verifyPaymentSession(
    sessionId: string | null | undefined,
    options?: { bypassCooldown?: boolean }
  ): Promise<{
    httpStatus: number;
    body: Record<string, unknown>;
  }> {
    if (!sessionId) {
      return {
        httpStatus: 400,
        body: { error: "session_id parameter is required" },
      };
    }

    if (sessionId.length > 256 || !/^cs_[a-zA-Z0-9_]+$/.test(sessionId)) {
      return {
        httpStatus: 400,
        body: { error: "Invalid session_id format" },
      };
    }

    // 1. Look up payment in PostgreSQL first (prevents arbitrary Stripe session probing)
    const { data: payment, error } = await supabaseAdmin
      .from("payments")
      .select(`
        id,
        status,
        vote_quantity,
        vote_price,
        candidate_type,
        subtotal_amount,
        service_fee_amount,
        tax_amount,
        amount,
        currency,
        candidate_id,
        reconciliation_status,
        manual_review_required,
        candidates (
          name,
          display_name,
          category,
          position,
          candidate_type
        )
      `)
      .eq("stripe_session_id", sessionId)
      .single();

    if (error || !payment) {
      return {
        httpStatus: 404,
        body: { error: "Payment not found" },
      };
    }

    // 2. Check whether votes have already been credited for this payment
    const { data: existingVote } = await supabaseAdmin
      .from("votes")
      .select("id, quantity")
      .eq("payment_id", payment.id)
      .maybeSingle();

    let effectiveStatus = payment.status as string;
    let votesCredited = Boolean(existingVote);
    let recoveredViaFallback = false;

    const recStatus = (payment as { reconciliation_status?: string | null }).reconciliation_status ?? "none";
    const manualReview = Boolean((payment as { manual_review_required?: boolean | null }).manual_review_required);

    // 3. Safe server-side fallback recovery if webhook has not yet fulfilled the payment
    const needsFallbackCheck =
      !manualReview &&
      recStatus !== "skipped_unpaid" &&
      recStatus !== "exhausted" &&
      recStatus !== "manual_review" &&
      (effectiveStatus === "pending" ||
        (effectiveStatus === "paid" && !votesCredited) ||
        (effectiveStatus === "failed" && !votesCredited));

    if (
      needsFallbackCheck &&
      stripe &&
      (options?.bypassCooldown || canCheckStripeForSession(sessionId))
    ) {
      try {
        const recResult = await reconcilePaymentSession(sessionId, {
          source: "verify_payment_fallback",
        });

        if (recResult.recovered) {
          effectiveStatus = "paid";
          votesCredited = true;
          recoveredViaFallback = true;
        } else if (recResult.session_status === "expired" && effectiveStatus === "pending") {
          effectiveStatus = "failed";
        }
      } catch (fallbackErr) {
        // Never fail the customer-facing verify endpoint if Stripe or recovery fails transiently;
        // log safely and return pending so background reconciliation continues.
        console.warn(
          "verify-payment fallback check notice for session",
          sessionId,
          ":",
          (fallbackErr as Error).message
        );
      }
    }

    // If payment is marked 'paid' locally but votes are still not credited, surface 'pending'
    // to the customer UI until fulfillment is complete.
    const customerFacingStatus =
      effectiveStatus === "paid" && !votesCredited ? "pending" : effectiveStatus;

    const candidate = (payment as {
      candidates?: {
        name: string;
        display_name?: string | null;
        category: string;
        position: string;
        candidate_type?: string | null;
      } | null;
    }).candidates;

    const candType =
      (payment as { candidate_type?: string | null }).candidate_type ??
      candidate?.candidate_type ??
      "individual";
    const unitPriceCents =
      (payment as { vote_price?: number | null }).vote_price ??
      (candType === "couple" ? 200 : 100);
    const subtotalAmount =
      (payment as { subtotal_amount?: number | null }).subtotal_amount ??
      payment.vote_quantity * unitPriceCents;
    const serviceFeeAmount =
      (payment as { service_fee_amount?: number | null }).service_fee_amount ??
      Math.max(0, payment.amount - subtotalAmount);
    const taxAmount =
      (payment as { tax_amount?: number | null }).tax_amount ?? 0;

    return {
      httpStatus: 200,
      body: {
        status: customerFacingStatus,
        votes_credited: votesCredited,
        recovered: recoveredViaFallback,
        vote_quantity: payment.vote_quantity,
        vote_price: unitPriceCents,
        subtotal_amount: subtotalAmount,
        service_fee_amount: serviceFeeAmount,
        tax_amount: taxAmount,
        amount: payment.amount,
        currency: payment.currency,
        candidate_name: candidate?.display_name || candidate?.name || "Unknown",
        candidate_category: candidate?.category ?? "",
      },
    };
  }

  return { verifyPaymentSession };
}

