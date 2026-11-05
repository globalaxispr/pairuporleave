-- ====================================================
-- Migration: 14_rpc_security_lockdown.sql
-- URGENT SECURITY REMEDIATION: RPC AUTHORIZATION LOCKDOWN (FINAL)
--
-- 1. Drops legacy increment_candidate_votes RPC.
-- 2. Hardens default schema privileges against automatic EXECUTE grants.
-- 3. Creates private internal schema and private.credit_paid_vote
--    inaccessible through PostgREST.
-- 4. Re-defines adjust_candidate_score with strict authorization,
--    derives admin identity from auth.uid(), and locks down PAID_VOTE
--    so it cannot accept arbitrary calls (requires paid status, matching
--    candidate, matching quantity, and uncredited status).
-- 5. Hardens confirm_stripe_payment strictly to service_role,
--    verifying payment identity and Stripe PaymentIntent consistency
--    before returning success for already-paid payments.
-- ====================================================

-- ----------------------------------------------------
-- 1. DROP LEGACY INSECURE RPC
-- ----------------------------------------------------
REVOKE ALL ON FUNCTION public.increment_candidate_votes(uuid, int) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.increment_candidate_votes(uuid, int);

-- ----------------------------------------------------
-- 2. HARDEN DEFAULT SCHEMA PRIVILEGES FOR ROLE postgres
-- ----------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- ----------------------------------------------------
-- 3. CREATE PRIVATE INTERNAL SCHEMA & PRIVATE CREDITING FUNCTION
-- ----------------------------------------------------
-- PostgREST only exposes schemas configured in its search path (public).
-- Creating a private schema and revoking all access from PUBLIC, anon, and authenticated
-- guarantees that internal payment crediting cannot be invoked via PostgREST RPC.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

CREATE OR REPLACE FUNCTION private.credit_paid_vote(
  p_payment_id uuid,
  p_candidate_id uuid,
  p_quantity int,
  p_candidate_type text DEFAULT 'individual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment record;
  v_cand record;
  v_prev_score bigint;
  v_raw_score bigint;
  v_new_score bigint;
  v_ledger_id uuid;
BEGIN
  -- 1. Authoritative payment verification: must exist, be paid, match candidate and quantity
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot credit payment: Payment % not found.', p_payment_id;
  END IF;

  IF v_payment.status != 'paid' THEN
    RAISE EXCEPTION 'Cannot credit payment: Payment % is in status %, expected paid.', p_payment_id, v_payment.status;
  END IF;

  IF v_payment.candidate_id IS DISTINCT FROM p_candidate_id THEN
    RAISE EXCEPTION 'Cannot credit payment: candidate_id mismatch for payment %. Expected %, got %.',
      p_payment_id, v_payment.candidate_id, p_candidate_id;
  END IF;

  IF v_payment.vote_quantity IS DISTINCT FROM p_quantity THEN
    RAISE EXCEPTION 'Cannot credit payment: vote_quantity mismatch for payment %. Expected %, got %.',
      p_payment_id, v_payment.vote_quantity, p_quantity;
  END IF;

  -- 2. Check if already credited in score_ledger (database-level idempotency guard)
  IF EXISTS (
    SELECT 1 FROM public.score_ledger
    WHERE type = 'PAID_VOTE' AND reference_id = p_payment_id::text
  ) THEN
    SELECT current_score INTO v_new_score FROM public.candidates WHERE id = p_candidate_id;
    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'payment_id', p_payment_id,
      'candidate_id', p_candidate_id,
      'current_score', COALESCE(v_new_score, 0),
      'message', 'Payment already processed and credited in score ledger.'
    );
  END IF;

  -- 3. Lock candidate row for atomic update (prevents race conditions)
  SELECT * INTO v_cand
  FROM public.candidates
  WHERE id = p_candidate_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate % not found.', p_candidate_id;
  END IF;

  v_prev_score := COALESCE(v_cand.current_score, v_cand.total_votes, 0);
  v_raw_score := v_prev_score + p_quantity;
  v_new_score := GREATEST(0, v_raw_score); -- Score never drops below zero

  -- 4. Atomically update candidate totals
  UPDATE public.candidates
  SET
    current_score = v_new_score,
    total_votes = v_new_score,
    paid_votes = COALESCE(paid_votes, 0) + p_quantity,
    updated_at = now()
  WHERE id = p_candidate_id;

  -- 5. Insert immutable ledger entry
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
    'PAID_VOTE',
    p_quantity,
    v_prev_score,
    v_new_score,
    'Stripe Payment (' || COALESCE(p_candidate_type, v_cand.candidate_type, 'individual') || ')',
    NULL,
    NULL,
    p_payment_id::text
  ) RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_processed', false,
    'ledger_id', v_ledger_id,
    'candidate_id', p_candidate_id,
    'previous_score', v_prev_score,
    'new_score', v_new_score,
    'raw_score', v_raw_score
  );
