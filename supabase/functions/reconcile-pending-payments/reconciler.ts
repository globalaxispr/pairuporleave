// Pure, dependency-injected Payment Reconciliation Engine
// Safely reconciles pending (>5m), eligible failed, and paid-but-uncredited payments
// against authoritative server-side Stripe Checkout Session & PaymentIntent state.

import type Stripe from "npm:stripe@^17";
import type { SupabaseClient } from "npm:@supabase/supabase-js@^2";
import { createHandlers, type StripeSessionVerifier } from "../stripe-webhook/handlers.ts";

export const DEFAULT_RECONCILE_BATCH_SIZE = 20;
export const MAX_RECONCILE_BATCH_SIZE = 50;
export const MIN_PENDING_AGE_MINUTES = 5;
export const MAX_TRANSIENT_ATTEMPTS = 12;
export const STALE_UNPAID_SESSION_HOURS = 26;

export interface ReconcilablePaymentRow {
  id: string;
  stripe_session_id: string;
  stripe_payment_intent_id: string | null;
  candidate_id: string;
  candidate_type: string;
  vote_quantity: number;
  vote_price: number;
  subtotal_amount?: number;
  service_fee_amount?: number;
  tax_amount?: number;
  amount: number;
  currency: string;
  status: string;
  reconciliation_attempts: number;
  reconciliation_status: string;
  created_at: string;
  has_vote: boolean;
  has_ledger: boolean;
  priority_tier?: number;
}

export interface ReconciliationItemOutcome {
  payment_id: string;
  stripe_session_id: string;
  previous_status: string;
  outcome:
    | "recovered"
    | "already_credited"
    | "skipped_unpaid"
    | "pending_recheck"
    | "transient_error"
    | "flagged_manual_review";
  message: string;
}

export interface ReconciliationBatchSummary {
  run_id: string | null;
  trigger_source: string;
  scanned_count: number;
  recovered_count: number;
  already_credited_count: number;
  skipped_unpaid_count: number;
  transient_error_count: number;
  flagged_manual_review_count: number;
  items: ReconciliationItemOutcome[];
}

export function timingSafeEqualStrings(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length === 0 || aBytes.length !== bBytes.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

export function computeNextBackoffIso(attemptsSoFar: number, nowMs = Date.now()): string {
  const safeAttempt = Math.max(0, Math.min(10, attemptsSoFar));
  // 10m, 20m, 40m, 80m, 160m, capped at 360m (6 hours)
  const delayMinutes = Math.min(360, 10 * Math.pow(2, safeAttempt));
  return new Date(nowMs + delayMinutes * 60_000).toISOString();
}

function isPermanentStripeMissingError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; statusCode?: number; message?: string };
  if (e.code === "resource_missing" || e.statusCode === 404) return true;
  if (typeof e.message === "string" && e.message.includes("No such checkout.session")) return true;
  return false;
}

function isIntegrityOrManualReviewError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const msg = String((err as { message?: string }).message ?? "");
  return (
    msg.includes("manual review") ||
    msg.includes("Reconciliation conflict") ||
    msg.includes("Payment integrity") ||
    msg.includes("non-recoverable") ||
    msg.includes("mismatch")
  );
}

