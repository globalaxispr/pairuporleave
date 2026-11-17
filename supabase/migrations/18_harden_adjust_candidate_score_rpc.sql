-- ============================================================================
-- Migration: 18_harden_adjust_candidate_score_rpc.sql
-- Production-Compatible Security Patch for public.adjust_candidate_score
--
-- Remediates:
--   1. Vulnerability A (Admin PAID_VOTE Injection):
--      Blocks authenticated administrators from calling p_type = 'PAID_VOTE'.
--      Only service_role (via verified payment fulfillment) can record PAID_VOTE,
--      and the referenced payment MUST exist in public.payments with status = 'paid',
--      valid stripe_session_id, matching candidate_id, matching vote_quantity,
--      and valid subtotal + service_fee + tax = amount accounting.
--   2. Vulnerability B (Audit Identity Spoofing):
--      For authenticated callers, always derives admin_user_id and admin_email
--      strictly from auth.uid() and public.admin_users, ignoring caller-supplied
--      p_admin_id / p_admin_email. For service_role callers passing p_admin_id,
--      verifies against public.admin_users and uses the canonical email.
--   3. Preserves ADMIN_ADD, ADMIN_REMOVE, BONUS, PENALTY, CORRECTION, optional
--      reason fallback, score_ledger_type_check, and idempotent PAID_VOTE guard.
-- ============================================================================

BEGIN;

-- 1. Ensure score_ledger_type_check includes ADMIN_ADD and ADMIN_REMOVE without taking unnecessary table locks if already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.score_ledger'::regclass
      AND conname = 'score_ledger_type_check'
      AND pg_get_constraintdef(oid) LIKE '%ADMIN_ADD%'
      AND pg_get_constraintdef(oid) LIKE '%ADMIN_REMOVE%'
  ) THEN
    ALTER TABLE public.score_ledger DROP CONSTRAINT IF EXISTS score_ledger_type_check;
    ALTER TABLE public.score_ledger ADD CONSTRAINT score_ledger_type_check
      CHECK (type IN ('PAID_VOTE', 'BONUS', 'PENALTY', 'CORRECTION', 'ADMIN_ADD', 'ADMIN_REMOVE'));
  END IF;
END;
$$;

-- 2. Ensure database-level unique index for PAID_VOTE idempotency exists
CREATE UNIQUE INDEX IF NOT EXISTS score_ledger_paid_vote_ref_unique
  ON public.score_ledger (reference_id)
  WHERE type = 'PAID_VOTE' AND reference_id IS NOT NULL;

-- 3. Drop legacy insecure increment_candidate_votes wrapper if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'increment_candidate_votes'
  ) THEN
    REVOKE ALL ON FUNCTION public.increment_candidate_votes(uuid, int) FROM PUBLIC, anon, authenticated, service_role;
    DROP FUNCTION IF EXISTS public.increment_candidate_votes(uuid, int);
  END IF;
END;
$$;

-- 4. Harden default schema privileges against unintended PUBLIC/anon execution grants
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- 5. Replace public.adjust_candidate_score with hardened implementation
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
  v_subtotal int;
  v_service_fee int;
  v_tax int;
  v_effective_reason text;
  v_caller_admin_id uuid := NULL;
  v_caller_admin_email text := NULL;
  v_caller_role text := COALESCE(
    NULLIF(auth.role(), 'none'),
    CASE WHEN current_user IN ('postgres', 'service_role') AND session_user IN ('postgres', 'service_role') THEN 'service_role' ELSE 'none' END
  );
  v_caller_uid uuid := auth.uid();
