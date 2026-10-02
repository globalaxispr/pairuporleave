-- ====================================================
-- Migration: 09_admin_give_points_hardening.sql
-- ADMIN GIVE POINTS & SCORE ADJUSTMENT HARDENING
--
-- 1. Makes reason column OPTIONAL (nullable) in score_ledger.
-- 2. Updates adjust_candidate_score function:
--    - p_reason is now optional (DEFAULT NULL)
--    - Accepts 'ADMIN_ADD' and 'ADMIN_REMOVE' as aliases
--    - Enforces admin authorization check when called by authenticated role
--    - Verifies candidate existence and locks row with FOR UPDATE
-- 3. Grants EXECUTE to both authenticated and service_role.
-- ====================================================

-- 1. Make reason column optional in score_ledger
ALTER TABLE public.score_ledger ALTER COLUMN reason DROP NOT NULL;

-- 2. Update atomic stored procedure adjust_candidate_score
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
  v_norm_type text := p_type;
BEGIN
  -- Normalize adjustment type aliases:
  -- ADMIN_ADD -> BONUS, ADMIN_REMOVE -> PENALTY
  IF v_norm_type = 'ADMIN_ADD' THEN
    v_norm_type := 'BONUS';
  ELSIF v_norm_type = 'ADMIN_REMOVE' THEN
    v_norm_type := 'PENALTY';
  END IF;

  -- 1. Validate normalized type
  IF v_norm_type NOT IN ('PAID_VOTE', 'BONUS', 'PENALTY', 'CORRECTION') THEN
    RAISE EXCEPTION 'Invalid adjustment type: %', p_type;
  END IF;

  -- 2. Validate quantity
  IF v_norm_type != 'CORRECTION' AND p_quantity <= 0 THEN
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

    -- Automatically associate the authenticated admin user if not provided
    IF v_caller_admin_id IS NULL THEN
      v_caller_admin_id := auth.uid();
    END IF;
    IF v_caller_admin_email IS NULL THEN
      SELECT email INTO v_caller_admin_email FROM public.admin_users WHERE id = auth.uid();
    END IF;
  END IF;

  -- 4. Lock candidate row for atomic update (prevents race conditions)
  SELECT * INTO v_cand FROM public.candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;

  v_prev_score := COALESCE(v_cand.current_score, v_cand.total_votes, 0);

  -- 5. Calculate delta and signed quantity
  IF v_norm_type = 'BONUS' THEN
    v_signed_qty := p_quantity;
    v_delta := p_quantity;
  ELSIF v_norm_type = 'PENALTY' THEN
    v_signed_qty := -ABS(p_quantity);
    v_delta := -ABS(p_quantity);
  ELSIF v_norm_type = 'PAID_VOTE' THEN
    v_signed_qty := p_quantity;
    v_delta := p_quantity;
  ELSE -- CORRECTION
    v_signed_qty := p_quantity;
    v_delta := p_quantity;
  END IF;

  v_raw_score := v_prev_score + v_delta;
  v_new_score := GREATEST(0, v_raw_score); -- Floor score at zero

  -- 6. Atomically update candidate
  UPDATE public.candidates
  SET
    current_score = v_new_score,
    total_votes = v_new_score,
    paid_votes = CASE WHEN v_norm_type = 'PAID_VOTE' THEN COALESCE(paid_votes, 0) + p_quantity ELSE COALESCE(paid_votes, 0) END,
    bonus_votes = CASE WHEN v_norm_type = 'BONUS' THEN COALESCE(bonus_votes, 0) + p_quantity
                       WHEN v_norm_type = 'CORRECTION' AND p_quantity > 0 THEN COALESCE(bonus_votes, 0) + p_quantity
                       ELSE COALESCE(bonus_votes, 0) END,
    penalty_points = CASE WHEN v_norm_type = 'PENALTY' THEN COALESCE(penalty_points, 0) + ABS(p_quantity)
                          WHEN v_norm_type = 'CORRECTION' AND p_quantity < 0 THEN COALESCE(penalty_points, 0) + ABS(p_quantity)
                          ELSE COALESCE(penalty_points, 0) END,
    updated_at = now()
  WHERE id = p_candidate_id;

  -- 7. Insert immutable ledger entry (reason can be NULL or empty)
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
    v_norm_type,
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

-- 3. Grants: Allow service_role AND authenticated admins to execute
REVOKE ALL ON FUNCTION public.adjust_candidate_score(uuid, text, int, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adjust_candidate_score(uuid, text, int, text, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.adjust_candidate_score(uuid, text, int, text, uuid, text, text) TO authenticated, service_role;

-- Confirm successful application
DO $$
BEGIN
  RAISE NOTICE 'Migration 09 applied: reason is now optional, adjust_candidate_score hardened for Give Points.';
END $$;
