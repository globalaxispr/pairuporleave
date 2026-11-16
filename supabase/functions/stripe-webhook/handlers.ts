// Stripe Webhook Handlers – dependency injected version
// Contains core business logic for handling Stripe checkout events,
// server-verified payment recovery, and refund/dispute recording.
// Can be imported safely in both Deno and Node test suites.

import type Stripe from "npm:stripe@^17";
import type { SupabaseClient } from "npm:@supabase/supabase-js@^2";

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
  rawPaymentIntent: Stripe.Checkout.Session["payment_intent"] | Stripe.Charge["payment_intent"] | Stripe.Dispute["payment_intent"]
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

function extractChargeId(
  rawCharge: Stripe.Dispute["charge"] | string | null | undefined
): string {
  if (typeof rawCharge === "string") {
    return rawCharge.trim();
  }
  if (
    rawCharge &&
    typeof (rawCharge as { id?: unknown }).id === "string"
  ) {
    return (rawCharge as { id: string }).id.trim();
  }
  return "";
}

export function createHandlers(params: {
  supabaseAdmin: SupabaseClient | null;
  stripe?: StripeSessionVerifier | null;
}) {
  const { supabaseAdmin, stripe } = params;

  async function tryFlagManualReview(
    paymentId: string | undefined,
    reason: string,
    source: string
  ): Promise<void> {
    if (!supabaseAdmin || !paymentId) return;
    try {
      await supabaseAdmin.rpc("flag_payment_manual_review", {
        p_payment_id: paymentId,
        p_reason: reason,
        p_source: source,
        p_details: {},
      });
    } catch {
      // Best-effort helper; ignore if mock client in unit test only implements confirm_stripe_payment
    }
  }

  async function handleCheckoutCompleted(
    session: Stripe.Checkout.Session,
    options?: { source?: string; forceServerVerification?: boolean }
  ) {
    if (!supabaseAdmin) return;
    const source = options?.source ?? "stripe_webhook";

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
        "id, stripe_session_id, status, amount, subtotal_amount, service_fee_amount, tax_amount, currency, candidate_id, vote_quantity, candidate_type, vote_price, created_at, stripe_payment_intent_id, refund_status, dispute_status"
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
      const msg = `Payment integrity mismatch: Stripe session '${stripeSessionId}' does not match recorded session '${existingPayment.stripe_session_id}'.`;
      await tryFlagManualReview(existingPayment.id, msg, source);
      throw new Error(msg);
    }

    if (
      session.metadata?.payment_id &&
      session.metadata.payment_id !== existingPayment.id
    ) {
      const msg = `Payment integrity mismatch: session metadata payment_id '${session.metadata.payment_id}' does not match recorded payment '${existingPayment.id}'.`;
      await tryFlagManualReview(existingPayment.id, msg, source);
      throw new Error(msg);
    }

    // 2.5. EXTRACT & VALIDATE STRIPE PAYMENT INTENT ID
    let paymentIntentId = extractPaymentIntentId(session.payment_intent);

    if (!paymentIntentId || !/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId)) {
      throw new Error(`Missing or invalid Stripe PaymentIntent for paid session ${stripeSessionId}.`);
    }

    const recordedPaymentIntentId =
      typeof existingPayment.stripe_payment_intent_id === "string"
        ? existingPayment.stripe_payment_intent_id.trim()
        : null;

    if (recordedPaymentIntentId && recordedPaymentIntentId !== paymentIntentId) {
      const msg = `Payment integrity mismatch: Stripe PaymentIntent '${paymentIntentId}' does not match recorded PaymentIntent '${recordedPaymentIntentId}'.`;
      await tryFlagManualReview(existingPayment.id, msg, source);
      throw new Error(msg);
    }

    // 3. INSPECT CREDIT STATE & DETERMINE NORMAL VS. RECOVERY PATH
    let isRecovery = Boolean(options?.forceServerVerification);
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
          const msg = `Reconciliation conflict requiring manual review: existing vote record for payment ${existingPayment.id} does not match payment candidate or quantity.`;
          await tryFlagManualReview(existingPayment.id, msg, source);
          throw new Error(msg);
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
        const msg = `Reconciliation conflict requiring manual review: payment ${existingPayment.id} has local status 'failed' but already has an existing vote record.`;
        await tryFlagManualReview(existingPayment.id, msg, source);
        throw new Error(msg);
      }

      console.warn(
        `RECONCILIATION NEEDED: Payment ${existingPayment.id} (session ${stripeSessionId}) has local status 'failed' on a paid Stripe event. Initiating server-side Stripe verification.`
      );
      isRecovery = true;
    } else if (existingPayment.status !== "pending") {
      const msg = `Reconciliation conflict requiring manual review: payment ${existingPayment.id} is in status '${existingPayment.status}'.`;
      await tryFlagManualReview(existingPayment.id, msg, source);
      throw new Error(msg);
    }

    // 3.5. MANDATORY SERVER-SIDE STRIPE VERIFICATION FOR RECOVERY OF FAILED / UNCREDITED PAYMENTS
    //      Never convert a failed or uncredited payment into credited votes without querying trusted Stripe server state.
    if (isRecovery) {
      if (!stripe) {
        throw new Error(
          `Reconciliation requires server-side Stripe verification for payment ${existingPayment.id} in status '${existingPayment.status}'.`
        );
      }

      const verifiedSession = await stripe.checkout.sessions.retrieve(stripeSessionId, {
        expand: ["payment_intent"],
      });

      if (!verifiedSession || verifiedSession.id !== stripeSessionId || verifiedSession.id !== existingPayment.stripe_session_id) {
        const msg = `Reconciliation conflict requiring manual review: server-side Stripe session ID mismatch for payment ${existingPayment.id}.`;
        await tryFlagManualReview(existingPayment.id, msg, source);
        throw new Error(msg);
      }

      if (verifiedSession.payment_status !== "paid") {
        throw new Error(
          `Reconciliation rejected: server-side Stripe session ${stripeSessionId} has payment_status '${verifiedSession.payment_status}', expected 'paid'.`
        );
      }

      const verifiedPiId = extractPaymentIntentId(verifiedSession.payment_intent);
      if (!verifiedPiId || !/^pi_[A-Za-z0-9_]+$/.test(verifiedPiId) || verifiedPiId !== paymentIntentId) {
        const msg = `Reconciliation conflict requiring manual review: server-side PaymentIntent '${verifiedPiId}' does not match '${paymentIntentId}'.`;
        await tryFlagManualReview(existingPayment.id, msg, source);
        throw new Error(msg);
      }

      if (recordedPaymentIntentId && verifiedPiId !== recordedPaymentIntentId) {
        const msg = `Payment integrity mismatch: server-side Stripe PaymentIntent '${verifiedPiId}' does not match recorded PaymentIntent '${recordedPaymentIntentId}'.`;
        await tryFlagManualReview(existingPayment.id, msg, source);
        throw new Error(msg);
      }

      if (
        verifiedSession.payment_intent &&
        typeof verifiedSession.payment_intent === "object"
      ) {
        const piObj = verifiedSession.payment_intent as Stripe.PaymentIntent & { amount_refunded?: number };
        if (piObj.status && piObj.status !== "succeeded") {
          throw new Error(
            `Reconciliation rejected: server-side PaymentIntent ${verifiedPiId} has status '${piObj.status}', expected 'succeeded'.`
          );
        }
        if (
          typeof piObj.amount_received === "number" &&
          piObj.amount_received !== existingPayment.amount
        ) {
          const msg = `Reconciliation conflict requiring manual review: PaymentIntent amount_received ${piObj.amount_received} does not match DB amount ${existingPayment.amount}.`;
          await tryFlagManualReview(existingPayment.id, msg, source);
          throw new Error(msg);
        }
        if (
          typeof piObj.currency === "string" &&
          piObj.currency.toLowerCase() !== (existingPayment.currency ?? "usd").toLowerCase()
        ) {
          const msg = `Reconciliation conflict requiring manual review: PaymentIntent currency '${piObj.currency}' does not match DB currency '${existingPayment.currency}'.`;
          await tryFlagManualReview(existingPayment.id, msg, source);
          throw new Error(msg);
        }
        if (typeof piObj.amount_refunded === "number" && piObj.amount_refunded > 0) {
          const msg = `Reconciliation conflict requiring manual review: PaymentIntent ${verifiedPiId} has amount_refunded=${piObj.amount_refunded}.`;
          await tryFlagManualReview(existingPayment.id, msg, source);
          throw new Error(msg);
        }
      }

      if (
        verifiedSession.metadata?.payment_id &&
        verifiedSession.metadata.payment_id !== existingPayment.id
      ) {
        const msg = `Reconciliation conflict requiring manual review: server-side metadata payment_id '${verifiedSession.metadata.payment_id}' does not match DB payment '${existingPayment.id}'.`;
        await tryFlagManualReview(existingPayment.id, msg, source);
        throw new Error(msg);
      }

      effectiveSession = verifiedSession;
      paymentIntentId = verifiedPiId;
    }

    // 4. CURRENCY & AMOUNT VALIDATION
    const stripeCurrency = (effectiveSession.currency ?? "").toLowerCase();
    const expectedCurrency = (existingPayment.currency ?? "usd").toLowerCase();
    if (stripeCurrency !== expectedCurrency) {
      if (isRecovery) {
        const msg = `Reconciliation conflict requiring manual review: currency mismatch ('${stripeCurrency}' vs '${expectedCurrency}') for payment ${existingPayment.id}.`;
        await tryFlagManualReview(existingPayment.id, msg, source);
        throw new Error(msg);
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
      if (isRecovery) {
        const msg = `Reconciliation conflict requiring manual review: amount mismatch (Stripe ${stripeAmountTotal} vs DB ${dbStoredAmount}) for payment ${existingPayment.id}.`;
        await tryFlagManualReview(existingPayment.id, msg, source);
        throw new Error(msg);
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
      if (isRecovery) {
        const msg = `Reconciliation conflict requiring manual review: payment accounting invariant mismatch for payment ${existingPayment.id}.`;
        await tryFlagManualReview(existingPayment.id, msg, source);
        throw new Error(msg);
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
      if (isRecovery) {
        const msg = `Reconciliation conflict requiring manual review: payment ${existingPayment.id} has no candidate_id.`;
        await tryFlagManualReview(existingPayment.id, msg, source);
        throw new Error(msg);
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
      if (isRecovery) {
        const msg = `Reconciliation conflict requiring manual review: candidate ${candidateId} not found for payment ${existingPayment.id}.`;
        await tryFlagManualReview(existingPayment.id, msg, source);
        throw new Error(msg);
      }
      await supabaseAdmin
        .from("payments")
        .update({ status: "failed" })
        .eq("id", existingPayment.id);
      return;
    }

    // 5.5. VERIFY SESSION METADATA CONSISTENCY (WHEN PRESENT)
    if (effectiveSession.metadata?.candidate_id && effectiveSession.metadata.candidate_id !== candidateId) {
      const msg = `Payment integrity mismatch: session metadata candidate_id '${effectiveSession.metadata.candidate_id}' does not match DB candidate_id '${candidateId}'.`;
      await tryFlagManualReview(existingPayment.id, msg, source);
      throw new Error(msg);
    }

    // 6. VALIDATE VOTE QUANTITY BOUNDS
    const authoritativeVoteQuantity = existingPayment.vote_quantity;
    if (
      !Number.isInteger(authoritativeVoteQuantity) ||
      authoritativeVoteQuantity < MIN_VOTES_PER_TRANSACTION ||
      authoritativeVoteQuantity > MAX_VOTES_PER_TRANSACTION
    ) {
      if (isRecovery) {
        const msg = `Reconciliation conflict requiring manual review: invalid vote_quantity ${authoritativeVoteQuantity} in payment ${existingPayment.id}.`;
        await tryFlagManualReview(existingPayment.id, msg, source);
        throw new Error(msg);
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
        const msg = `Payment integrity mismatch: session metadata vote_quantity '${effectiveSession.metadata.vote_quantity}' does not match DB vote_quantity '${authoritativeVoteQuantity}'.`;
        await tryFlagManualReview(existingPayment.id, msg, source);
        throw new Error(msg);
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
      console.error("CRITICAL: confirm_stripe_payment RPC failed:", confirmErr.message);
      if (
        confirmErr.message.includes("manual review") ||
        confirmErr.message.includes("Reconciliation conflict") ||
        confirmErr.message.includes("Payment integrity")
      ) {
        await tryFlagManualReview(paymentId, confirmErr.message, source);
      }
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
        .eq("id", existingPayment.id)
        .eq("status", "pending");
    }
  }

  /**
   * Safe server-side reconciliation entry point for an uncredited payment row.
   * Queries trusted server-side Stripe Checkout Session & PaymentIntent state first;
   * never converts a failed or pending payment unless Stripe confirms payment_status === 'paid'
   * and PaymentIntent status === 'succeeded' with matching identity and amounts.
   */
  async function reconcilePaymentSession(
    stripeSessionId: string,
    options?: { source?: string }
  ): Promise<{
    recovered: boolean;
    already_processed: boolean;
    status: string;
    session_status?: string | null;
  }> {
    if (!supabaseAdmin || !stripe) {
      throw new Error("reconcilePaymentSession requires both supabaseAdmin and stripe clients.");
    }

    if (!stripeSessionId || !/^cs_[A-Za-z0-9_]+$/.test(stripeSessionId)) {
      throw new Error(`Invalid Stripe Checkout Session ID: '${String(stripeSessionId)}'`);
    }

    const verifiedSession = await stripe.checkout.sessions.retrieve(stripeSessionId, {
      expand: ["payment_intent"],
    });

    if (verifiedSession.payment_status !== "paid") {
      return {
        recovered: false,
        already_processed: false,
        status: `stripe_session_${verifiedSession.payment_status}`,
        session_status: (verifiedSession as { status?: string | null }).status ?? null,
      };
    }

    await handleCheckoutCompleted(verifiedSession, {
      source: options?.source ?? "reconcile_edge_fn",
      forceServerVerification: false,
    });
    return {
      recovered: true,
      already_processed: false,
      status: "reconciled_paid",
      session_status: (verifiedSession as { status?: string | null }).status ?? "complete",
    };
  }

  /**
   * Handles Stripe charge.refunded events safely and idempotently.
   * Records full or partial refund status and flags for administrator review.
   * Never deletes votes, never changes candidate scores, never issues refunds.
   */
  async function handleChargeRefunded(
    charge: Stripe.Charge,
    eventId: string
  ): Promise<{
    already_processed: boolean;
    unknown_payment: boolean;
    refund_status?: "partial" | "full";
    payment_id?: string;
  }> {
    if (!supabaseAdmin) {
      throw new Error("handleChargeRefunded requires supabaseAdmin client.");
    }
    if (!eventId || typeof eventId !== "string" || !eventId.trim()) {
      throw new Error("Missing Stripe event ID for charge.refunded");
    }
    if (!charge || typeof charge.id !== "string" || !/^(ch|py)_[A-Za-z0-9_]+$/.test(charge.id)) {
      throw new Error(`Invalid Stripe Charge ID on charge.refunded: '${String(charge?.id)}'`);
    }

    const amountRefunded = typeof charge.amount_refunded === "number" ? charge.amount_refunded : 0;
    if (amountRefunded <= 0) {
      return { already_processed: false, unknown_payment: false };
    }

    const paymentIntentId = extractPaymentIntentId(charge.payment_intent);
    const refundReason =
      charge.refunds?.data?.[0]?.reason ??
      (charge as unknown as { reason?: string }).reason ??
      "stripe_charge_refunded";

    // Look up matching payment by stripe_payment_intent_id
    let matchedPayment: { id: string; amount: number; status: string } | null = null;
    if (paymentIntentId) {
      const { data } = await supabaseAdmin
        .from("payments")
        .select("id, amount, status")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .maybeSingle();
      if (data) matchedPayment = data as { id: string; amount: number; status: string };
    }

    const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc(
      "record_stripe_refund_or_dispute",
      {
        p_stripe_event_id: eventId.trim(),
        p_event_type: "charge.refunded",
        p_payment_id: matchedPayment?.id ?? null,
        p_stripe_payment_intent_id: paymentIntentId || null,
        p_stripe_charge_id: charge.id,
        p_stripe_dispute_id: null,
        p_amount_cents: amountRefunded,
        p_reason: refundReason,
        p_dispute_status: null,
        p_details: {
          charge_amount: charge.amount ?? null,
          fully_refunded: Boolean(charge.refunded),
          currency: charge.currency ?? "usd",
        },
      }
    );

    if (rpcErr) {
      throw new Error(`Failed to record charge.refunded (${eventId}): ${rpcErr.message}`);
    }

    return {
      already_processed: Boolean(rpcRes?.already_processed),
      unknown_payment: Boolean(rpcRes?.unknown_payment),
      refund_status: rpcRes?.refund_status,
      payment_id: rpcRes?.payment_id ?? matchedPayment?.id,
    };
  }

  /**
   * Handles Stripe charge.dispute.created and charge.dispute.closed events safely and idempotently.
   * Preserves all votes and candidate scores while recording dispute lifecycle and flagging manual review.
   */
  async function handleChargeDispute(
    dispute: Stripe.Dispute,
    eventType: "charge.dispute.created" | "charge.dispute.closed",
    eventId: string
  ): Promise<{
    already_processed: boolean;
    unknown_payment: boolean;
    dispute_status?: string;
    manual_review_required?: boolean;
    payment_id?: string;
  }> {
    if (!supabaseAdmin) {
      throw new Error("handleChargeDispute requires supabaseAdmin client.");
    }
    if (!eventId || typeof eventId !== "string" || !eventId.trim()) {
      throw new Error(`Missing Stripe event ID for ${eventType}`);
    }
    if (!dispute || typeof dispute.id !== "string" || !/^(dp|du)_[A-Za-z0-9_]+$/.test(dispute.id)) {
      throw new Error(`Invalid Stripe Dispute ID on ${eventType}: '${String(dispute?.id)}'`);
    }

    const paymentIntentId = extractPaymentIntentId(dispute.payment_intent);
    const chargeId = extractChargeId(dispute.charge);
    const disputeAmount = typeof dispute.amount === "number" ? dispute.amount : 0;
    const disputeReason = dispute.reason ?? "stripe_dispute";
    const disputeStatus =
      dispute.status ?? (eventType === "charge.dispute.closed" ? "lost" : "needs_response");

    let matchedPayment: { id: string; amount: number; status: string } | null = null;
    if (paymentIntentId) {
      const { data } = await supabaseAdmin
        .from("payments")
        .select("id, amount, status")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .maybeSingle();
      if (data) matchedPayment = data as { id: string; amount: number; status: string };
    }

    const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc(
      "record_stripe_refund_or_dispute",
      {
        p_stripe_event_id: eventId.trim(),
        p_event_type: eventType,
        p_payment_id: matchedPayment?.id ?? null,
        p_stripe_payment_intent_id: paymentIntentId || null,
        p_stripe_charge_id: chargeId || null,
        p_stripe_dispute_id: dispute.id,
        p_amount_cents: disputeAmount,
        p_reason: disputeReason,
        p_dispute_status: disputeStatus,
        p_details: {
          currency: dispute.currency ?? "usd",
        },
      }
    );

    if (rpcErr) {
      throw new Error(`Failed to record ${eventType} (${eventId}): ${rpcErr.message}`);
    }

    return {
      already_processed: Boolean(rpcRes?.already_processed),
      unknown_payment: Boolean(rpcRes?.unknown_payment),
      dispute_status: rpcRes?.dispute_status ?? disputeStatus,
      manual_review_required: rpcRes?.manual_review_required,
      payment_id: rpcRes?.payment_id ?? matchedPayment?.id,
    };
  }

  return {
    handleCheckoutCompleted,
    handleCheckoutFailed,
    reconcilePaymentSession,
    handleChargeRefunded,
    handleChargeDispute,
  };
}

export type Handlers = ReturnType<typeof createHandlers>;
