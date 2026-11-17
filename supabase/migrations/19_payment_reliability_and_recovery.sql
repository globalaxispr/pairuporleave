-- ============================================================================
-- Migration: 19_payment_reliability_and_recovery.sql
-- Complete Payment Reliability, Automatic Recovery, Refund/Dispute Audit,
-- and Reconciliation Infrastructure
--
-- Target Project: PAIR UP OR LEAVE (wbecjmayzdzlcpajwzey)
-- PostgreSQL 17 / 18 Compatible — Additive, Idempotent, Non-Destructive
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ENSURE ADDITIVE FEE & RELIABILITY COLUMNS ON public.payments
-- ============================================================================
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS subtotal_amount integer,
  ADD COLUMN IF NOT EXISTS service_fee_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS votes_credited_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovered_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_source text,
  ADD COLUMN IF NOT EXISTS reconciliation_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_reconcile_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS last_reconciliation_error text,
  ADD COLUMN IF NOT EXISTS manual_review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_review_reason text,
  ADD COLUMN IF NOT EXISTS manual_review_flagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_charge_id text,
  ADD COLUMN IF NOT EXISTS refund_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS refunded_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_reason text,
  ADD COLUMN IF NOT EXISTS dispute_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS stripe_dispute_id text,
  ADD COLUMN IF NOT EXISTS disputed_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_reason text;

-- Backfill subtotal_amount on any legacy rows where NULL
UPDATE public.payments
SET
  subtotal_amount = vote_quantity * vote_price,
  service_fee_amount = COALESCE(service_fee_amount, 0),
  tax_amount = COALESCE(tax_amount, 0)
WHERE subtotal_amount IS NULL;

-- Backfill paid_at, votes_credited_at, and reconciliation_status for existing paid rows that already have a vote record
UPDATE public.payments p
SET
  paid_at = COALESCE(p.paid_at, p.created_at),
  votes_credited_at = COALESCE(p.votes_credited_at, v.created_at, p.created_at),
  reconciliation_status = CASE WHEN p.reconciliation_status = 'none' THEN 'reconciled' ELSE p.reconciliation_status END
FROM public.votes v
WHERE v.payment_id = p.id
  AND p.status = 'paid'
  AND (p.paid_at IS NULL OR p.votes_credited_at IS NULL OR p.reconciliation_status = 'none');

-- Backfill reconciliation_status = 'skipped_unpaid' for historical expired failed rows older than 26 hours with no PaymentIntent
UPDATE public.payments
SET reconciliation_status = 'skipped_unpaid'
WHERE status = 'failed'
  AND stripe_payment_intent_id IS NULL
  AND reconciliation_status = 'none'
  AND created_at < now() - interval '26 hours';

ALTER TABLE public.payments
  ALTER COLUMN subtotal_amount SET NOT NULL;

-- Backward-compatibility trigger to auto-populate subtotal_amount if omitted by legacy callers
CREATE OR REPLACE FUNCTION public.payments_populate_subtotal_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.subtotal_amount IS NULL AND NEW.vote_quantity IS NOT NULL AND NEW.vote_price IS NOT NULL THEN
    NEW.subtotal_amount := NEW.vote_quantity * NEW.vote_price;
  END IF;
  IF NEW.service_fee_amount IS NULL THEN
    NEW.service_fee_amount := 0;
  END IF;
  IF NEW.tax_amount IS NULL THEN
    NEW.tax_amount := 0;
  END IF;
  NEW.updated_at := COALESCE(NEW.updated_at, now());
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_payments_populate_subtotal ON public.payments;
CREATE TRIGGER trg_payments_populate_subtotal
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.payments_populate_subtotal_trigger();

