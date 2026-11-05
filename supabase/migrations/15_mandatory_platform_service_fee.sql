-- ============================================================================
-- MIGRATION 15: Mandatory Platform Service Fee Schema & RPC Integrity Update
--
-- Target Project: peruporlove (wbecjmayzdzlcpajwzey)
--
-- Invariants enforced:
--   1. subtotal_amount = vote_quantity * vote_price
--   2. service_fee_amount >= 0, tax_amount >= 0
--   3. amount (total_amount) = subtotal_amount + service_fee_amount + tax_amount
--   4. Vote crediting in public.votes and public.score_ledger depends ONLY on
--      verified vote_quantity, never on service_fee_amount or amount.
--   5. 100% backward-compatible with legacy rows, pending pre-fee Checkout Sessions,
--      and rollback of create-checkout-session via BEFORE INSERT/UPDATE trigger
--      that auto-populates subtotal_amount when omitted.
-- ============================================================================

BEGIN;

-- 1. Add additive fee accounting columns to public.payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS subtotal_amount integer,
  ADD COLUMN IF NOT EXISTS service_fee_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount integer NOT NULL DEFAULT 0;

-- 2. Backfill historical payments where subtotal_amount is NULL
--    For all existing payments prior to service fees, amount == vote_quantity * vote_price.
UPDATE public.payments
SET
  subtotal_amount = vote_quantity * vote_price,
  service_fee_amount = COALESCE(service_fee_amount, 0),
  tax_amount = COALESCE(tax_amount, 0)
WHERE subtotal_amount IS NULL;

-- Verify no existing rows violate the accounting invariants before adding constraints
DO $$
DECLARE
  v_bad_id uuid;
BEGIN
  SELECT id INTO v_bad_id
  FROM public.payments
  WHERE subtotal_amount IS DISTINCT FROM (vote_quantity * vote_price)
     OR service_fee_amount < 0
     OR tax_amount < 0
     OR amount IS DISTINCT FROM (subtotal_amount + service_fee_amount + tax_amount)
  LIMIT 1;

  IF v_bad_id IS NOT NULL THEN
    RAISE EXCEPTION 'Pre-migration accounting conflict on payment %: existing row violates subtotal/fee/total invariant.',
      v_bad_id;
  END IF;
END;
$$;

ALTER TABLE public.payments
  ALTER COLUMN subtotal_amount SET NOT NULL;