END;
$$;

ALTER FUNCTION private.credit_paid_vote(uuid, uuid, int, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.credit_paid_vote(uuid, uuid, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.credit_paid_vote(uuid, uuid, int, text) TO postgres, service_role;

-- ----------------------------------------------------
-- 4. RE-DEFINE adjust_candidate_score WITH ROLE ISOLATION & AUDIT INTEGRITY
-- ----------------------------------------------------
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
  v_payment_rec record;
  v_prev_score bigint;
  v_delta bigint;
  v_raw_score bigint;
  v_new_score bigint;
  v_ledger_id uuid;
  v_signed_qty int;
  v_caller_admin_id uuid := NULL;
  v_caller_admin_email text := NULL;
  v_caller_role text := COALESCE(auth.role(), 'none');
  v_caller_uid uuid := auth.uid();
BEGIN
  -- Strict Check 1: Explicitly reject every role except authenticated and service_role
  IF v_caller_role NOT IN ('authenticated', 'service_role') THEN
    RAISE EXCEPTION 'Forbidden: Role % is not authorized to execute adjust_candidate_score.', v_caller_role;
  END IF;

  -- Validate adjustment type
  IF p_type NOT IN ('PAID_VOTE', 'BONUS', 'PENALTY', 'CORRECTION', 'ADMIN_ADD', 'ADMIN_REMOVE') THEN
    RAISE EXCEPTION 'Invalid adjustment type: %', p_type;
  END IF;

  -- Validate quantity bounds
  IF p_type != 'CORRECTION' AND p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be a positive integer.';
  END IF;
  IF p_quantity = 0 THEN
    RAISE EXCEPTION 'Quantity cannot be zero.';
  END IF;
  IF ABS(p_quantity) > 10000 THEN
    RAISE EXCEPTION 'Quantity cannot exceed 10000 points per adjustment.';
  END IF;

  -- Strict Check 2: Lockdown on PAID_VOTE calls
  -- Rejects arbitrary or forged PAID_VOTE calls:
  -- - Only service_role can request PAID_VOTE (authenticated admins are strictly forbidden)
  -- - Reference ID must be a valid payment UUID
  -- - Referenced payment MUST exist in public.payments
  -- - Referenced payment MUST already be in 'paid' status
  -- - Referenced payment MUST match target candidate_id
  -- - Referenced payment MUST match target vote_quantity
  -- - Delegates directly to private.credit_paid_vote (with DB-level idempotency guard)
  IF p_type = 'PAID_VOTE' THEN
    IF v_caller_role != 'service_role' THEN
      RAISE EXCEPTION 'Forbidden: PAID_VOTE transactions can only be recorded via verified payment fulfillment.';
    END IF;

    IF p_reference_id IS NULL OR p_reference_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Forbidden: PAID_VOTE requires a valid payment UUID reference_id.';
    END IF;

    SELECT * INTO v_payment_rec
    FROM public.payments
    WHERE id = p_reference_id::uuid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Forbidden: Referenced payment % does not exist.', p_reference_id;
    END IF;

    IF v_payment_rec.status != 'paid' THEN
      RAISE EXCEPTION 'Forbidden: Referenced payment % is not paid (status: %).', p_reference_id, v_payment_rec.status;
    END IF;

    IF v_payment_rec.candidate_id IS DISTINCT FROM p_candidate_id THEN
      RAISE EXCEPTION 'Forbidden: Candidate mismatch for referenced payment %. Expected %, got %.',
        p_reference_id, v_payment_rec.candidate_id, p_candidate_id;
    END IF;

    IF v_payment_rec.vote_quantity IS DISTINCT FROM p_quantity THEN
      RAISE EXCEPTION 'Forbidden: Quantity mismatch for referenced payment %. Expected %, got %.',
        p_reference_id, v_payment_rec.vote_quantity, p_quantity;
    END IF;

    -- Delegate to private payment crediting function (inaccessible through PostgREST)
    RETURN private.credit_paid_vote(
      p_payment_id := v_payment_rec.id,
      p_candidate_id := p_candidate_id,
      p_quantity := p_quantity,
      p_candidate_type := v_payment_rec.candidate_type
    );
  END IF;

  -- Strict Check 3: For authenticated users, verify auth.uid() against admin_users.
  -- NEVER trust client-supplied p_admin_id or p_admin_email; derive identity from verified session.
  IF v_caller_role = 'authenticated' THEN
    SELECT id, email INTO v_caller_admin_id, v_caller_admin_email
    FROM public.admin_users
    WHERE id = v_caller_uid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Forbidden: User % is not an authorized administrator.', v_caller_uid;
    END IF;
  ELSE
    -- For service_role (backend maintenance/CLI), preserve reference parameters if passed
    v_caller_admin_id := p_admin_id;
    v_caller_admin_email := p_admin_email;
  END IF;

  -- Row-level locking on candidate to prevent race conditions
  SELECT * INTO v_cand FROM public.candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;

  v_prev_score := COALESCE(v_cand.current_score, v_cand.total_votes, 0);

  IF p_type IN ('BONUS', 'ADMIN_ADD') THEN
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
  v_new_score := GREATEST(0, v_raw_score);

  UPDATE public.candidates
  SET
    current_score = v_new_score,
    total_votes = v_new_score,
    bonus_votes = CASE WHEN p_type IN ('BONUS', 'ADMIN_ADD') THEN COALESCE(bonus_votes, 0) + p_quantity
                       WHEN p_type = 'CORRECTION' AND p_quantity > 0 THEN COALESCE(bonus_votes, 0) + p_quantity
                       ELSE COALESCE(bonus_votes, 0) END,
    penalty_points = CASE WHEN p_type IN ('PENALTY', 'ADMIN_REMOVE') THEN COALESCE(penalty_points, 0) + ABS(p_quantity)
                          WHEN p_type = 'CORRECTION' AND p_quantity < 0 THEN COALESCE(penalty_points, 0) + ABS(p_quantity)
                          ELSE COALESCE(penalty_points, 0) END,
    updated_at = now()
  WHERE id = p_candidate_id;

  INSERT INTO public.score_ledger (
    candidate_id, type, quantity, previous_score, new_score, reason, admin_user_id, admin_email, reference_id
  ) VALUES (
    p_candidate_id, p_type, v_signed_qty, v_prev_score, v_new_score, p_reason, v_caller_admin_id, v_caller_admin_email, p_reference_id
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

ALTER FUNCTION public.adjust_candidate_score(uuid, text, int, text, uuid, text, text) OWNER TO postgres;

-- Explicitly revoke all public and anon execution from adjust_candidate_score
REVOKE ALL ON FUNCTION public.adjust_candidate_score(uuid, text, int, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adjust_candidate_score(uuid, text, int, text, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.adjust_candidate_score(uuid, text, int, text, uuid, text, text) TO authenticated, service_role;

-- ----------------------------------------------------
-- 5. HARDEN confirm_stripe_payment WITH IDENTITY & PAYMENTINTENT VERIFICATION
-- ----------------------------------------------------
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
  v_payment record;
  v_score_res jsonb;
  v_caller_role text := COALESCE(auth.role(), 'none');
BEGIN
  -- Strict Check 1: confirm_stripe_payment can ONLY be executed by service_role
  IF v_caller_role != 'service_role' THEN
    RAISE EXCEPTION 'Forbidden: confirm_stripe_payment can only be executed by service_role.';
  END IF;

  -- 1. Lock payment row to prevent concurrent processing and fetch authoritative record
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id;
  END IF;

  -- 2. AUTHORITATIVE PAYMENT IDENTITY CONSISTENCY:
  -- Verify RPC arguments strictly match the authoritative payment record in PostgreSQL.
  -- These checks run for ALL invocations before checking status.
  IF v_payment.candidate_id IS DISTINCT FROM p_candidate_id THEN
    RAISE EXCEPTION 'Payment integrity mismatch: candidate_id does not match payment record.';
  END IF;

  IF v_payment.vote_quantity IS DISTINCT FROM p_vote_quantity THEN
    RAISE EXCEPTION 'Payment integrity mismatch: vote_quantity does not match payment record.';
  END IF;

  IF v_payment.candidate_type IS DISTINCT FROM p_candidate_type THEN
    RAISE EXCEPTION 'Payment integrity mismatch: candidate_type does not match payment record.';
  END IF;

  IF v_payment.vote_price IS DISTINCT FROM p_vote_price THEN
    RAISE EXCEPTION 'Payment integrity mismatch: vote_price does not match payment record.';
  END IF;

  IF v_payment.amount IS DISTINCT FROM (p_vote_quantity * p_vote_price) THEN
    RAISE EXCEPTION 'Payment integrity mismatch: total amount does not equal quantity * unit price.';
  END IF;

  -- 3. IDEMPOTENCY CHECK WITH PAYMENTINTENT VERIFICATION:
  -- If payment is already paid, verify Stripe PaymentIntent consistency before returning success.
  IF v_payment.status = 'paid' THEN
    IF v_payment.stripe_payment_intent_id IS NOT NULL
       AND p_stripe_payment_intent_id IS NOT NULL
       AND v_payment.stripe_payment_intent_id IS DISTINCT FROM p_stripe_payment_intent_id THEN
      RAISE EXCEPTION 'Payment integrity mismatch: Stripe PaymentIntent % does not match recorded PaymentIntent %.',
        p_stripe_payment_intent_id, v_payment.stripe_payment_intent_id;
    END IF;

    -- Backfill stripe_payment_intent_id if it was not previously recorded
    IF v_payment.stripe_payment_intent_id IS NULL AND p_stripe_payment_intent_id IS NOT NULL THEN
      UPDATE public.payments
      SET stripe_payment_intent_id = p_stripe_payment_intent_id
      WHERE id = p_payment_id;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'payment_id', p_payment_id,
      'candidate_id', v_payment.candidate_id,
      'vote_quantity', v_payment.vote_quantity,
      'stripe_payment_intent_id', COALESCE(v_payment.stripe_payment_intent_id, p_stripe_payment_intent_id),
      'message', 'Payment already processed and credited.'
    );
  END IF;

  IF v_payment.status != 'pending' THEN
    RAISE EXCEPTION 'Payment % is in status %, expected pending', p_payment_id, v_payment.status;
  END IF;

  -- 4. Transition payment status to paid with Stripe payment intent ID
  UPDATE public.payments
  SET
    status = 'paid',
    stripe_payment_intent_id = p_stripe_payment_intent_id
  WHERE id = p_payment_id;

  -- 5. Insert vote record (unique index votes_payment_id_unique ensures idempotency)
  INSERT INTO public.votes (
    candidate_id,
    payment_id,
    quantity
  ) VALUES (
    v_payment.candidate_id,
    v_payment.id,
    v_payment.vote_quantity
  )
  ON CONFLICT (payment_id) DO NOTHING;

  -- 6. Atomically credit candidate score via private crediting function
  -- Inaccessible through PostgREST
  v_score_res := private.credit_paid_vote(
    p_payment_id := v_payment.id,
    p_candidate_id := v_payment.candidate_id,
    p_quantity := v_payment.vote_quantity,
    p_candidate_type := v_payment.candidate_type
  );

  RETURN jsonb_build_object(
    'success', true,
    'already_processed', false,
    'payment_id', v_payment.id,
    'candidate_id', v_payment.candidate_id,
    'vote_quantity', v_payment.vote_quantity,
    'score_result', v_score_res
  );
END;
$$;

ALTER FUNCTION public.confirm_stripe_payment(uuid, text, uuid, int, text, int) OWNER TO postgres;

-- Strictly isolate confirm_stripe_payment to service_role only
REVOKE ALL ON FUNCTION public.confirm_stripe_payment(uuid, text, uuid, int, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_stripe_payment(uuid, text, uuid, int, text, int) FROM anon;
REVOKE ALL ON FUNCTION public.confirm_stripe_payment(uuid, text, uuid, int, text, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_stripe_payment(uuid, text, uuid, int, text, int) TO service_role;
