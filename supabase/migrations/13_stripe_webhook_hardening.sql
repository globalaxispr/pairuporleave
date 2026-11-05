-- ====================================================
-- Migration: 13_stripe_webhook_hardening.sql
-- Stripe Payment & Webhook Security Hardening
-- Safe, non-destructive, and idempotent.
-- ====================================================

-- 1. DATABASE-LEVEL IDEMPOTENCY GUARD ON SCORE LEDGER
-- Ensures that a Stripe payment (referenced by reference_id) can NEVER
-- create duplicate PAID_VOTE entries in the score ledger, even under
-- concurrent webhook retries or race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS score_ledger_paid_vote_ref_unique
  ON public.score_ledger (reference_id)
  WHERE type = 'PAID_VOTE' AND reference_id IS NOT NULL;

-- 2. PERFORMANCE & QUERY INDEXES ON PAYMENTS
CREATE INDEX IF NOT EXISTS payments_status_idx ON public.payments (status);
CREATE INDEX IF NOT EXISTS payments_created_at_idx ON public.payments (created_at DESC);
CREATE INDEX IF NOT EXISTS payments_candidate_id_idx ON public.payments (candidate_id);

-- 3. HARDENED adjust_candidate_score WITH IDEMPOTENT PAID_VOTE HANDLING
CREATE OR REPLACE FUNCTION public.adjust_candidate_score(
  p_candidate_id uuid,
  p_type text,
  p_quantity int,
  p_reason text DEFAULT NULL,
  p_admin_id uuid DEFAULT NULL,
  p_admin_email text DEFAULT NULL,
  p_reference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cand record;
  v_prev_score bigint;
  v_delta bigint;
  v_raw_score bigint;
  v_new_score bigint;
  v_ledger_id uuid;
  v_signed_qty int;
  v_caller_admin_id uuid := p_admin_id;
  v_caller_admin_email text := p_admin_email;
BEGIN
  -- 1. Validate type
  IF p_type NOT IN ('PAID_VOTE', 'BONUS', 'PENALTY', 'CORRECTION', 'ADMIN_ADD', 'ADMIN_REMOVE') THEN
    RAISE EXCEPTION 'Invalid adjustment type: %', p_type;
  END IF;

  -- 2. Validate quantity
  IF p_type != 'CORRECTION' AND p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be a positive integer.';
  END IF;
  IF p_quantity = 0 THEN
    RAISE EXCEPTION 'Quantity cannot be zero.';
  END IF;
  IF ABS(p_quantity) > 10000 THEN
    RAISE EXCEPTION 'Quantity cannot exceed 10000 points per adjustment.';
  END IF;

  -- 3. Authorization check: if called by authenticated role directly, verify admin status
  IF auth.role() = 'authenticated' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Forbidden: User is not an authorized administrator.';
    END IF;

    IF v_caller_admin_id IS NULL THEN
      v_caller_admin_id := auth.uid();
    END IF;
    IF v_caller_admin_email IS NULL THEN
      SELECT email INTO v_caller_admin_email FROM public.admin_users WHERE id = auth.uid();
    END IF;
  END IF;

  -- 4. Idempotency guard for PAID_VOTE with reference_id (prevents duplicate score adjustments)
  IF p_type = 'PAID_VOTE' AND p_reference_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.score_ledger
      WHERE type = 'PAID_VOTE' AND reference_id = p_reference_id
    ) THEN
      SELECT current_score INTO v_new_score FROM public.candidates WHERE id = p_candidate_id;
      RETURN jsonb_build_object(
        'success', true,
        'already_processed', true,
        'candidate_id', p_candidate_id,
        'current_score', COALESCE(v_new_score, 0),
        'message', 'Payment already processed and credited in score ledger.'
      );
    END IF;
  END IF;

  -- 5. Lock candidate row for atomic update (prevents concurrent race conditions)
  SELECT * INTO v_cand FROM public.candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;

  v_prev_score := COALESCE(v_cand.current_score, v_cand.total_votes, 0);

  -- 6. Calculate delta and signed quantity
  IF p_type IN ('BONUS', 'ADMIN_ADD', 'PAID_VOTE') THEN
    v_signed_qty := p_quantity;
    v_delta := p_quantity;
  ELSIF p_type IN ('PENALTY', 'ADMIN_REMOVE') THEN
    v_signed_qty := -ABS(p_quantity);
    v_delta := -ABS(p_quantity);
  ELSE -- CORRECTION
    v_signed_qty := p_quantity;
    v_delta := p_quantity;
  END IF;

  v_raw_score := v_prev_score + v_delta;
  v_new_score := GREATEST(0, v_raw_score); -- Score never drops below zero

  -- 7. Atomically update candidate totals
  UPDATE public.candidates
  SET
    current_score = v_new_score,
    total_votes = v_new_score,
    paid_votes = CASE WHEN p_type = 'PAID_VOTE' THEN COALESCE(paid_votes, 0) + p_quantity ELSE COALESCE(paid_votes, 0) END,
    bonus_votes = CASE WHEN p_type IN ('BONUS', 'ADMIN_ADD') THEN COALESCE(bonus_votes, 0) + p_quantity
                       WHEN p_type = 'CORRECTION' AND p_quantity > 0 THEN COALESCE(bonus_votes, 0) + p_quantity
                       ELSE COALESCE(bonus_votes, 0) END,
    penalty_points = CASE WHEN p_type IN ('PENALTY', 'ADMIN_REMOVE') THEN COALESCE(penalty_points, 0) + ABS(p_quantity)
                          WHEN p_type = 'CORRECTION' AND p_quantity < 0 THEN COALESCE(penalty_points, 0) + ABS(p_quantity)
                          ELSE COALESCE(penalty_points, 0) END,
    updated_at = now()
  WHERE id = p_candidate_id;

  -- 8. Insert immutable ledger entry
  INSERT INTO public.score_ledger (
    candidate_id,
    type,
    quantity,
    previous_score,
    new_score,
    reason,
    admin_user_id,
    admin_email,
    reference_id
  ) VALUES (
    p_candidate_id,
    p_type,
    v_signed_qty,
    v_prev_score,
    v_new_score,
    p_reason,
    v_caller_admin_id,
    v_caller_admin_email,
    p_reference_id
  ) RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'success', true,
    'ledger_id', v_ledger_id,
    'candidate_id', p_candidate_id,
    'previous_score', v_prev_score,
    'new_score', v_new_score,
    'raw_score', v_raw_score,
    'capped_at_zero', (v_raw_score < 0)
  );
