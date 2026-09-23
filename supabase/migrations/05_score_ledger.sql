-- ====================================================
-- Migration: 05_score_ledger.sql
-- Add support for Bonus/Gift Votes, Penalties, Score Ledger,
-- and Transparent Score Calculation.
-- ====================================================

-- 1. Extend CANDIDATES table with score breakdown fields
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS paid_votes bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_votes bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalty_points bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_score bigint NOT NULL DEFAULT 0;

-- Backfill existing rows (initialize paid_votes and current_score with total_votes)
UPDATE candidates
SET
  paid_votes = total_votes,
  bonus_votes = 0,
  penalty_points = 0,
  current_score = total_votes
WHERE current_score = 0 AND total_votes > 0;

-- Index current_score for fast ranking order
CREATE INDEX IF NOT EXISTS candidates_current_score_idx ON candidates (current_score DESC);

-- ====================================================
-- 2. SCORE LEDGER TABLE
-- Every score change creates an immutable transaction
-- ====================================================
CREATE TABLE IF NOT EXISTS score_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES candidates(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('PAID_VOTE', 'BONUS', 'PENALTY', 'CORRECTION')),
  quantity int NOT NULL, -- positive for PAID_VOTE/BONUS, negative for PENALTY, signed for CORRECTION
  previous_score bigint NOT NULL,
  new_score bigint NOT NULL,
  reason text NOT NULL,
  admin_user_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  admin_email text,
  reference_id text, -- payment_id for PAID_VOTE, or original ledger id for CORRECTION
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS score_ledger_candidate_idx ON score_ledger (candidate_id);
CREATE INDEX IF NOT EXISTS score_ledger_type_idx ON score_ledger (type);
CREATE INDEX IF NOT EXISTS score_ledger_created_at_idx ON score_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS score_ledger_admin_idx ON score_ledger (admin_user_id);
CREATE INDEX IF NOT EXISTS score_ledger_ref_idx ON score_ledger (reference_id);

-- ====================================================
-- 3. IMMUTABILITY TRIGGER
-- Transactions must never be edited or deleted once recorded
-- ====================================================
CREATE OR REPLACE FUNCTION prevent_score_ledger_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Score ledger transactions are immutable historical records and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS score_ledger_immutable_trigger ON score_ledger;
CREATE TRIGGER score_ledger_immutable_trigger
  BEFORE UPDATE OR DELETE ON score_ledger
  FOR EACH ROW EXECUTE FUNCTION prevent_score_ledger_mutation();

-- ====================================================
-- 4. ROW LEVEL SECURITY ON SCORE LEDGER
-- Public has NO access. Admin has SELECT only.
-- ====================================================
ALTER TABLE score_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view score_ledger"
  ON score_ledger FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
    )
  );

-- ====================================================
-- 5. ATOMIC STORED PROCEDURE: adjust_candidate_score
-- Guarantees ACID atomicity across score recalculation,
-- candidate row update, and ledger insertion.
-- ====================================================
CREATE OR REPLACE FUNCTION adjust_candidate_score(
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
SECURITY DEFINER -- runs with service_role permissions
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

  -- 4. Lock candidate row for atomic update
  SELECT * INTO v_cand FROM candidates WHERE id = p_candidate_id FOR UPDATE;
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
  v_new_score := GREATEST(0, v_raw_score); -- Capped at zero floor

  -- 6. Atomically update candidate
  UPDATE candidates
  SET
    current_score = v_new_score,
    total_votes = v_new_score, -- keeps legacy queries in sync
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
  INSERT INTO score_ledger (
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

-- Revoke public execution, grant to service_role and authenticated admins
REVOKE ALL ON FUNCTION adjust_candidate_score(uuid, text, int, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION adjust_candidate_score(uuid, text, int, text, uuid, text, text) TO service_role;

-- ====================================================
-- 6. UPDATE increment_candidate_votes FOR BACKWARD COMPATIBILITY
-- When legacy or webhook calls increment_candidate_votes,
-- it routes through adjust_candidate_score to record PAID_VOTE.
-- ====================================================
CREATE OR REPLACE FUNCTION increment_candidate_votes(
  p_candidate_id uuid,
  p_quantity int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM adjust_candidate_score(
    p_candidate_id,
    'PAID_VOTE',
    p_quantity,
    'Stripe Payment',
    NULL,
    NULL,
    NULL
  );
END;
$$;