-- 3. Add table-level CHECK constraints for non-negative fees and exact total accounting
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass
      AND conname = 'payments_service_fee_non_negative'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_service_fee_non_negative
      CHECK (service_fee_amount >= 0 AND tax_amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass
      AND conname = 'payments_subtotal_integrity_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_subtotal_integrity_check
      CHECK (subtotal_amount = vote_quantity * vote_price);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass
      AND conname = 'payments_total_amount_integrity_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_total_amount_integrity_check
      CHECK (amount = subtotal_amount + service_fee_amount + tax_amount);
  END IF;
END;
$$;

-- 4. Backward-compatibility trigger: if a legacy caller or rolled-back Edge Function
--    inserts into public.payments without specifying subtotal_amount, populate
--    subtotal_amount := vote_quantity * vote_price automatically before constraint check.
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
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_payments_populate_subtotal ON public.payments;
CREATE TRIGGER trg_payments_populate_subtotal
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.payments_populate_subtotal_trigger();

-- 5. Update public.confirm_stripe_payment to enforce subtotal + service_fee + tax = amount
--    while crediting ONLY v_payment.vote_quantity (preserving existing 6-arg signature).
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
  v_clean_pi text := NULLIF(btrim(p_stripe_payment_intent_id), '');
  v_caller_role text := COALESCE(auth.role(), 'none');
BEGIN
  -- 0. Defense-in-depth role check using real Supabase/PostgREST JWT & session_user semantics.
  IF v_caller_role != 'service_role' AND session_user != 'service_role' THEN
    RAISE EXCEPTION 'Forbidden: confirm_stripe_payment can only be executed by service_role.';
  END IF;

  -- 1. Require a valid Stripe PaymentIntent ID on paid checkout confirmation / reconciliation
  IF v_clean_pi IS NULL OR v_clean_pi !~ '^pi_[A-Za-z0-9_]+$' THEN
    RAISE EXCEPTION 'Payment integrity mismatch: valid Stripe PaymentIntent ID (pi_...) is required for payment %.', p_payment_id;
  END IF;

  -- 2. Lock payment row to prevent concurrent race conditions and fetch authoritative record
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

  -- 3a. Enforce base vote subtotal and total payment accounting invariants
  IF v_payment.subtotal_amount IS DISTINCT FROM (v_payment.vote_quantity * v_payment.vote_price) THEN
    RAISE EXCEPTION 'Payment integrity mismatch: stored subtotal_amount % does not equal vote_quantity * vote_price.',
      v_payment.subtotal_amount;
  END IF;

  IF COALESCE(v_payment.service_fee_amount, -1) < 0 OR COALESCE(v_payment.tax_amount, -1) < 0 THEN
    RAISE EXCEPTION 'Payment integrity mismatch: negative service_fee_amount (%) or tax_amount (%) on payment %.',
      v_payment.service_fee_amount, v_payment.tax_amount, p_payment_id;
  END IF;

  IF v_payment.amount IS DISTINCT FROM (v_payment.subtotal_amount + v_payment.service_fee_amount + v_payment.tax_amount) THEN
    RAISE EXCEPTION 'Payment integrity mismatch: stored total amount % does not equal subtotal_amount (%) + service_fee_amount (%) + tax_amount (%).',
      v_payment.amount, v_payment.subtotal_amount, v_payment.service_fee_amount, v_payment.tax_amount;
  END IF;

  -- 4. Enforce PaymentIntent consistency across ALL states ('pending', 'failed', 'paid').
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

  -- 5. Inspect existing credit state in public.votes and public.score_ledger
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

  IF v_has_vote IS DISTINCT FROM v_has_ledger THEN
    RAISE EXCEPTION 'Reconciliation conflict requiring manual review: payment % has inconsistent credit state (has_vote=%, has_ledger=%).',
      p_payment_id, v_has_vote, v_has_ledger;
  END IF;

  -- 5a. If already credited in both votes and score_ledger, verify integrity & handle idempotently
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

    IF v_payment.stripe_payment_intent_id IS NULL THEN
      UPDATE public.payments
      SET stripe_payment_intent_id = v_clean_pi
      WHERE id = p_payment_id;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'recovered', false,
      'previous_status', v_payment.status,
      'payment_id', p_payment_id,
      'candidate_id', v_payment.candidate_id,
      'vote_quantity', v_payment.vote_quantity,
      'subtotal_amount', v_payment.subtotal_amount,
      'service_fee_amount', v_payment.service_fee_amount,
      'tax_amount', v_payment.tax_amount,
      'total_amount', v_payment.amount,
      'stripe_payment_intent_id', COALESCE(v_payment.stripe_payment_intent_id, v_clean_pi),
      'message', 'Payment already processed and credited.'
    );
  END IF;

  -- 6. Payment is NOT yet credited. Allow 'pending' -> 'paid' or verified reconciliation from 'failed' / uncredited 'paid'.
  IF v_payment.status NOT IN ('pending', 'failed', 'paid') THEN
    RAISE EXCEPTION 'Payment % is in non-recoverable status %, manual review required',
      p_payment_id, v_payment.status;
  END IF;

  v_previous_status := v_payment.status;
  v_is_recovery := (v_previous_status != 'pending');

  -- 7. Transition payment status to paid (preserving existing PI if already set)
  UPDATE public.payments
  SET
    status = 'paid',
    stripe_payment_intent_id = COALESCE(v_payment.stripe_payment_intent_id, v_clean_pi)
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

  RETURN jsonb_build_object(
    'success', true,
    'already_processed', false,
    'recovered', v_is_recovery,
    'previous_status', v_previous_status,
    'payment_id', v_payment.id,
    'candidate_id', v_payment.candidate_id,
    'vote_quantity', v_payment.vote_quantity,
    'subtotal_amount', v_payment.subtotal_amount,
    'service_fee_amount', v_payment.service_fee_amount,
    'tax_amount', v_payment.tax_amount,
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

COMMIT;