BEGIN
  -- 1. Strict caller role check: only authenticated admins or service_role
  IF v_caller_role NOT IN ('authenticated', 'service_role') THEN
    RAISE EXCEPTION 'Forbidden: Role % is not authorized to execute adjust_candidate_score.', v_caller_role;
  END IF;

  -- 2. Validate adjustment type
  IF p_type NOT IN ('PAID_VOTE', 'BONUS', 'PENALTY', 'CORRECTION', 'ADMIN_ADD', 'ADMIN_REMOVE') THEN
    RAISE EXCEPTION 'Invalid adjustment type: %', p_type;
  END IF;

  -- 3. Validate quantity bounds
  IF p_type != 'CORRECTION' AND (p_quantity IS NULL OR p_quantity <= 0) THEN
    RAISE EXCEPTION 'Quantity must be a positive integer.';
  END IF;
  IF p_quantity IS NULL OR p_quantity = 0 THEN
    RAISE EXCEPTION 'Quantity cannot be zero.';
  END IF;
  IF ABS(p_quantity) > 10000 THEN
    RAISE EXCEPTION 'Quantity cannot exceed 10000 points per adjustment.';
  END IF;

  -- 4. Lockdown on PAID_VOTE: strictly service_role only + verified paid payment record
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

    IF v_payment_rec.stripe_session_id IS NULL OR btrim(v_payment_rec.stripe_session_id) = '' THEN
      RAISE EXCEPTION 'Forbidden: Referenced payment % is missing stripe_session_id.', p_reference_id;
    END IF;

    IF v_payment_rec.candidate_id IS DISTINCT FROM p_candidate_id THEN
      RAISE EXCEPTION 'Forbidden: Candidate mismatch for referenced payment %. Expected %, got %.',
        p_reference_id, v_payment_rec.candidate_id, p_candidate_id;
    END IF;

    IF v_payment_rec.vote_quantity IS DISTINCT FROM p_quantity THEN
      RAISE EXCEPTION 'Forbidden: Quantity mismatch for referenced payment %. Expected %, got %.',
        p_reference_id, v_payment_rec.vote_quantity, p_quantity;
    END IF;

    -- Verify payment accounting integrity (subtotal + service_fee + tax == amount)
    v_subtotal := COALESCE((to_jsonb(v_payment_rec)->>'subtotal_amount')::int, v_payment_rec.vote_quantity * v_payment_rec.vote_price);
    v_service_fee := COALESCE((to_jsonb(v_payment_rec)->>'service_fee_amount')::int, 0);
    v_tax := COALESCE((to_jsonb(v_payment_rec)->>'tax_amount')::int, 0);

    IF v_subtotal IS DISTINCT FROM (v_payment_rec.vote_quantity * v_payment_rec.vote_price)
       OR v_service_fee < 0
       OR v_tax < 0
       OR v_payment_rec.amount IS DISTINCT FROM (v_subtotal + v_service_fee + v_tax) THEN
      RAISE EXCEPTION 'Forbidden: Referenced payment % failed accounting integrity validation.', p_reference_id;
    END IF;

    -- Idempotency guard for PAID_VOTE (backed by unique index score_ledger_paid_vote_ref_unique)
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
  ELSE
    -- 5. Admin authorization & anti-spoofing: always derive identity from verified session / admin_users
    IF v_caller_role = 'authenticated' THEN
      IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'Forbidden: Missing authenticated user identity.';
      END IF;

      SELECT id, email INTO v_caller_admin_id, v_caller_admin_email
      FROM public.admin_users
      WHERE id = v_caller_uid;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Forbidden: User % is not an authorized administrator.', v_caller_uid;
      END IF;
    ELSE
      -- service_role call (e.g. adjust-candidate-score Edge Function):
      -- If p_admin_id is provided, verify it exists in admin_users and use its canonical email
      IF p_admin_id IS NOT NULL THEN
        SELECT id, email INTO v_caller_admin_id, v_caller_admin_email
        FROM public.admin_users
        WHERE id = p_admin_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Forbidden: Admin user % is not an authorized administrator.', p_admin_id;
        END IF;
      ELSE
        v_caller_admin_id := NULL;
        v_caller_admin_email := p_admin_email;
      END IF;
    END IF;
  END IF;

  -- 6. Ensure non-empty reason (compatible even if score_ledger.reason has NOT NULL constraint)
  v_effective_reason := COALESCE(
    NULLIF(btrim(p_reason), ''),
    CASE
      WHEN p_type = 'PAID_VOTE' THEN 'Stripe Payment'
      WHEN p_type IN ('BONUS', 'ADMIN_ADD') THEN 'Admin manual points addition'
      WHEN p_type IN ('PENALTY', 'ADMIN_REMOVE') THEN 'Admin manual points deduction'
      WHEN p_type = 'CORRECTION' THEN 'Admin manual score correction'
      ELSE 'Score adjustment'
    END
  );

  -- 7. Lock candidate row for atomic update
  SELECT * INTO v_cand FROM public.candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;

  v_prev_score := COALESCE(v_cand.current_score, v_cand.total_votes, 0);

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
  v_new_score := GREATEST(0, v_raw_score);

  -- 8. Atomically update candidate totals (manual adjustments never touch paid_votes)
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

  -- 9. Insert immutable audit ledger entry
  INSERT INTO public.score_ledger (
    candidate_id, type, quantity, previous_score, new_score, reason, admin_user_id, admin_email, reference_id
  ) VALUES (
    p_candidate_id, p_type, v_signed_qty, v_prev_score, v_new_score, v_effective_reason, v_caller_admin_id, v_caller_admin_email, p_reference_id
  ) RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_processed', false,
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

REVOKE ALL ON FUNCTION public.adjust_candidate_score(uuid, text, int, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adjust_candidate_score(uuid, text, int, text, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.adjust_candidate_score(uuid, text, int, text, uuid, text, text) TO authenticated, service_role;

COMMIT;