export function createReconciler(params: {
  supabaseAdmin: SupabaseClient;
  stripe: StripeSessionVerifier;
}) {
  const { supabaseAdmin, stripe } = params;
  const { handleCheckoutCompleted } = createHandlers({ supabaseAdmin, stripe });

  async function reconcileSinglePaymentRow(
    row: ReconcilablePaymentRow,
    triggerSource: string
  ): Promise<ReconciliationItemOutcome> {
    const paymentId = row.id;
    const sessionId = row.stripe_session_id;

    // 1. Check for partial fulfillment (vote without ledger or ledger without vote)
    if (row.has_vote !== row.has_ledger) {
      const reason = `Reconciliation conflict requiring manual review: payment ${paymentId} has inconsistent credit state (has_vote=${row.has_vote}, has_ledger=${row.has_ledger}).`;
      await supabaseAdmin.rpc("flag_payment_manual_review", {
        p_payment_id: paymentId,
        p_reason: reason,
        p_source: triggerSource,
        p_details: { has_vote: row.has_vote, has_ledger: row.has_ledger },
      });
      return {
        payment_id: paymentId,
        stripe_session_id: sessionId,
        previous_status: row.status,
        outcome: "flagged_manual_review",
        message: reason,
      };
    }

    // 2. If already credited in both votes and score_ledger
    if (row.has_vote && row.has_ledger) {
      if (row.status !== "paid") {
        const reason = `Reconciliation conflict requiring manual review: payment ${paymentId} has local status '${row.status}' but already has credited vote and ledger records.`;
        await supabaseAdmin.rpc("flag_payment_manual_review", {
          p_payment_id: paymentId,
          p_reason: reason,
          p_source: triggerSource,
          p_details: {},
        });
        return {
          payment_id: paymentId,
          stripe_session_id: sessionId,
          previous_status: row.status,
          outcome: "flagged_manual_review",
          message: reason,
        };
      }
      return {
        payment_id: paymentId,
        stripe_session_id: sessionId,
        previous_status: row.status,
        outcome: "already_credited",
        message: "Payment already paid and credited in votes and score_ledger.",
      };
    }

    // 3. Validate stripe_session_id format before calling Stripe
    if (!sessionId || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
      const reason = `Invalid or missing stripe_session_id '${String(sessionId)}' on payment ${paymentId}.`;
      await supabaseAdmin.rpc("flag_payment_manual_review", {
        p_payment_id: paymentId,
        p_reason: reason,
        p_source: triggerSource,
        p_details: {},
      });
      return {
        payment_id: paymentId,
        stripe_session_id: String(sessionId),
        previous_status: row.status,
        outcome: "flagged_manual_review",
        message: reason,
      };
    }

    // 4. Retrieve authoritative Checkout Session + PaymentIntent from Stripe API
    let verifiedSession: Stripe.Checkout.Session;
    try {
      verifiedSession = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["payment_intent"],
      });
    } catch (stripeErr) {
      const errMsg = (stripeErr as Error).message || "Stripe API error";
      if (isPermanentStripeMissingError(stripeErr)) {
        const reason = `Stripe Checkout Session '${sessionId}' does not exist in Stripe: ${errMsg}`;
        await supabaseAdmin.rpc("flag_payment_manual_review", {
          p_payment_id: paymentId,
          p_reason: reason,
          p_source: triggerSource,
          p_details: {},
        });
        return {
          payment_id: paymentId,
          stripe_session_id: sessionId,
          previous_status: row.status,
          outcome: "flagged_manual_review",
          message: reason,
        };
      }

      const nextIso = computeNextBackoffIso(row.reconciliation_attempts);
      const { data: recRes } = await supabaseAdmin.rpc("record_payment_reconciliation_attempt", {
        p_payment_id: paymentId,
        p_reconciliation_status: "transient_error",
        p_error: `Stripe API transient failure: ${errMsg.slice(0, 240)}`,
        p_next_reconcile_at: nextIso,
        p_mark_failed: false,
        p_source: triggerSource,
        p_details: {},
      });

      if (recRes?.reconciliation_status === "exhausted" || recRes?.manual_review_required) {
        return {
          payment_id: paymentId,
          stripe_session_id: sessionId,
          previous_status: row.status,
          outcome: "flagged_manual_review",
          message: `Reconciliation retry limit exhausted after transient error: ${errMsg}`,
        };
      }

      return {
        payment_id: paymentId,
        stripe_session_id: sessionId,
        previous_status: row.status,
        outcome: "transient_error",
        message: `Transient Stripe error (scheduled retry at ${nextIso}): ${errMsg}`,
      };
    }

    // 5. Evaluate Stripe payment_status
    if (verifiedSession.payment_status !== "paid") {
      // CRITICAL: If local status is 'paid' (uncredited) but Stripe says NOT paid, flag manual review immediately!
      if (row.status === "paid") {
        const reason = `Reconciliation conflict requiring manual review: payment ${paymentId} is marked 'paid' locally, but Stripe session ${sessionId} has payment_status='${verifiedSession.payment_status}'.`;
        await supabaseAdmin.rpc("flag_payment_manual_review", {
          p_payment_id: paymentId,
          p_reason: reason,
          p_source: triggerSource,
          p_details: { stripe_payment_status: verifiedSession.payment_status },
        });
        return {
          payment_id: paymentId,
          stripe_session_id: sessionId,
          previous_status: row.status,
          outcome: "flagged_manual_review",
          message: reason,
        };
      }

      const sessionState = (verifiedSession as { status?: string | null }).status ?? "open";
      const piObj =
        verifiedSession.payment_intent && typeof verifiedSession.payment_intent === "object"
          ? (verifiedSession.payment_intent as Stripe.PaymentIntent)
          : null;
      const ageHours =
        (Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60);

      const isTerminalUnpaid =
        sessionState === "expired" ||
        piObj?.status === "canceled" ||
        ageHours >= STALE_UNPAID_SESSION_HOURS ||
        (row.status === "failed" && row.reconciliation_attempts >= 2);

      if (isTerminalUnpaid) {
        await supabaseAdmin.rpc("record_payment_reconciliation_attempt", {
          p_payment_id: paymentId,
          p_reconciliation_status: "skipped_unpaid",
          p_error: null,
          p_next_reconcile_at: null,
          p_mark_failed: true,
          p_source: triggerSource,
          p_details: {
            stripe_session_status: sessionState,
            stripe_payment_status: verifiedSession.payment_status,
            age_hours: Math.round(ageHours * 10) / 10,
          },
        });
        return {
          payment_id: paymentId,
          stripe_session_id: sessionId,
          previous_status: row.status,
          outcome: "skipped_unpaid",
          message: `Session ${sessionId} is ${sessionState}/${verifiedSession.payment_status}; marked failed and skipped.`,
        };
      }

      // Still open & within active window: schedule next check with backoff
      const nextIso = computeNextBackoffIso(row.reconciliation_attempts);
      const { data: recRes } = await supabaseAdmin.rpc("record_payment_reconciliation_attempt", {
        p_payment_id: paymentId,
        p_reconciliation_status: "pending_check",
        p_error: null,
        p_next_reconcile_at: nextIso,
        p_mark_failed: false,
        p_source: triggerSource,
        p_details: {
          stripe_session_status: sessionState,
          stripe_payment_status: verifiedSession.payment_status,
        },
      });

      if (recRes?.reconciliation_status === "exhausted" || recRes?.manual_review_required) {
        return {
          payment_id: paymentId,
          stripe_session_id: sessionId,
          previous_status: row.status,
          outcome: "flagged_manual_review",
          message: `Pending payment ${paymentId} exhausted reconciliation checks; escalated for manual review.`,
        };
      }

      return {
        payment_id: paymentId,
        stripe_session_id: sessionId,
        previous_status: row.status,
        outcome: "pending_recheck",
        message: `Session ${sessionId} still ${verifiedSession.payment_status}; next check at ${nextIso}.`,
      };
    }

    // 6. Stripe reports payment_status === 'paid'.
    //    Verify expanded PaymentIntent status, amount_received, currency, and zero refund before fulfillment.
    if (
      verifiedSession.payment_intent &&
      typeof verifiedSession.payment_intent === "object"
    ) {
      const piObj = verifiedSession.payment_intent as Stripe.PaymentIntent & { amount_refunded?: number };
      if (piObj.status && piObj.status !== "succeeded") {
        const reason = `Reconciliation conflict requiring manual review: session ${sessionId} is marked paid, but PaymentIntent ${piObj.id} has status '${piObj.status}'.`;
        await supabaseAdmin.rpc("flag_payment_manual_review", {
          p_payment_id: paymentId,
          p_reason: reason,
          p_source: triggerSource,
          p_details: { pi_status: piObj.status },
        });
        return {
          payment_id: paymentId,
          stripe_session_id: sessionId,
          previous_status: row.status,
          outcome: "flagged_manual_review",
          message: reason,
        };
      }
      if (typeof piObj.amount_refunded === "number" && piObj.amount_refunded > 0) {
        const reason = `Reconciliation conflict requiring manual review: PaymentIntent ${piObj.id} has already been refunded (${piObj.amount_refunded} cents).`;
        await supabaseAdmin.rpc("flag_payment_manual_review", {
          p_payment_id: paymentId,
          p_reason: reason,
          p_source: triggerSource,
          p_details: { amount_refunded: piObj.amount_refunded },
        });
        return {
          payment_id: paymentId,
          stripe_session_id: sessionId,
          previous_status: row.status,
          outcome: "flagged_manual_review",
          message: reason,
        };
      }
    }

    // 7. Execute atomic confirmation / recovery via handleCheckoutCompleted -> confirm_stripe_payment RPC
    try {
      await handleCheckoutCompleted(verifiedSession, {
        source: triggerSource,
        forceServerVerification: true,
      });

      // Record successful reconciliation state on payment
      await supabaseAdmin
        .from("payments")
        .update({
          reconciliation_status: "reconciled",
          reconciliation_attempts: (row.reconciliation_attempts ?? 0) + 1,
          last_reconciled_at: new Date().toISOString(),
          last_reconciliation_error: null,
          next_reconcile_at: null,
          recovery_source: triggerSource,
          recovered_at: new Date().toISOString(),
        })
        .eq("id", paymentId);

      return {
        payment_id: paymentId,
        stripe_session_id: sessionId,
        previous_status: row.status,
        outcome: "recovered",
        message: `Successfully reconciled payment ${paymentId} from '${row.status}' -> 'paid' and credited ${row.vote_quantity} votes.`,
      };
    } catch (confirmErr) {
      const errMsg = (confirmErr as Error).message || "Unknown confirmation error";
      if (isIntegrityOrManualReviewError(confirmErr)) {
        await supabaseAdmin.rpc("flag_payment_manual_review", {
          p_payment_id: paymentId,
          p_reason: errMsg,
          p_source: triggerSource,
          p_details: {},
        });
        return {
          payment_id: paymentId,
          stripe_session_id: sessionId,
          previous_status: row.status,
          outcome: "flagged_manual_review",
          message: errMsg,
        };
      }

      const nextIso = computeNextBackoffIso(row.reconciliation_attempts);
      const { data: recRes } = await supabaseAdmin.rpc("record_payment_reconciliation_attempt", {
        p_payment_id: paymentId,
        p_reconciliation_status: "transient_error",
        p_error: errMsg.slice(0, 240),
        p_next_reconcile_at: nextIso,
        p_mark_failed: false,
        p_source: triggerSource,
        p_details: {},
      });

      if (recRes?.reconciliation_status === "exhausted" || recRes?.manual_review_required) {
        return {
          payment_id: paymentId,
          stripe_session_id: sessionId,
          previous_status: row.status,
          outcome: "flagged_manual_review",
          message: `Reconciliation retry limit exhausted: ${errMsg}`,
        };
      }

      return {
        payment_id: paymentId,
        stripe_session_id: sessionId,
        previous_status: row.status,
        outcome: "transient_error",
        message: errMsg,
      };
    }
  }

  async function runReconciliationBatch(options?: {
    paymentId?: string;
    batchSize?: number;
    minPendingAgeMinutes?: number;
    triggerSource?: string;
    triggeredByAdminId?: string | null;
  }): Promise<ReconciliationBatchSummary> {
    const triggerSource = options?.triggerSource ?? "scheduled_cron";
    const batchSize = Math.min(
      MAX_RECONCILE_BATCH_SIZE,
      Math.max(1, options?.batchSize ?? DEFAULT_RECONCILE_BATCH_SIZE)
    );
    const minAgeMinutes = options?.minPendingAgeMinutes ?? MIN_PENDING_AGE_MINUTES;

    // 1. Create reconciliation run record (best-effort)
    let runId: string | null = null;
    try {
      const { data: runRow } = await supabaseAdmin
        .from("payment_reconciliation_runs")
        .insert({
          trigger_source: triggerSource,
          triggered_by: options?.triggeredByAdminId ?? null,
          status: "running",
        })
        .select("id")
        .single();
      if (runRow?.id) runId = runRow.id as string;
    } catch {
      // Ignore if table not yet migrated in mock environment
    }

    const summary: ReconciliationBatchSummary = {
      run_id: runId,
      trigger_source: triggerSource,
      scanned_count: 0,
      recovered_count: 0,
      already_credited_count: 0,
      skipped_unpaid_count: 0,
      transient_error_count: 0,
      flagged_manual_review_count: 0,
      items: [],
    };

    try {
      let rows: ReconcilablePaymentRow[] = [];

      if (options?.paymentId) {
        // Single payment targeted by an authenticated admin retry
        const { data: singlePay, error: singleErr } = await supabaseAdmin
          .from("payments")
          .select("*")
          .eq("id", options.paymentId)
          .maybeSingle();

        if (singleErr || !singlePay) {
          throw new Error(`Payment ${options.paymentId} not found.`);
        }

        const { data: voteRow } = await supabaseAdmin
          .from("votes")
          .select("id")
          .eq("payment_id", options.paymentId)
          .maybeSingle();

        const { data: ledgerRow } = await supabaseAdmin
          .from("score_ledger")
          .select("id")
          .eq("type", "PAID_VOTE")
          .eq("reference_id", options.paymentId)
          .maybeSingle();

        rows = [
          {
            ...(singlePay as ReconcilablePaymentRow),
            reconciliation_attempts: Number((singlePay as any).reconciliation_attempts ?? 0),
            reconciliation_status: String((singlePay as any).reconciliation_status ?? "none"),
            has_vote: Boolean(voteRow),
            has_ledger: Boolean(ledgerRow),
          },
        ];
      } else {
        const { data: batchData, error: batchErr } = await supabaseAdmin.rpc(
          "get_reconcilable_payments",
          {
            p_batch_size: batchSize,
            p_min_pending_age_minutes: minAgeMinutes,
          }
        );

        if (batchErr) {
          throw new Error(`Failed to fetch reconcilable payments batch: ${batchErr.message}`);
        }
        rows = (batchData ?? []) as ReconcilablePaymentRow[];
      }

      summary.scanned_count = rows.length;

      for (const row of rows) {
        const itemOutcome = await reconcileSinglePaymentRow(row, triggerSource);
        summary.items.push(itemOutcome);

        switch (itemOutcome.outcome) {
          case "recovered":
            summary.recovered_count++;
            break;
          case "already_credited":
            summary.already_credited_count++;
            break;
          case "skipped_unpaid":
            summary.skipped_unpaid_count++;
            break;
          case "transient_error":
            summary.transient_error_count++;
            break;
          case "flagged_manual_review":
            summary.flagged_manual_review_count++;
            break;
          default:
            break;
        }
      }

      if (runId) {
        await supabaseAdmin
          .from("payment_reconciliation_runs")
          .update({
            status: "completed",
            scanned_count: summary.scanned_count,
            recovered_count: summary.recovered_count,
            already_credited_count: summary.already_credited_count,
            skipped_unpaid_count: summary.skipped_unpaid_count,
            transient_error_count: summary.transient_error_count,
            flagged_manual_review_count: summary.flagged_manual_review_count,
            completed_at: new Date().toISOString(),
          })
          .eq("id", runId);
      }

      return summary;
    } catch (err) {
      if (runId) {
        await supabaseAdmin
          .from("payment_reconciliation_runs")
          .update({
            status: "failed",
            error_summary: ((err as Error).message || "Reconciliation failed").slice(0, 500),
            completed_at: new Date().toISOString(),
          })
          .eq("id", runId);
      }
      throw err;
    }
  }

  return {
    reconcileSinglePaymentRow,
    runReconciliationBatch,
  };
}

