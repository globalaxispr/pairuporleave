// Stripe Webhook Handlers – dependency injected version
// This file contains the core business‑logic for handling Stripe checkout events
// and safely reconciling paid-but-uncredited payments using trusted server-side Stripe data.
// It does **not** start a Deno.serve server and can be imported safely in unit tests.

import Stripe from "npm:stripe@^17";
import type { SupabaseClient } from "npm:@supabase/supabase-js@^2"; // type only

// ---------------------------------------------------------------------------
// Constants – same values as in the original index.ts
// ---------------------------------------------------------------------------
const MAX_VOTES_PER_TRANSACTION = 1000;
const MIN_VOTES_PER_TRANSACTION = 1;

export interface StripeSessionVerifier {
  checkout: {
    sessions: {
      retrieve(
        id: string,
        params?: { expand?: string[] }
      ): Promise<Stripe.Checkout.Session>;
    };
  };
}

function extractPaymentIntentId(
  rawPaymentIntent: Stripe.Checkout.Session["payment_intent"]
): string {
  if (typeof rawPaymentIntent === "string") {
    return rawPaymentIntent.trim();
  }
  if (
    rawPaymentIntent &&
    typeof (rawPaymentIntent as { id?: unknown }).id === "string"
  ) {
    return (rawPaymentIntent as { id: string }).id.trim();
  }
  return "";
}