-- ============================================================================
-- 2. TABLE CONSTRAINTS & PERFORMANCE INDEXES ON public.payments
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass AND conname = 'payments_service_fee_non_negative'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_service_fee_non_negative
      CHECK (service_fee_amount >= 0 AND tax_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass AND conname = 'payments_subtotal_integrity_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_subtotal_integrity_check
      CHECK (subtotal_amount = vote_quantity * vote_price);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass AND conname = 'payments_total_amount_integrity_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_total_amount_integrity_check
      CHECK (amount = subtotal_amount + service_fee_amount + tax_amount);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass AND conname = 'payments_reconciliation_status_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_reconciliation_status_check
      CHECK (reconciliation_status IN ('none', 'pending_check', 'reconciled', 'skipped_unpaid', 'transient_error', 'exhausted', 'manual_review'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass AND conname = 'payments_refund_status_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_refund_status_check
      CHECK (refund_status IN ('none', 'partial', 'full') AND refunded_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass AND conname = 'payments_dispute_status_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_dispute_status_check
      CHECK (dispute_status IN ('none', 'warning_needs_response', 'warning_under_review', 'warning_closed', 'needs_response', 'under_review', 'won', 'lost') AND disputed_amount >= 0);
  END IF;
END;
$$;

-- Unique partial index on stripe_payment_intent_id to prevent PaymentIntent replay across payments
CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_payment_intent_id_unique
  ON public.payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_reconciliation_queue_idx
  ON public.payments (status, reconciliation_status, next_reconcile_at, created_at)
  WHERE manual_review_required = false
    AND reconciliation_status NOT IN ('reconciled', 'skipped_unpaid', 'exhausted', 'manual_review');

CREATE INDEX IF NOT EXISTS payments_manual_review_idx
  ON public.payments (manual_review_required, created_at DESC)
  WHERE manual_review_required = true;

CREATE INDEX IF NOT EXISTS payments_refund_dispute_idx
  ON public.payments (refund_status, dispute_status)
  WHERE refund_status != 'none' OR dispute_status != 'none';

CREATE INDEX IF NOT EXISTS payments_stripe_charge_id_idx
  ON public.payments (stripe_charge_id)
  WHERE stripe_charge_id IS NOT NULL;

-- ============================================================================
-- 3. IMMUTABLE PAYMENT EVENTS AUDIT LOG & RECONCILIATION RUNS TABLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payment_events_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  stripe_session_id text,
  stripe_payment_intent_id text,
  stripe_event_id text,
  event_type text NOT NULL,
  source text NOT NULL,
  outcome text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_events_log_stripe_event_id_unique
  ON public.payment_events_log (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_events_log_payment_id_idx
  ON public.payment_events_log (payment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_events_log_created_at_idx
  ON public.payment_events_log (created_at DESC);

-- Prevent mutation or deletion of payment_events_log records
CREATE OR REPLACE FUNCTION public.prevent_payment_events_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RAISE EXCEPTION 'payment_events_log records are immutable audit entries and cannot be modified or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_events_log_immutable ON public.payment_events_log;
CREATE TRIGGER trg_payment_events_log_immutable
  BEFORE UPDATE OR DELETE ON public.payment_events_log
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_payment_events_log_mutation();

ALTER TABLE public.payment_events_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.payment_events_log FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.payment_events_log TO authenticated, service_role;
GRANT INSERT ON TABLE public.payment_events_log TO service_role;

DROP POLICY IF EXISTS "Admins can view payment_events_log" ON public.payment_events_log;
CREATE POLICY "Admins can view payment_events_log"
  ON public.payment_events_log
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()));

-- Table tracking scheduled and manual reconciliation runs
CREATE TABLE IF NOT EXISTS public.payment_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_source text NOT NULL,
  triggered_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  scanned_count integer NOT NULL DEFAULT 0,
  recovered_count integer NOT NULL DEFAULT 0,
  already_credited_count integer NOT NULL DEFAULT 0,
  skipped_unpaid_count integer NOT NULL DEFAULT 0,
  transient_error_count integer NOT NULL DEFAULT 0,
  flagged_manual_review_count integer NOT NULL DEFAULT 0,
  error_summary text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS payment_reconciliation_runs_started_at_idx
  ON public.payment_reconciliation_runs (started_at DESC);

ALTER TABLE public.payment_reconciliation_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.payment_reconciliation_runs FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.payment_reconciliation_runs TO authenticated, service_role;
GRANT INSERT, UPDATE ON TABLE public.payment_reconciliation_runs TO service_role;

DROP POLICY IF EXISTS "Admins can view payment_reconciliation_runs" ON public.payment_reconciliation_runs;
CREATE POLICY "Admins can view payment_reconciliation_runs"
  ON public.payment_reconciliation_runs
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()));

-- ============================================================================
-- 4. RECOVERY-CAPABLE ATOMIC PAYMENT CONFIRMATION RPC
--    Preserves the exact 6-arg signature for 100% compatibility while supporting
--    safe failed->paid recovery, paid-without-votes repair, partial-state
--    conflict detection, and refund/dispute blocks.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.confirm_stripe_payment(
  p_payment_id uuid,
  p_stripe_payment_intent_id text,
  p_candidate_id uuid,
  p_vote_quantity integer,
  p_candidate_type text,
  p_vote_price integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payment record;
  v_existing_vote record;
  v_existing_ledger record;
  v_has_vote boolean := false;
  v_has_ledger boolean := false;
  v_previous_status text;
  v_is_recovery boolean := false;
  v_score_res jsonb;
  v_subtotal int;
  v_service_fee int;
  v_tax int;
  v_clean_pi text := NULLIF(btrim(p_stripe_payment_intent_id), '');
  v_caller_role text := COALESCE(
    NULLIF(auth.role(), 'none'),
    CASE WHEN current_user IN ('postgres', 'service_role') AND session_user IN ('postgres', 'service_role') THEN 'service_role' ELSE 'none' END
  );
BEGIN
  -- 0. Defense-in-depth role check: strictly service_role only
  IF v_caller_role != 'service_role' AND session_user != 'service_role' THEN
    RAISE EXCEPTION 'Forbidden: confirm_stripe_payment can only be executed by service_role.';
  END IF;

  -- 1. Require a valid Stripe PaymentIntent ID (pi_...) on paid checkout confirmation / recovery
  IF v_clean_pi IS NULL OR v_clean_pi !~ '^pi_[A-Za-z0-9_]+$' THEN
    RAISE EXCEPTION 'Payment integrity mismatch: valid Stripe PaymentIntent ID (pi_...) is required for payment %.', p_payment_id;
  END IF;

  -- 2. Lock payment row FOR UPDATE to serialize concurrent webhook, verify-payment, and reconciliation attempts
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id;
  END IF;

  IF v_payment.stripe_session_id IS NULL OR btrim(v_payment.stripe_session_id) = '' THEN
    RAISE EXCEPTION 'Payment integrity mismatch (manual review required): payment % is missing stripe_session_id.', p_payment_id;
  END IF;

  -- 3. Verify caller arguments against the authoritative payment record in PostgreSQL
  IF v_payment.candidate_id IS DISTINCT FROM p_candidate_id THEN
    RAISE EXCEPTION 'Payment integrity mismatch: candidate_id % does not match payment record %.',
      p_candidate_id, v_payment.candidate_id;
  END IF;

  IF v_payment.vote_quantity IS DISTINCT FROM p_vote_quantity
     OR v_payment.vote_quantity < 1
     OR v_payment.vote_quantity > 1000 THEN
    RAISE EXCEPTION 'Payment integrity mismatch: vote_quantity % does not match valid payment record %.',
      p_vote_quantity, v_payment.vote_quantity;
  END IF;

  IF v_payment.candidate_type IS DISTINCT FROM p_candidate_type THEN
    RAISE EXCEPTION 'Payment integrity mismatch: candidate_type % does not match payment record %.',
      p_candidate_type, v_payment.candidate_type;
  END IF;

  IF v_payment.vote_price IS DISTINCT FROM p_vote_price THEN
    RAISE EXCEPTION 'Payment integrity mismatch: vote_price % does not match payment record %.',
      p_vote_price, v_payment.vote_price;
  END IF;

  -- 3a. Enforce base vote subtotal and total payment accounting invariants (compatible with legacy_base_v0, tiered_v2, and dynamic_v3)
  v_subtotal := COALESCE(v_payment.subtotal_amount, v_payment.vote_quantity * v_payment.vote_price);
  v_service_fee := COALESCE(v_payment.service_fee_amount, 0);
  v_tax := COALESCE(v_payment.tax_amount, 0);

  IF v_subtotal IS DISTINCT FROM (v_payment.vote_quantity * v_payment.vote_price) THEN
    RAISE EXCEPTION 'Payment integrity mismatch: stored subtotal_amount % does not equal vote_quantity * vote_price.',
      v_subtotal;
  END IF;

  IF v_service_fee < 0 OR v_tax < 0 THEN
    RAISE EXCEPTION 'Payment integrity mismatch: negative service_fee_amount (%) or tax_amount (%) on payment %.',
      v_service_fee, v_tax, p_payment_id;
  END IF;

  IF v_payment.amount IS DISTINCT FROM (v_subtotal + v_service_fee + v_tax) THEN
    RAISE EXCEPTION 'Payment integrity mismatch: stored total amount % does not equal subtotal_amount (%) + service_fee_amount (%) + tax_amount (%).',
      v_payment.amount, v_subtotal, v_service_fee, v_tax;
  END IF;

  -- 4. Enforce PaymentIntent consistency across ALL states ('pending', 'failed', 'paid')
  IF v_payment.stripe_payment_intent_id IS NOT NULL
     AND v_payment.stripe_payment_intent_id IS DISTINCT FROM v_clean_pi THEN
    RAISE EXCEPTION 'Payment integrity mismatch (manual review required): Stripe PaymentIntent % does not match recorded PaymentIntent %.',
      v_clean_pi, v_payment.stripe_payment_intent_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE stripe_payment_intent_id = v_clean_pi
      AND id != p_payment_id
  ) THEN
    RAISE EXCEPTION 'Payment integrity conflict (manual review required): Stripe PaymentIntent % is already associated with another payment.',
      v_clean_pi;
  END IF;

  -- 4a. Block crediting if payment has a recorded refund or active/lost dispute
  IF v_payment.status = 'refunded'
     OR COALESCE(v_payment.refund_status, 'none') != 'none'
     OR COALESCE(v_payment.refunded_amount, 0) > 0 THEN
    RAISE EXCEPTION 'Payment % is in non-recoverable refunded state (status=%, refund_status=%), manual review required',
      p_payment_id, v_payment.status, COALESCE(v_payment.refund_status, 'none');
  END IF;

  IF COALESCE(v_payment.dispute_status, 'none') NOT IN ('none', 'won', 'warning_closed') THEN
    RAISE EXCEPTION 'Payment % has an active or lost dispute (dispute_status=%), manual review required',
      p_payment_id, v_payment.dispute_status;
  END IF;

  -- 5. Inspect existing fulfillment state in public.votes and public.score_ledger
  SELECT id, candidate_id, quantity
    INTO v_existing_vote
  FROM public.votes
  WHERE payment_id = p_payment_id;
  v_has_vote := FOUND;

  SELECT id, candidate_id, quantity
    INTO v_existing_ledger
  FROM public.score_ledger
  WHERE type = 'PAID_VOTE'
    AND reference_id = p_payment_id::text;
  v_has_ledger := FOUND;

  -- Detect partial fulfillment (e.g., vote row without ledger row or vice versa)
  -- Never guess when state is partially fulfilled; require manual review.
  IF v_has_vote IS DISTINCT FROM v_has_ledger THEN
    RAISE EXCEPTION 'Reconciliation conflict requiring manual review: payment % has inconsistent credit state (has_vote=%, has_ledger=%).',
      p_payment_id, v_has_vote, v_has_ledger;
  END IF;

  -- 5a. If already credited in BOTH votes and score_ledger, verify integrity & exit idempotently
  IF v_has_vote AND v_has_ledger THEN
    IF v_existing_vote.candidate_id IS DISTINCT FROM v_payment.candidate_id
       OR v_existing_vote.quantity IS DISTINCT FROM v_payment.vote_quantity
       OR v_existing_ledger.candidate_id IS DISTINCT FROM v_payment.candidate_id
       OR v_existing_ledger.quantity IS DISTINCT FROM v_payment.vote_quantity THEN
      RAISE EXCEPTION 'Reconciliation conflict requiring manual review: existing vote/ledger records for payment % do not match payment candidate or quantity.',
        p_payment_id;
    END IF;

    IF v_payment.status != 'paid' THEN
      RAISE EXCEPTION 'Reconciliation conflict requiring manual review: payment % has status % but already has credited vote and ledger records.',
        p_payment_id, v_payment.status;
    END IF;

    UPDATE public.payments
    SET
      stripe_payment_intent_id = COALESCE(v_payment.stripe_payment_intent_id, v_clean_pi),
      paid_at = COALESCE(v_payment.paid_at, now()),
      votes_credited_at = COALESCE(v_payment.votes_credited_at, now()),
      updated_at = now()
    WHERE id = p_payment_id
      AND (stripe_payment_intent_id IS NULL OR paid_at IS NULL OR votes_credited_at IS NULL);

    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'recovered', false,
      'previous_status', v_payment.status,
      'payment_id', p_payment_id,
      'candidate_id', v_payment.candidate_id,
      'vote_quantity', v_payment.vote_quantity,
      'subtotal_amount', v_subtotal,
      'service_fee_amount', v_service_fee,
      'tax_amount', v_tax,
      'total_amount', v_payment.amount,
      'stripe_payment_intent_id', COALESCE(v_payment.stripe_payment_intent_id, v_clean_pi),
      'message', 'Payment already processed and credited.'
    );
  END IF;

  -- 6. Payment is NOT yet credited in votes or score_ledger.
  --    Allow normal 'pending' -> 'paid' OR verified recovery from 'failed' / uncredited 'paid'.
  IF v_payment.status NOT IN ('pending', 'failed', 'paid') THEN
    RAISE EXCEPTION 'Payment % is in non-recoverable status %, manual review required',
      p_payment_id, v_payment.status;
  END IF;

  v_previous_status := v_payment.status;
  v_is_recovery := (v_previous_status != 'pending');

  -- 7. Transition payment status to paid and record fulfillment timestamps
  UPDATE public.payments
  SET
    status = 'paid',
    stripe_payment_intent_id = COALESCE(v_payment.stripe_payment_intent_id, v_clean_pi),
    paid_at = COALESCE(v_payment.paid_at, now()),
    votes_credited_at = now(),
    recovered_at = CASE WHEN v_is_recovery THEN COALESCE(v_payment.recovered_at, now()) ELSE v_payment.recovered_at END,
    recovery_source = CASE WHEN v_is_recovery THEN COALESCE(v_payment.recovery_source, 'verified_recovery') ELSE v_payment.recovery_source END,
    reconciliation_status = CASE WHEN v_is_recovery THEN 'reconciled' ELSE v_payment.reconciliation_status END,
    last_reconciliation_error = NULL,
    manual_review_required = false,
    manual_review_reason = NULL,
    updated_at = now()
  WHERE id = p_payment_id;

  -- 8. Insert vote record using ONLY authoritative v_payment.vote_quantity (never service_fee_amount)
  INSERT INTO public.votes (
    candidate_id,
    payment_id,
    quantity
  ) VALUES (
    v_payment.candidate_id,
    v_payment.id,
    v_payment.vote_quantity
  );

  -- 9. Atomically adjust candidate score and append immutable audit entry to score_ledger
  v_score_res := public.adjust_candidate_score(
    p_candidate_id := v_payment.candidate_id,
    p_type := 'PAID_VOTE',
    p_quantity := v_payment.vote_quantity,
    p_reason := CASE
      WHEN v_is_recovery THEN
        'Stripe Payment Reconciled from ' || v_previous_status || ' (' || v_payment.candidate_type || ', pi=' || v_clean_pi || ')'
      ELSE
        'Stripe Payment (' || v_payment.candidate_type || ')'
    END,
    p_admin_id := NULL,
    p_admin_email := NULL,
    p_reference_id := v_payment.id::text
  );

  -- 10. Record immutable payment fulfillment / recovery audit event
  INSERT INTO public.payment_events_log (
    payment_id,
    stripe_session_id,
    stripe_payment_intent_id,
    event_type,
    source,
    outcome,
    details
  ) VALUES (
    v_payment.id,
    v_payment.stripe_session_id,
    COALESCE(v_payment.stripe_payment_intent_id, v_clean_pi),
    CASE WHEN v_is_recovery THEN 'payment.recovered' ELSE 'payment.confirmed' END,
    'confirm_stripe_payment_rpc',
    CASE WHEN v_is_recovery THEN 'recovered' ELSE 'credited' END,
    jsonb_build_object(
      'previous_status', v_previous_status,
      'candidate_id', v_payment.candidate_id,
      'vote_quantity', v_payment.vote_quantity,
      'subtotal_amount', v_subtotal,
      'service_fee_amount', v_service_fee,
      'total_amount', v_payment.amount,
      'ledger_id', v_score_res->>'ledger_id'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'already_processed', false,
    'recovered', v_is_recovery,
    'previous_status', v_previous_status,
    'payment_id', v_payment.id,
    'candidate_id', v_payment.candidate_id,
    'vote_quantity', v_payment.vote_quantity,
    'subtotal_amount', v_subtotal,
    'service_fee_amount', v_service_fee,
    'tax_amount', v_tax,
    'total_amount', v_payment.amount,
    'stripe_payment_intent_id', COALESCE(v_payment.stripe_payment_intent_id, v_clean_pi),
    'score_result', v_score_res
  );
END;
$function$;

ALTER FUNCTION public.confirm_stripe_payment(uuid, text, uuid, integer, text, integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.confirm_stripe_payment(uuid, text, uuid, integer, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_stripe_payment(uuid, text, uuid, integer, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.confirm_stripe_payment(uuid, text, uuid, integer, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_stripe_payment(uuid, text, uuid, integer, text, integer) TO service_role;

-- ============================================================================
-- 5. HELPER RPC: GET RECONCILABLE PAYMENTS BATCH
--    Two-tier selection:
--      Tier 1: ANY 'paid' payment missing votes or score_ledger (no age limit).
--      Tier 2: 'pending' payments older than p_min_pending_age_minutes and
--              eligible 'failed' payments within recovery window.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_reconcilable_payments(
  p_batch_size integer DEFAULT 25,
  p_min_pending_age_minutes integer DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  stripe_session_id text,
  stripe_payment_intent_id text,
  candidate_id uuid,
  candidate_type text,
  vote_quantity integer,
  vote_price integer,
  subtotal_amount integer,
  service_fee_amount integer,
  tax_amount integer,
  amount integer,
  currency text,
  status text,
  reconciliation_attempts integer,
  reconciliation_status text,
  created_at timestamptz,
  has_vote boolean,
  has_ledger boolean,
  priority_tier integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_role text := COALESCE(
    NULLIF(auth.role(), 'none'),
    CASE WHEN current_user IN ('postgres', 'service_role') AND session_user IN ('postgres', 'service_role') THEN 'service_role' ELSE 'none' END
  );
  v_safe_batch int := LEAST(GREATEST(COALESCE(p_batch_size, 25), 1), 100);
  v_safe_age int := GREATEST(COALESCE(p_min_pending_age_minutes, 5), 0);
BEGIN
  IF v_caller_role != 'service_role' AND session_user != 'service_role' THEN
    RAISE EXCEPTION 'Forbidden: get_reconcilable_payments can only be executed by service_role.';
  END IF;

  RETURN QUERY
  WITH candidate_payments AS (
    SELECT
      p.id,
      p.stripe_session_id,
      p.stripe_payment_intent_id,
      p.candidate_id,
      p.candidate_type,
      p.vote_quantity,
      p.vote_price,
      p.subtotal_amount,
      p.service_fee_amount,
      p.tax_amount,
      p.amount,
      p.currency,
      p.status,
      p.reconciliation_attempts,
      p.reconciliation_status,
      p.created_at,
      EXISTS (SELECT 1 FROM public.votes v WHERE v.payment_id = p.id) AS has_vote,
      EXISTS (SELECT 1 FROM public.score_ledger sl WHERE sl.type = 'PAID_VOTE' AND sl.reference_id = p.id::text) AS has_ledger
    FROM public.payments p
    WHERE p.manual_review_required = false
      AND p.refund_status = 'none'
      AND p.dispute_status IN ('none', 'won', 'warning_closed')
      AND p.reconciliation_status NOT IN ('reconciled', 'skipped_unpaid', 'exhausted', 'manual_review')
      AND (p.next_reconcile_at IS NULL OR p.next_reconcile_at <= now())
      AND p.status IN ('paid', 'pending', 'failed')
  )
  SELECT
    cp.id,
    cp.stripe_session_id,
    cp.stripe_payment_intent_id,
    cp.candidate_id,
    cp.candidate_type,
    cp.vote_quantity,
    cp.vote_price,
    cp.subtotal_amount,
    cp.service_fee_amount,
    cp.tax_amount,
    cp.amount,
    cp.currency,
    cp.status,
    cp.reconciliation_attempts,
    cp.reconciliation_status,
    cp.created_at,
    cp.has_vote,
    cp.has_ledger,
    CASE
      WHEN cp.status = 'paid' AND (NOT cp.has_vote OR NOT cp.has_ledger) THEN 1
      WHEN cp.status = 'pending' THEN 2
      ELSE 3
    END AS priority_tier
  FROM candidate_payments cp
  WHERE
    -- Tier 1: Paid but missing vote or ledger record (NO age cutoff — never lose an older paid transaction)
    (cp.status = 'paid' AND (NOT cp.has_vote OR NOT cp.has_ledger))
    -- Tier 2: Pending older than minimum age threshold (all ages included so aged pending rows are either resolved or escalated)
    OR (cp.status = 'pending' AND cp.created_at <= now() - (v_safe_age || ' minutes')::interval)
    -- Tier 3: Failed payments that have not been verified as unpaid/expired yet (bounded retry count)
    OR (cp.status = 'failed' AND cp.reconciliation_attempts < 5)
  ORDER BY
    CASE
      WHEN cp.status = 'paid' AND (NOT cp.has_vote OR NOT cp.has_ledger) THEN 1
      WHEN cp.status = 'pending' THEN 2
      ELSE 3
    END ASC,
    cp.created_at ASC
  LIMIT v_safe_batch;
END;
$function$;

ALTER FUNCTION public.get_reconcilable_payments(integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_reconcilable_payments(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_reconcilable_payments(integer, integer) TO service_role;

-- ============================================================================
-- 6. HELPER RPC: FLAG PAYMENT FOR MANUAL REVIEW & RECORD RECONCILIATION STATE
--    Runs in its own transaction when called after a conflict so the flag is
--    durably persisted in public.payments and public.payment_events_log.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.flag_payment_manual_review(
  p_payment_id uuid,
  p_reason text,
  p_source text DEFAULT 'reconcile_edge_fn',
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payment record;
  v_caller_role text := COALESCE(
    NULLIF(auth.role(), 'none'),
    CASE WHEN current_user IN ('postgres', 'service_role') AND session_user IN ('postgres', 'service_role') THEN 'service_role' ELSE 'none' END
  );
  v_clean_reason text := COALESCE(NULLIF(btrim(p_reason), ''), 'Flagged for manual administrator review');
BEGIN
  IF v_caller_role != 'service_role' AND session_user != 'service_role' THEN
    RAISE EXCEPTION 'Forbidden: flag_payment_manual_review can only be executed by service_role.';
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id;
  END IF;

  UPDATE public.payments
  SET
    manual_review_required = true,
    manual_review_reason = v_clean_reason,
    manual_review_flagged_at = COALESCE(manual_review_flagged_at, now()),
    reconciliation_status = 'manual_review',
    reconciliation_attempts = reconciliation_attempts + 1,
    last_reconciled_at = now(),
    last_reconciliation_error = v_clean_reason,
    next_reconcile_at = NULL,
    updated_at = now()
  WHERE id = p_payment_id;

  INSERT INTO public.payment_events_log (
    payment_id,
    stripe_session_id,
    stripe_payment_intent_id,
    event_type,
    source,
    outcome,
    details
  ) VALUES (
    v_payment.id,
    v_payment.stripe_session_id,
    v_payment.stripe_payment_intent_id,
    'payment.manual_review_flagged',
    COALESCE(NULLIF(btrim(p_source), ''), 'reconcile_edge_fn'),
    'flagged_manual_review',
    jsonb_build_object('reason', v_clean_reason, 'status', v_payment.status) || COALESCE(p_details, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'manual_review_required', true,
    'reason', v_clean_reason
  );
END;
$function$;

ALTER FUNCTION public.flag_payment_manual_review(uuid, text, text, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.flag_payment_manual_review(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flag_payment_manual_review(uuid, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.record_payment_reconciliation_attempt(
  p_payment_id uuid,
  p_reconciliation_status text,
  p_error text DEFAULT NULL,
  p_next_reconcile_at timestamptz DEFAULT NULL,
  p_mark_failed boolean DEFAULT false,
  p_source text DEFAULT 'reconcile_edge_fn',
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payment record;
  v_new_attempts int;
  v_final_rec_status text := p_reconciliation_status;
  v_manual_review boolean := false;
  v_manual_reason text := NULL;
  v_caller_role text := COALESCE(
    NULLIF(auth.role(), 'none'),
    CASE WHEN current_user IN ('postgres', 'service_role') AND session_user IN ('postgres', 'service_role') THEN 'service_role' ELSE 'none' END
  );
BEGIN
  IF v_caller_role != 'service_role' AND session_user != 'service_role' THEN
    RAISE EXCEPTION 'Forbidden: record_payment_reconciliation_attempt can only be executed by service_role.';
  END IF;

  IF p_reconciliation_status NOT IN ('none', 'pending_check', 'reconciled', 'skipped_unpaid', 'transient_error', 'exhausted', 'manual_review') THEN
    RAISE EXCEPTION 'Invalid reconciliation_status: %', p_reconciliation_status;
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id;
  END IF;

  v_new_attempts := COALESCE(v_payment.reconciliation_attempts, 0) + 1;

  -- Escalate to exhausted / manual_review if retry limit (12 attempts) is reached on transient_error or pending_check
  IF v_new_attempts >= 12 AND v_final_rec_status IN ('transient_error', 'pending_check') THEN
    v_final_rec_status := 'exhausted';
    v_manual_review := true;
    v_manual_reason := COALESCE(NULLIF(btrim(p_error), ''), 'Reconciliation retry limit (12 attempts) exhausted; administrator review required.');
  ELSIF v_final_rec_status IN ('exhausted', 'manual_review') THEN
    v_manual_review := true;
    v_manual_reason := COALESCE(NULLIF(btrim(p_error), ''), 'Flagged during reconciliation for manual review.');
  END IF;

  UPDATE public.payments
  SET
    status = CASE
      WHEN p_mark_failed AND v_payment.status = 'pending' THEN 'failed'
      ELSE v_payment.status
    END,
    reconciliation_attempts = v_new_attempts,
    last_reconciled_at = now(),
    next_reconcile_at = CASE WHEN v_manual_review OR v_final_rec_status IN ('reconciled', 'skipped_unpaid', 'exhausted', 'manual_review') THEN NULL ELSE p_next_reconcile_at END,
    reconciliation_status = v_final_rec_status,
    last_reconciliation_error = p_error,
    manual_review_required = CASE WHEN v_manual_review THEN true ELSE v_payment.manual_review_required END,
    manual_review_reason = CASE WHEN v_manual_review THEN v_manual_reason ELSE v_payment.manual_review_reason END,
    manual_review_flagged_at = CASE WHEN v_manual_review THEN COALESCE(v_payment.manual_review_flagged_at, now()) ELSE v_payment.manual_review_flagged_at END,
    updated_at = now()
  WHERE id = p_payment_id;

  INSERT INTO public.payment_events_log (
    payment_id,
    stripe_session_id,
    stripe_payment_intent_id,
    event_type,
    source,
    outcome,
    details
  ) VALUES (
    v_payment.id,
    v_payment.stripe_session_id,
    v_payment.stripe_payment_intent_id,
    'reconciliation.attempt',
    COALESCE(NULLIF(btrim(p_source), ''), 'reconcile_edge_fn'),
    v_final_rec_status,
    jsonb_build_object(
      'attempt', v_new_attempts,
      'previous_status', v_payment.status,
      'mark_failed', p_mark_failed,
      'error', p_error,
      'escalated_manual_review', v_manual_review
    ) || COALESCE(p_details, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'reconciliation_attempts', v_new_attempts,
    'reconciliation_status', v_final_rec_status,
    'manual_review_required', v_manual_review OR v_payment.manual_review_required
  );
END;
$function$;

ALTER FUNCTION public.record_payment_reconciliation_attempt(uuid, text, text, timestamptz, boolean, text, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_payment_reconciliation_attempt(uuid, text, text, timestamptz, boolean, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_reconciliation_attempt(uuid, text, text, timestamptz, boolean, text, jsonb) TO service_role;

-- ============================================================================
-- 7. ATOMIC REFUND AND DISPUTE RECORDING RPC
--    Idempotent by stripe_event_id.
--    Preserves all votes, score_ledger entries, and candidate scores.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_stripe_refund_or_dispute(
  p_stripe_event_id text,
  p_event_type text,
  p_payment_id uuid DEFAULT NULL,
  p_stripe_payment_intent_id text DEFAULT NULL,
  p_stripe_charge_id text DEFAULT NULL,
  p_stripe_dispute_id text DEFAULT NULL,
  p_amount_cents integer DEFAULT 0,
  p_reason text DEFAULT NULL,
  p_dispute_status text DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payment record;
  v_clean_event_id text := NULLIF(btrim(p_stripe_event_id), '');
  v_clean_pi text := NULLIF(btrim(p_stripe_payment_intent_id), '');
  v_clean_charge text := NULLIF(btrim(p_stripe_charge_id), '');
  v_clean_dispute text := NULLIF(btrim(p_stripe_dispute_id), '');
  v_refund_type text;
  v_norm_dispute_status text;
  v_manual_review boolean := true;
  v_manual_reason text;
  v_caller_role text := COALESCE(
    NULLIF(auth.role(), 'none'),
    CASE WHEN current_user IN ('postgres', 'service_role') AND session_user IN ('postgres', 'service_role') THEN 'service_role' ELSE 'none' END
  );
BEGIN
  IF v_caller_role != 'service_role' AND session_user != 'service_role' THEN
    RAISE EXCEPTION 'Forbidden: record_stripe_refund_or_dispute can only be executed by service_role.';
  END IF;

  IF v_clean_event_id IS NULL THEN
    RAISE EXCEPTION 'stripe_event_id is required for idempotent refund/dispute processing.';
  END IF;

  IF p_event_type NOT IN ('charge.refunded', 'charge.dispute.created', 'charge.dispute.closed') THEN
    RAISE EXCEPTION 'Unsupported refund/dispute event_type: %', p_event_type;
  END IF;

  -- 1. Idempotency check by stripe_event_id
  IF EXISTS (
    SELECT 1 FROM public.payment_events_log
    WHERE stripe_event_id = v_clean_event_id
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'stripe_event_id', v_clean_event_id,
      'event_type', p_event_type
    );
  END IF;

  -- 2. Locate and lock target payment row (by payment_id, stripe_payment_intent_id, or stripe_charge_id)
  IF p_payment_id IS NOT NULL THEN
    SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  ELSIF v_clean_pi IS NOT NULL THEN
    SELECT * INTO v_payment FROM public.payments WHERE stripe_payment_intent_id = v_clean_pi FOR UPDATE;
  ELSIF v_clean_charge IS NOT NULL THEN
    SELECT * INTO v_payment FROM public.payments WHERE stripe_charge_id = v_clean_charge FOR UPDATE;
  END IF;

  -- 2a. If payment reference is unknown, log audit event for administrator visibility and return safely
  IF v_payment IS NULL THEN
    INSERT INTO public.payment_events_log (
      payment_id,
      stripe_session_id,
      stripe_payment_intent_id,
      stripe_event_id,
      event_type,
      source,
      outcome,
      details
    ) VALUES (
      NULL,
      NULL,
      v_clean_pi,
      v_clean_event_id,
      p_event_type,
      'stripe_webhook',
      'flagged_manual_review',
      jsonb_build_object(
        'warning', 'unknown_payment_reference',
        'stripe_charge_id', v_clean_charge,
        'stripe_dispute_id', v_clean_dispute,
        'amount_cents', p_amount_cents,
        'reason', p_reason
      ) || COALESCE(p_details, '{}'::jsonb)
    );

    RETURN jsonb_build_object(
      'success', true,
      'already_processed', false,
      'unknown_payment', true,
      'stripe_event_id', v_clean_event_id,
      'event_type', p_event_type
    );
  END IF;

  -- 3. Apply event-specific state transitions WITHOUT modifying votes or candidate scores
  IF p_event_type = 'charge.refunded' THEN
    IF COALESCE(p_amount_cents, 0) <= 0 THEN
      RAISE EXCEPTION 'Invalid refunded amount % for event %', p_amount_cents, v_clean_event_id;
    END IF;

    IF p_amount_cents >= v_payment.amount THEN
      v_refund_type := 'full';
      v_manual_reason := 'Full Stripe refund recorded (' || p_amount_cents || ' cents). Votes and candidate score preserved; review if administrative score adjustment is needed.';
    ELSE
      v_refund_type := 'partial';
      v_manual_reason := 'Partial Stripe refund recorded (' || p_amount_cents || ' of ' || v_payment.amount || ' cents). Votes and candidate score preserved; manual review required.';
    END IF;

    UPDATE public.payments
    SET
      status = CASE WHEN v_refund_type = 'full' THEN 'refunded' ELSE v_payment.status END,
      stripe_charge_id = COALESCE(v_payment.stripe_charge_id, v_clean_charge),
      stripe_payment_intent_id = COALESCE(v_payment.stripe_payment_intent_id, v_clean_pi),
      refund_status = v_refund_type,
      refunded_amount = GREATEST(COALESCE(v_payment.refunded_amount, 0), p_amount_cents),
      refunded_at = COALESCE(v_payment.refunded_at, now()),
      refund_reason = COALESCE(NULLIF(btrim(p_reason), ''), v_payment.refund_reason, 'stripe_refund'),
      manual_review_required = true,
      manual_review_reason = v_manual_reason,
      manual_review_flagged_at = COALESCE(v_payment.manual_review_flagged_at, now()),
      updated_at = now()
    WHERE id = v_payment.id;

    INSERT INTO public.payment_events_log (
      payment_id,
      stripe_session_id,
      stripe_payment_intent_id,
      stripe_event_id,
      event_type,
      source,
      outcome,
      details
    ) VALUES (
      v_payment.id,
      v_payment.stripe_session_id,
      COALESCE(v_payment.stripe_payment_intent_id, v_clean_pi),
      v_clean_event_id,
      p_event_type,
      'stripe_webhook',
      'refund_recorded',
      jsonb_build_object(
        'refund_status', v_refund_type,
        'refunded_amount', p_amount_cents,
        'payment_amount', v_payment.amount,
        'stripe_charge_id', v_clean_charge,
        'reason', p_reason
      ) || COALESCE(p_details, '{}'::jsonb)
    );

    RETURN jsonb_build_object(
      'success', true,
      'already_processed', false,
      'payment_id', v_payment.id,
      'refund_status', v_refund_type,
      'refunded_amount', p_amount_cents,
      'payment_status', CASE WHEN v_refund_type = 'full' THEN 'refunded' ELSE v_payment.status END,
      'manual_review_required', true
    );
  ELSE
    -- charge.dispute.created or charge.dispute.closed
    v_norm_dispute_status := CASE
      WHEN p_dispute_status IN ('warning_needs_response', 'warning_under_review', 'warning_closed', 'needs_response', 'under_review', 'won', 'lost')
        THEN p_dispute_status
      WHEN p_event_type = 'charge.dispute.closed' THEN 'lost'
      ELSE 'needs_response'
    END;

    IF p_event_type = 'charge.dispute.closed' AND v_norm_dispute_status IN ('won', 'warning_closed') THEN
      -- Dispute won/reversed in merchant's favor!
      IF COALESCE(v_payment.refund_status, 'none') = 'none' AND v_payment.votes_credited_at IS NOT NULL THEN
        v_manual_review := false;
        v_manual_reason := 'Dispute ' || COALESCE(v_clean_dispute, '') || ' closed in merchant favor (' || v_norm_dispute_status || ').';
      ELSE
        v_manual_review := true;
        v_manual_reason := 'Dispute ' || COALESCE(v_clean_dispute, '') || ' closed (' || v_norm_dispute_status || '), but payment requires fulfillment/refund verification.';
      END IF;
    ELSIF p_event_type = 'charge.dispute.closed' THEN
      v_manual_review := true;
      v_manual_reason := 'Stripe dispute lost (' || COALESCE(v_clean_dispute, 'unknown') || ', reason: ' || COALESCE(p_reason, 'unknown') || '). Votes and candidate score preserved; manual review required.';
    ELSE
      v_manual_review := true;
      v_manual_reason := 'Stripe dispute opened (' || COALESCE(v_clean_dispute, 'unknown') || ', status: ' || v_norm_dispute_status || ', reason: ' || COALESCE(p_reason, 'unknown') || '). Manual review required.';
    END IF;

    UPDATE public.payments
    SET
      stripe_charge_id = COALESCE(v_payment.stripe_charge_id, v_clean_charge),
      stripe_payment_intent_id = COALESCE(v_payment.stripe_payment_intent_id, v_clean_pi),
      stripe_dispute_id = COALESCE(v_clean_dispute, v_payment.stripe_dispute_id),
      dispute_status = v_norm_dispute_status,
      disputed_amount = CASE WHEN COALESCE(p_amount_cents, 0) > 0 THEN p_amount_cents ELSE COALESCE(v_payment.disputed_amount, v_payment.amount) END,
      disputed_at = COALESCE(v_payment.disputed_at, now()),
      dispute_closed_at = CASE WHEN p_event_type = 'charge.dispute.closed' THEN now() ELSE v_payment.dispute_closed_at END,
      dispute_reason = COALESCE(NULLIF(btrim(p_reason), ''), v_payment.dispute_reason),
      manual_review_required = v_manual_review,
      manual_review_reason = v_manual_reason,
      manual_review_flagged_at = CASE WHEN v_manual_review THEN COALESCE(v_payment.manual_review_flagged_at, now()) ELSE v_payment.manual_review_flagged_at END,
      updated_at = now()
    WHERE id = v_payment.id;

    INSERT INTO public.payment_events_log (
      payment_id,
      stripe_session_id,
      stripe_payment_intent_id,
      stripe_event_id,
      event_type,
      source,
      outcome,
      details
    ) VALUES (
      v_payment.id,
      v_payment.stripe_session_id,
      COALESCE(v_payment.stripe_payment_intent_id, v_clean_pi),
      v_clean_event_id,
      p_event_type,
      'stripe_webhook',
      'dispute_recorded',
      jsonb_build_object(
        'dispute_status', v_norm_dispute_status,
        'stripe_dispute_id', v_clean_dispute,
        'disputed_amount', p_amount_cents,
        'reason', p_reason,
        'manual_review_required', v_manual_review
      ) || COALESCE(p_details, '{}'::jsonb)
    );

    RETURN jsonb_build_object(
      'success', true,
      'already_processed', false,
      'payment_id', v_payment.id,
      'dispute_status', v_norm_dispute_status,
      'stripe_dispute_id', v_clean_dispute,
      'manual_review_required', v_manual_review
    );
  END IF;
END;
$function$;

ALTER FUNCTION public.record_stripe_refund_or_dispute(text, text, uuid, text, text, text, integer, text, text, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_stripe_refund_or_dispute(text, text, uuid, text, text, text, integer, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_stripe_refund_or_dispute(text, text, uuid, text, text, text, integer, text, text, jsonb) TO service_role;

COMMIT;