END;
$$;

-- 4. PERMISSIONS & SECURITY
REVOKE ALL ON FUNCTION public.adjust_candidate_score(uuid, text, int, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_candidate_score(uuid, text, int, text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_candidate_score(uuid, text, int, text, uuid, text, text) TO authenticated;

-- 5. ATOMIC STRIPE PAYMENT CONFIRMATION STORED PROCEDURE
-- Wraps payment status transition, vote insertion, and score crediting
-- into a SINGLE PostgreSQL transaction boundary. If ANY operation fails,
-- the entire transaction rolls back.
CREATE OR REPLACE FUNCTION public.confirm_stripe_payment(
  p_payment_id uuid,
  p_stripe_payment_intent_id text,
  p_candidate_id uuid,
  p_vote_quantity int,
  p_candidate_type text,
  p_vote_price int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_status text;
  v_score_res jsonb;
BEGIN
  -- 1. Lock payment row to prevent concurrent processing
  SELECT status INTO v_current_status
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id;
  END IF;

  -- Idempotency check: if already paid, exit cleanly
  IF v_current_status = 'paid' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'payment_id', p_payment_id,
      'message', 'Payment already processed and credited.'
    );
  END IF;

  IF v_current_status != 'pending' THEN
    RAISE EXCEPTION 'Payment is in status %, expected pending', v_current_status;
  END IF;

  -- 2. Transition payment status to paid
  UPDATE public.payments
  SET
    status = 'paid',
    stripe_payment_intent_id = p_stripe_payment_intent_id,
    candidate_type = p_candidate_type,
    vote_price = p_vote_price
  WHERE id = p_payment_id;

  -- 3. Insert vote record (unique index votes_payment_id_unique ensures idempotency)
  INSERT INTO public.votes (
    candidate_id,
    payment_id,
    quantity
  ) VALUES (
    p_candidate_id,
    p_payment_id,
    p_vote_quantity
  )
  ON CONFLICT (payment_id) DO NOTHING;

  -- 4. Atomically adjust candidate score and append to score_ledger
  v_score_res := public.adjust_candidate_score(
    p_candidate_id := p_candidate_id,
    p_type := 'PAID_VOTE',
    p_quantity := p_vote_quantity,
    p_reason := 'Stripe Payment (' || p_candidate_type || ')',
    p_admin_id := NULL,
    p_admin_email := NULL,
    p_reference_id := p_payment_id::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'already_processed', false,
    'payment_id', p_payment_id,
    'candidate_id', p_candidate_id,
    'vote_quantity', p_vote_quantity,
    'score_result', v_score_res
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_stripe_payment(uuid, text, uuid, int, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_stripe_payment(uuid, text, uuid, int, text, int) TO service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 13_stripe_webhook_hardening applied successfully.';
END;
$$;