// ---------------------------------------------------------------------------
// Factory that receives the runtime dependencies and returns the handlers.
// ---------------------------------------------------------------------------
export function createHandlers(params: {
  supabaseAdmin: SupabaseClient | null; // runtime Supabase admin client (or mock)
  stripe?: StripeSessionVerifier | null; // server-side Stripe client for reconciliation verification
}) {
  const { supabaseAdmin, stripe } = params;

  async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    if (!supabaseAdmin) return;

    const stripeSessionId = session.id;
    if (!stripeSessionId || !/^cs_[A-Za-z0-9_]+$/.test(stripeSessionId)) {
      throw new Error(`Invalid Stripe Checkout Session ID: '${String(stripeSessionId)}'`);
    }

    // 1. VERIFY PAYMENT STATUS ON INCOMING EVENT
    if (session.payment_status !== "paid") {
      console.log(
        `Session ${stripeSessionId} received with payment_status '${session.payment_status}' — awaiting confirmation.`
      );
      return;
    }

    // 2. FETCH TRUSTED PAYMENT RECORD FROM DATABASE
    const { data: existingPayment, error: fetchErr } = await supabaseAdmin
      .from("payments")
      .select(
        "id, stripe_session_id, status, amount, subtotal_amount, service_fee_amount, tax_amount, currency, candidate_id, vote_quantity, candidate_type, vote_price, created_at, stripe_payment_intent_id"
      )
      .eq("stripe_session_id", stripeSessionId)
      .maybeSingle();

    if (fetchErr) {
      console.error("Database error fetching payment record:", fetchErr.message);
      throw new Error(`Database error fetching payment: ${fetchErr.message}`);
    }

    if (!existingPayment) {
      console.warn("Payment record not found yet for Stripe session:", stripeSessionId);
      throw new Error(`Payment record not found for session ${stripeSessionId}. Retrying.`);
    }

    if (
      !existingPayment.stripe_session_id ||
      existingPayment.stripe_session_id !== stripeSessionId
    ) {
      console.error(
        `MANUAL REVIEW REQUIRED — CRITICAL: Stripe session ID mismatch. Event reported '${stripeSessionId}', DB recorded '${existingPayment.stripe_session_id}'.`
      );
      throw new Error(
        `Payment integrity mismatch: Stripe session '${stripeSessionId}' does not match recorded session '${existingPayment.stripe_session_id}'.`
      );
    }

    if (
      session.metadata?.payment_id &&
      session.metadata.payment_id !== existingPayment.id
    ) {
      console.error(
        `MANUAL REVIEW REQUIRED — CRITICAL: Metadata payment_id '${session.metadata.payment_id}' does not match DB payment '${existingPayment.id}' for session '${stripeSessionId}'.`
      );
      throw new Error(
        `Payment integrity mismatch: session metadata payment_id '${session.metadata.payment_id}' does not match recorded payment '${existingPayment.id}'.`
      );
    }

    // 2.5. EXTRACT & VALIDATE STRIPE PAYMENT INTENT ID
    let paymentIntentId = extractPaymentIntentId(session.payment_intent);

    if (!paymentIntentId || !/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId)) {
      console.error(
        `CRITICAL: Missing or invalid PaymentIntent ID on paid session ${stripeSessionId}: '${String(session.payment_intent)}'`
      );
      throw new Error(`Missing or invalid Stripe PaymentIntent for paid session ${stripeSessionId}.`);
    }

    const recordedPaymentIntentId =
      typeof existingPayment.stripe_payment_intent_id === "string"
        ? existingPayment.stripe_payment_intent_id.trim()
        : null;

    if (recordedPaymentIntentId && recordedPaymentIntentId !== paymentIntentId) {
      console.error(
        `MANUAL REVIEW REQUIRED — CRITICAL: PaymentIntent mismatch for session ${stripeSessionId}. ` +
          `Stripe event reported '${paymentIntentId}', DB recorded '${recordedPaymentIntentId}'.`
      );
      throw new Error(
        `Payment integrity mismatch: Stripe PaymentIntent '${paymentIntentId}' does not match recorded PaymentIntent '${recordedPaymentIntentId}'.`
      );
    }

    // 3. INSPECT CREDIT STATE & DETERMINE NORMAL VS. RECOVERY PATH
    let isRecovery = false;
    let effectiveSession: Stripe.Checkout.Session = session;

    if (existingPayment.status === "paid") {
      const { data: existingVote, error: voteErr } = await supabaseAdmin
        .from("votes")
        .select("id, candidate_id, quantity")
        .eq("payment_id", existingPayment.id)
        .maybeSingle();

      if (voteErr) {
        throw new Error(`Database error checking existing vote for payment ${existingPayment.id}: ${voteErr.message}`);
      }

      if (existingVote) {
        if (
          existingVote.candidate_id !== existingPayment.candidate_id ||
          existingVote.quantity !== existingPayment.vote_quantity
        ) {
          console.error(
            `MANUAL REVIEW REQUIRED — CRITICAL: Existing vote record for paid payment ${existingPayment.id} mismatches candidate or quantity.`
          );
          throw new Error(
            `Reconciliation conflict requiring manual review: existing vote record for payment ${existingPayment.id} does not match payment candidate or quantity.`
          );
        }
        console.log("Payment already marked as paid and credited for session:", stripeSessionId);
        return; // Already processed and credited — idempotent exit
      }

      console.warn(
        `RECONCILIATION NEEDED: Payment ${existingPayment.id} (session ${stripeSessionId}) has status 'paid' but no vote record. Initiating server-side Stripe verification.`
      );
      isRecovery = true;
    } else if (existingPayment.status === "failed") {
      const { data: existingVote, error: voteErr } = await supabaseAdmin
        .from("votes")
        .select("id, candidate_id, quantity")
        .eq("payment_id", existingPayment.id)
        .maybeSingle();

      if (voteErr) {
        throw new Error(`Database error checking existing vote for failed payment ${existingPayment.id}: ${voteErr.message}`);
      }

      if (existingVote) {
        console.error(
          `MANUAL REVIEW REQUIRED — CRITICAL: Payment ${existingPayment.id} is marked 'failed' but already has a vote record (${existingVote.id}).`
        );
        throw new Error(
          `Reconciliation conflict requiring manual review: payment ${existingPayment.id} has local status 'failed' but already has an existing vote record.`
        );
      }

      console.warn(
        `RECONCILIATION NEEDED: Payment ${existingPayment.id} (session ${stripeSessionId}) has local status 'failed' on a paid Stripe event. Initiating server-side Stripe verification.`
      );
      isRecovery = true;
    } else if (existingPayment.status !== "pending") {
      console.error(
        `MANUAL REVIEW REQUIRED — Payment ${existingPayment.id} in non-recoverable status '${existingPayment.status}' for session: ${stripeSessionId}.`
      );
      throw new Error(
        `Reconciliation conflict requiring manual review: payment ${existingPayment.id} is in status '${existingPayment.status}'.`
      );
    }

    // 3.5. MANDATORY SERVER-SIDE STRIPE VERIFICATION FOR RECOVERY OF FAILED / UNCREDITED PAYMENTS
    //      Never blindly convert a failed payment into paid without querying trusted Stripe server state.
    if (isRecovery) {
      if (!stripe) {
        console.error(
          `MANUAL REVIEW REQUIRED — Cannot reconcile payment ${existingPayment.id} (status '${existingPayment.status}') without server-side Stripe client.`
        );
        throw new Error(
          `Reconciliation requires server-side Stripe verification for payment ${existingPayment.id} in status '${existingPayment.status}'.`
        );
      }

      const verifiedSession = await stripe.checkout.sessions.retrieve(stripeSessionId, {
        expand: ["payment_intent"],
      });

      if (!verifiedSession || verifiedSession.id !== stripeSessionId || verifiedSession.id !== existingPayment.stripe_session_id) {
        console.error(
          `MANUAL REVIEW REQUIRED — Server-side Stripe session ID mismatch during reconciliation of payment ${existingPayment.id}.`
        );
        throw new Error(
          `Reconciliation conflict requiring manual review: server-side Stripe session ID mismatch for payment ${existingPayment.id}.`
        );
      }

      if (verifiedSession.payment_status !== "paid") {
        console.error(
          `RECONCILIATION REJECTED — Server-side Stripe check shows session ${stripeSessionId} has payment_status '${verifiedSession.payment_status}', not 'paid'. Leaving status '${existingPayment.status}'.`
        );
        throw new Error(
          `Reconciliation rejected: server-side Stripe session ${stripeSessionId} has payment_status '${verifiedSession.payment_status}', expected 'paid'.`
        );
      }

      const verifiedPiId = extractPaymentIntentId(verifiedSession.payment_intent);
      if (!verifiedPiId || !/^pi_[A-Za-z0-9_]+$/.test(verifiedPiId) || verifiedPiId !== paymentIntentId) {
        console.error(
          `MANUAL REVIEW REQUIRED — Server-side Stripe PaymentIntent '${verifiedPiId}' does not match event PaymentIntent '${paymentIntentId}' for session ${stripeSessionId}.`
        );
        throw new Error(
          `Reconciliation conflict requiring manual review: server-side PaymentIntent '${verifiedPiId}' does not match '${paymentIntentId}'.`
        );
      }

      if (recordedPaymentIntentId && verifiedPiId !== recordedPaymentIntentId) {
        console.error(
          `MANUAL REVIEW REQUIRED — Server-side Stripe PaymentIntent '${verifiedPiId}' conflicts with DB recorded PaymentIntent '${recordedPaymentIntentId}'.`
        );
        throw new Error(
          `Payment integrity mismatch: server-side Stripe PaymentIntent '${verifiedPiId}' does not match recorded PaymentIntent '${recordedPaymentIntentId}'.`
        );
      }

      if (
        verifiedSession.payment_intent &&
        typeof verifiedSession.payment_intent === "object"
      ) {
        const piObj = verifiedSession.payment_intent as Stripe.PaymentIntent;
        if (piObj.status && piObj.status !== "succeeded") {
          console.error(
            `RECONCILIATION REJECTED — Server-side PaymentIntent ${verifiedPiId} has status '${piObj.status}', expected 'succeeded'.`
          );
          throw new Error(
            `Reconciliation rejected: server-side PaymentIntent ${verifiedPiId} has status '${piObj.status}', expected 'succeeded'.`
          );
        }
        if (
          typeof piObj.amount_received === "number" &&
          piObj.amount_received !== existingPayment.amount
        ) {
          console.error(
            `MANUAL REVIEW REQUIRED — Server-side PaymentIntent amount_received (${piObj.amount_received}) does not match DB amount (${existingPayment.amount}).`
          );
          throw new Error(
            `Reconciliation conflict requiring manual review: PaymentIntent amount_received ${piObj.amount_received} does not match DB amount ${existingPayment.amount}.`
          );
        }
        if (
          typeof piObj.currency === "string" &&
          piObj.currency.toLowerCase() !== (existingPayment.currency ?? "usd").toLowerCase()
        ) {
          console.error(
            `MANUAL REVIEW REQUIRED — Server-side PaymentIntent currency ('${piObj.currency}') does not match DB currency ('${existingPayment.currency}').`
          );
          throw new Error(
            `Reconciliation conflict requiring manual review: PaymentIntent currency '${piObj.currency}' does not match DB currency '${existingPayment.currency}'.`
          );
        }
      }

      if (
        verifiedSession.metadata?.payment_id &&
        verifiedSession.metadata.payment_id !== existingPayment.id
      ) {
        throw new Error(
          `Reconciliation conflict requiring manual review: server-side metadata payment_id '${verifiedSession.metadata.payment_id}' does not match DB payment '${existingPayment.id}'.`
        );
      }

      effectiveSession = verifiedSession;
      paymentIntentId = verifiedPiId;
    }

    // 4. CURRENCY & AMOUNT VALIDATION
    const stripeCurrency = (effectiveSession.currency ?? "").toLowerCase();
    const expectedCurrency = (existingPayment.currency ?? "usd").toLowerCase();
    if (stripeCurrency !== expectedCurrency) {
      console.error(
        `CRITICAL: Currency mismatch for session ${stripeSessionId}. Stripe reported '${stripeCurrency}', DB expected '${expectedCurrency}'.`
      );
      if (isRecovery) {
        throw new Error(
          `Reconciliation conflict requiring manual review: currency mismatch ('${stripeCurrency}' vs '${expectedCurrency}') for payment ${existingPayment.id}.`
        );
      }
      await supabaseAdmin
        .from("payments")
        .update({ status: "failed" })
        .eq("id", existingPayment.id);
      return;
    }

    const stripeAmountTotal = effectiveSession.amount_total ?? 0;
    const dbStoredAmount = existingPayment.amount;
    if (stripeAmountTotal !== dbStoredAmount) {
      console.error(
        `CRITICAL: Amount mismatch for session ${stripeSessionId}. ` +
          `Stripe reported ${stripeAmountTotal} cents; DB stored ${dbStoredAmount} cents. Refusing vote creation.`
      );
      if (isRecovery) {
        throw new Error(
          `Reconciliation conflict requiring manual review: amount mismatch (Stripe ${stripeAmountTotal} vs DB ${dbStoredAmount}) for payment ${existingPayment.id}.`
        );
      }
      await supabaseAdmin
        .from("payments")
        .update({ status: "failed" })
        .eq("id", existingPayment.id);
      return;
    }

    // 4.5. SUBTOTAL + PLATFORM SERVICE FEE + TAX ACCOUNTING INVARIANT CHECK
    const candidateTypeForPrice = existingPayment.candidate_type ?? "individual";
    const expectedVotePrice =
      existingPayment.vote_price ?? (candidateTypeForPrice === "couple" ? 200 : 100);
    const expectedSubtotal = existingPayment.vote_quantity * expectedVotePrice;
    const recordedSubtotal =
      typeof (existingPayment as { subtotal_amount?: unknown }).subtotal_amount === "number"
        ? (existingPayment as { subtotal_amount: number }).subtotal_amount
        : expectedSubtotal;
    const recordedServiceFee =
      typeof (existingPayment as { service_fee_amount?: unknown }).service_fee_amount === "number"
        ? (existingPayment as { service_fee_amount: number }).service_fee_amount
        : 0;
    const recordedTax =
      typeof (existingPayment as { tax_amount?: unknown }).tax_amount === "number"
        ? (existingPayment as { tax_amount: number }).tax_amount
        : 0;

    if (
      recordedSubtotal !== expectedSubtotal ||
      recordedServiceFee < 0 ||
      recordedTax < 0 ||
      dbStoredAmount !== recordedSubtotal + recordedServiceFee + recordedTax
    ) {
      console.error(
        `CRITICAL: Payment accounting invariant mismatch for session ${stripeSessionId}: ` +
          `amount=${dbStoredAmount}, subtotal=${recordedSubtotal} (expected ${expectedSubtotal}), ` +
          `service_fee=${recordedServiceFee}, tax=${recordedTax}. Refusing vote creation.`
      );
      if (isRecovery) {
        throw new Error(
          `Reconciliation conflict requiring manual review: payment accounting invariant mismatch for payment ${existingPayment.id}.`
        );
      }
      await supabaseAdmin
        .from("payments")
        .update({ status: "failed" })
        .eq("id", existingPayment.id);
      return;
    }

    // 5. CONFIRM CANDIDATE FROM TRUSTED DATABASE RECORDS
    const candidateId = existingPayment.candidate_id;
    if (!candidateId) {
      console.error(`Payment ${existingPayment.id} has no associated candidate_id.`);
      if (isRecovery) {
        throw new Error(
          `Reconciliation conflict requiring manual review: payment ${existingPayment.id} has no candidate_id.`
        );
      }
      await supabaseAdmin
        .from("payments")
        .update({ status: "failed" })
        .eq("id", existingPayment.id);
      return;
    }

    const { data: candidate, error: candErr } = await supabaseAdmin
      .from("candidates")
      .select("id, status, candidate_type")
      .eq("id", candidateId)
      .single();

    if (candErr || !candidate) {
      console.error(`Candidate ${candidateId} not found in database for payment ${existingPayment.id}`);
      if (isRecovery) {
        throw new Error(
          `Reconciliation conflict requiring manual review: candidate ${candidateId} not found for payment ${existingPayment.id}.`
        );
      }
      await supabaseAdmin
        .from("payments")
        .update({ status: "failed" })
        .eq("id", existingPayment.id);
      return;
    }

    // 5.5. VERIFY SESSION METADATA CONSISTENCY (WHEN PRESENT)
    if (effectiveSession.metadata?.candidate_id && effectiveSession.metadata.candidate_id !== candidateId) {
      console.error(
        `CRITICAL: Candidate mismatch for session ${stripeSessionId}. ` +
          `Stripe metadata reported '${effectiveSession.metadata.candidate_id}', DB recorded '${candidateId}'.`
      );
      throw new Error(
        `Payment integrity mismatch: session metadata candidate_id '${effectiveSession.metadata.candidate_id}' does not match DB candidate_id '${candidateId}'.`
      );
    }

    // 6. VALIDATE VOTE QUANTITY BOUNDS
    const authoritativeVoteQuantity = existingPayment.vote_quantity;
    if (
      !Number.isInteger(authoritativeVoteQuantity) ||
      authoritativeVoteQuantity < MIN_VOTES_PER_TRANSACTION ||
      authoritativeVoteQuantity > MAX_VOTES_PER_TRANSACTION
    ) {
      console.error(`Invalid vote_quantity ${authoritativeVoteQuantity} in payment record ${existingPayment.id}`);
      if (isRecovery) {
        throw new Error(
          `Reconciliation conflict requiring manual review: invalid vote_quantity ${authoritativeVoteQuantity} in payment ${existingPayment.id}.`
        );
      }
      await supabaseAdmin
        .from("payments")
        .update({ status: "failed" })
        .eq("id", existingPayment.id);
      return;
    }

    if (effectiveSession.metadata?.vote_quantity !== undefined) {
      const metadataVoteQty = Number(effectiveSession.metadata.vote_quantity);
      if (!Number.isInteger(metadataVoteQty) || metadataVoteQty !== authoritativeVoteQuantity) {
        console.error(
          `CRITICAL: Vote quantity mismatch for session ${stripeSessionId}. ` +
            `Stripe metadata reported '${effectiveSession.metadata.vote_quantity}', DB recorded '${authoritativeVoteQuantity}'.`
        );
        throw new Error(
          `Payment integrity mismatch: session metadata vote_quantity '${effectiveSession.metadata.vote_quantity}' does not match DB vote_quantity '${authoritativeVoteQuantity}'.`
        );
      }
    }

    // 7. COMPETITION DEADLINE ENFORCEMENT POLICY
    const { data: rawSchedule } = await supabaseAdmin
      .from("competition_schedule")
      .select("*")
      .eq("id", "active")
      .maybeSingle();
    const schedule = rawSchedule
      ? {
          name:
            (rawSchedule as { competition_name?: string; name?: string }).competition_name ||
            (rawSchedule as { competition_name?: string; name?: string }).name ||
            "PAIR UP OR LEAVE",
          is_enabled:
            (rawSchedule as { is_published?: boolean; is_enabled?: boolean }).is_published ??
            (rawSchedule as { is_published?: boolean; is_enabled?: boolean }).is_enabled ??
            true,
          end_time: rawSchedule.end_time,
        }
      : null;

    if (schedule && schedule.is_enabled) {
      const deadlineMs = new Date(schedule.end_time).getTime();
      const initiatedAtMs = existingPayment.created_at
        ? new Date(existingPayment.created_at).getTime()
        : (effectiveSession.created ? effectiveSession.created * 1000 : Date.now());
      if (!isNaN(deadlineMs) && initiatedAtMs > deadlineMs) {
        console.warn(
          `PAYMENT INITIATED AFTER DEADLINE: Session ${stripeSessionId} was initiated at ${initiatedAtMs} (after deadline ${deadlineMs}). Refusing vote creation.`
        );
        await supabaseAdmin
          .from("payments")
          .update({
            status: "failed",
            stripe_payment_intent_id: recordedPaymentIntentId ?? paymentIntentId,
          })
          .eq("id", existingPayment.id);
        return;
      }
    }

    // 8. MANDATORY ATOMIC PAYMENT CONFIRMATION / RECONCILIATION VIA RPC
    const paymentId = existingPayment.id;
    const candidateType = existingPayment.candidate_type ?? candidate.candidate_type ?? "individual";
    const votePrice =
      existingPayment.vote_price ?? (candidateType === "couple" ? 200 : 100);

    const { data: confirmResult, error: confirmErr } = await supabaseAdmin.rpc("confirm_stripe_payment", {
      p_payment_id: paymentId,
      p_stripe_payment_intent_id: paymentIntentId,
      p_candidate_id: candidateId,
      p_vote_quantity: authoritativeVoteQuantity,
      p_candidate_type: candidateType,
      p_vote_price: votePrice,
    });

    if (confirmErr) {
      console.error("CRITICAL: confirm_stripe_payment RPC failed or unavailable:", confirmErr.message);
      throw new Error(`Payment processing failed at database level: ${confirmErr.message}`);
    }

    if (confirmResult?.already_processed) {
      console.log(`Payment ${paymentId} was already processed and credited. Idempotent exit.`);
      return;
    }

    if (confirmResult?.recovered) {
      console.log(
        `RECONCILIATION SUCCESS: Recovered payment ${paymentId} from status '${confirmResult.previous_status}' -> 'paid' and credited ${authoritativeVoteQuantity} votes for candidate ${candidateId} — session: ${stripeSessionId}`
      );
      return;
    }

    console.log(
      `Successfully and atomically processed ${authoritativeVoteQuantity} votes for candidate ${candidateId} (${candidateType}) — session: ${stripeSessionId}`
    );
  }

  async function handleCheckoutFailed(session: Stripe.Checkout.Session, eventType: string) {
    if (!supabaseAdmin) return;

    const stripeSessionId = session.id;
    const { data: existingPayment } = await supabaseAdmin
      .from("payments")
      .select("id, status, stripe_payment_intent_id")
      .eq("stripe_session_id", stripeSessionId)
      .maybeSingle();

    if (existingPayment && existingPayment.status === "pending") {
      const incomingPi = extractPaymentIntentId(session.payment_intent) || null;
      console.log(`Marking payment ${existingPayment.id} as failed due to ${eventType}`);
      await supabaseAdmin
        .from("payments")
        .update({
          status: "failed",
          stripe_payment_intent_id: existingPayment.stripe_payment_intent_id ?? incomingPi,
        })
        .eq("id", existingPayment.id);
    }
  }

  /**
   * Safe server-side reconciliation entry point for an uncredited payment row.
   * Queries trusted server-side Stripe Checkout Session & PaymentIntent state first;
   * never converts a failed payment unless Stripe confirms payment_status === 'paid'
   * and PaymentIntent status === 'succeeded' with matching identity and amounts.
   */
  async function reconcilePaymentSession(stripeSessionId: string): Promise<{
    recovered: boolean;
    already_processed: boolean;
    status: string;
  }> {
    if (!supabaseAdmin || !stripe) {
      throw new Error("reconcilePaymentSession requires both supabaseAdmin and stripe clients.");
    }

    const verifiedSession = await stripe.checkout.sessions.retrieve(stripeSessionId, {
      expand: ["payment_intent"],
    });

    if (verifiedSession.payment_status !== "paid") {
      return {
        recovered: false,
        already_processed: false,
        status: `stripe_session_${verifiedSession.payment_status}`,
      };
    }

    await handleCheckoutCompleted(verifiedSession);
    return {
      recovered: true,
      already_processed: false,
      status: "reconciled_paid",
    };
  }

  return { handleCheckoutCompleted, handleCheckoutFailed, reconcilePaymentSession };
}

// Export the factory for external usage.
export type Handlers = ReturnType<typeof createHandlers>;
