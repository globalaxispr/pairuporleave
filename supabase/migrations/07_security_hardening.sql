-- ====================================================
-- Migration: 07_security_hardening.sql
-- Security hardening applied after full audit.
-- Safe, non-destructive, idempotent.
-- ====================================================

-- ====================================================
-- FIX 1: admin_users RLS — avoid recursive self-reference
-- The policy in 00_full_idempotent_schema.sql uses:
--   EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid())
-- This is recursive and can cause issues in some Postgres versions.
-- 02_rls.sql uses the safer: id = auth.uid()
-- Ensure the simpler non-recursive form is active.
-- ====================================================
DROP POLICY IF EXISTS "Admins can read admin_users" ON public.admin_users;
CREATE POLICY "Admins can read own admin_users record"
  ON public.admin_users FOR SELECT
  USING (id = auth.uid());

-- ====================================================
-- FIX 2: Set explicit search_path on SECURITY DEFINER functions
-- Without this, a user with CREATE privilege on a schema
-- could shadow system functions via search_path injection.
-- ====================================================
CREATE OR REPLACE FUNCTION public.adjust_candidate_score(
  p_candidate_id uuid,
  p_type text,
  p_quantity int,
  p_reason text,
  p_admin_id uuid DEFAULT NULL,
  p_admin_email text DEFAULT NULL,
  p_reference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp   -- Explicit search_path prevents path injection
AS $$
DECLARE
  v_cand record;
  v_prev_score bigint;
  v_delta bigint;
  v_raw_score bigint;
  v_new_score bigint;
  v_ledger_id uuid;
  v_signed_qty int;
BEGIN
  -- 1. Validate type
  IF p_type NOT IN ('PAID_VOTE', 'BONUS', 'PENALTY', 'CORRECTION') THEN
    RAISE EXCEPTION 'Invalid adjustment type: %', p_type;
  END IF;

  -- 2. Validate quantity
  IF p_type != 'CORRECTION' AND p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be a positive integer.';
  END IF;
  IF p_quantity = 0 THEN
    RAISE EXCEPTION 'Quantity cannot be zero.';
  END IF;

  -- 3. Validate reason
  IF length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required and must be at least 3 characters.';
  END IF;

  -- 4. Lock candidate row for atomic update (prevents race conditions)
  SELECT * INTO v_cand FROM public.candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;

  v_prev_score := COALESCE(v_cand.current_score, v_cand.total_votes, 0);

  -- 5. Calculate delta and signed quantity
  IF p_type = 'BONUS' THEN
    v_signed_qty := p_quantity;
    v_delta := p_quantity;
  ELSIF p_type = 'PENALTY' THEN
    v_signed_qty := -ABS(p_quantity);
    v_delta := -ABS(p_quantity);
  ELSIF p_type = 'PAID_VOTE' THEN
    v_signed_qty := p_quantity;
    v_delta := p_quantity;
  ELSE -- CORRECTION
    v_signed_qty := p_quantity;
    v_delta := p_quantity;
  END IF;

  v_raw_score := v_prev_score + v_delta;
  v_new_score := GREATEST(0, v_raw_score); -- Score never goes below zero

  -- 6. Atomically update candidate
  UPDATE public.candidates
  SET
    current_score = v_new_score,
    total_votes = v_new_score,
    paid_votes = CASE WHEN p_type = 'PAID_VOTE' THEN COALESCE(paid_votes, 0) + p_quantity ELSE COALESCE(paid_votes, 0) END,
    bonus_votes = CASE WHEN p_type = 'BONUS' THEN COALESCE(bonus_votes, 0) + p_quantity
                       WHEN p_type = 'CORRECTION' AND p_quantity > 0 THEN COALESCE(bonus_votes, 0) + p_quantity
                       ELSE COALESCE(bonus_votes, 0) END,
    penalty_points = CASE WHEN p_type = 'PENALTY' THEN COALESCE(penalty_points, 0) + ABS(p_quantity)
                          WHEN p_type = 'CORRECTION' AND p_quantity < 0 THEN COALESCE(penalty_points, 0) + ABS(p_quantity)
                          ELSE COALESCE(penalty_points, 0) END,
    updated_at = now()
  WHERE id = p_candidate_id;

  -- 7. Insert immutable ledger entry
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
    p_admin_id,
    p_admin_email,
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

-- Maintain grant (SECURITY DEFINER functions lose grants on replace)
REVOKE ALL ON FUNCTION public.adjust_candidate_score(uuid, text, int, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_candidate_score(uuid, text, int, text, uuid, text, text) TO service_role;

-- ====================================================
-- FIX 3: set_updated_at trigger function — add search_path
-- ====================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp;

-- ====================================================
-- FIX 4: prevent_score_ledger_mutation — add search_path
-- ====================================================
CREATE OR REPLACE FUNCTION public.prevent_score_ledger_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Score ledger transactions are immutable historical records and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp;

-- ====================================================
-- FIX 5: increment_candidate_votes — add search_path
-- ====================================================
CREATE OR REPLACE FUNCTION public.increment_candidate_votes(p_candidate_id uuid, p_quantity int)
RETURNS void LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.adjust_candidate_score(p_candidate_id, 'PAID_VOTE', p_quantity, 'Stripe Payment', NULL, NULL, NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.increment_candidate_votes(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_candidate_votes(uuid, int) TO service_role;

-- ====================================================
-- FIX 6: Add stripe_event_id column to payments for
-- strong webhook replay protection.
-- The existing idempotency check (status = 'pending')
-- provides primary protection; this adds defense in depth
-- and supports future event-level deduplication.
-- ====================================================
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS stripe_event_id text;

CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_event_id_unique
  ON public.payments (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

-- ====================================================
-- FIX 7: Ensure candidates RLS allows admin to see ALL
-- candidates (including paused) while public sees only active.
-- The current "Admin can do everything" policy with FOR ALL
-- covers SELECT, but let's verify with explicit policy.
-- ====================================================

-- Drop and recreate to ensure correctness
DROP POLICY IF EXISTS "Admin can do everything with candidates" ON public.candidates;
CREATE POLICY "Admin can do everything with candidates"
  ON public.candidates FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()));

-- ====================================================
-- FIX 8: Verify score_ledger has no INSERT/UPDATE/DELETE
-- policy that could allow public or anon access.
-- Confirm that only service_role (Edge Functions) can INSERT
-- by ensuring no public INSERT policy exists.
-- ====================================================
DROP POLICY IF EXISTS "Public can insert score_ledger" ON public.score_ledger;
DROP POLICY IF EXISTS "Anon can insert score_ledger" ON public.score_ledger;

-- ====================================================
-- FIX 9: Verify payments and votes have no public INSERT.
-- Public cannot insert payments or votes directly.
-- Only Edge Functions (service_role) can.
-- ====================================================
DROP POLICY IF EXISTS "Public can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Public can insert votes" ON public.votes;
DROP POLICY IF EXISTS "Anon can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Anon can insert votes" ON public.votes;

-- ====================================================
-- FIX 10: Ensure vote_quantity upper bound constraint
-- ====================================================
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_vote_quantity_max;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_vote_quantity_max
  CHECK (vote_quantity <= 1000);

ALTER TABLE public.votes
  DROP CONSTRAINT IF EXISTS votes_quantity_max;
ALTER TABLE public.votes
  ADD CONSTRAINT votes_quantity_max
  CHECK (quantity <= 1000);

-- Confirm successful application
DO $$
BEGIN
  RAISE NOTICE 'Security hardening migration 07 applied successfully.';
END;
$$;
