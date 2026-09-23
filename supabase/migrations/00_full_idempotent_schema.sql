-- ====================================================
-- PAIR UP OR LEAVE: FULL IDEMPOTENT PRODUCTION SCHEMA
-- Safe, non-destructive, and idempotent.
-- Compatible with fresh setups and existing databases.
-- ====================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. CANDIDATES TABLE
CREATE TABLE IF NOT EXISTS public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  category text NOT NULL,
  position text NOT NULL,
  description text,
  biography text,
  vision text,
  photo_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  total_votes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure couple & score columns exist on candidates
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS candidate_type text NOT NULL DEFAULT 'individual' CHECK (candidate_type IN ('individual', 'couple')),
  ADD COLUMN IF NOT EXISTS person_one_name text,
  ADD COLUMN IF NOT EXISTS person_two_name text,
  ADD COLUMN IF NOT EXISTS person_one_photo_url text,
  ADD COLUMN IF NOT EXISTS person_two_photo_url text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS paid_votes bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_votes bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalty_points bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_score bigint NOT NULL DEFAULT 0;

-- Backfill score fields if legacy rows exist
UPDATE public.candidates
SET paid_votes = total_votes, current_score = total_votes
WHERE current_score = 0 AND total_votes > 0;

-- Indexes on candidates
CREATE INDEX IF NOT EXISTS candidates_type_idx ON public.candidates (candidate_type);
CREATE INDEX IF NOT EXISTS candidates_current_score_idx ON public.candidates (current_score DESC);

-- Trigger: auto updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS candidates_updated_at ON public.candidates;
CREATE TRIGGER candidates_updated_at
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_session_id text UNIQUE NOT NULL,
  stripe_payment_intent_id text,
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
  vote_quantity int NOT NULL CHECK (vote_quantity >= 1),
  amount int NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS candidate_type text NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS vote_price int NOT NULL DEFAULT 100;

CREATE INDEX IF NOT EXISTS payments_stripe_session_idx ON public.payments (stripe_session_id);
CREATE INDEX IF NOT EXISTS payments_candidate_type_idx ON public.payments (candidate_type);

-- 4. VOTES TABLE
CREATE TABLE IF NOT EXISTS public.votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE CASCADE NOT NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE CASCADE NOT NULL,
  quantity int NOT NULL CHECK (quantity >= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS votes_payment_id_unique ON public.votes (payment_id);

-- 5. ADMIN USERS TABLE
CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. SCORE LEDGER TABLE
CREATE TABLE IF NOT EXISTS public.score_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('PAID_VOTE', 'BONUS', 'PENALTY', 'CORRECTION')),
  quantity int NOT NULL,
  previous_score bigint NOT NULL,
  new_score bigint NOT NULL,
  reason text NOT NULL,
  admin_user_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  admin_email text,
  reference_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS score_ledger_candidate_idx ON public.score_ledger (candidate_id);
CREATE INDEX IF NOT EXISTS score_ledger_type_idx ON public.score_ledger (type);
CREATE INDEX IF NOT EXISTS score_ledger_created_at_idx ON public.score_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS score_ledger_admin_idx ON public.score_ledger (admin_user_id);
CREATE INDEX IF NOT EXISTS score_ledger_ref_idx ON public.score_ledger (reference_id);

-- Trigger: Immutable score_ledger
CREATE OR REPLACE FUNCTION prevent_score_ledger_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Score ledger transactions are immutable historical records and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS score_ledger_immutable_trigger ON public.score_ledger;
CREATE TRIGGER score_ledger_immutable_trigger
  BEFORE UPDATE OR DELETE ON public.score_ledger
  FOR EACH ROW EXECUTE FUNCTION prevent_score_ledger_mutation();

-- 7. ATOMIC STORED PROCEDURE: adjust_candidate_score
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
  IF p_type NOT IN ('PAID_VOTE', 'BONUS', 'PENALTY', 'CORRECTION') THEN
    RAISE EXCEPTION 'Invalid adjustment type: %', p_type;
  END IF;

  IF p_type != 'CORRECTION' AND p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be a positive integer.';
  END IF;
  IF p_quantity = 0 THEN
    RAISE EXCEPTION 'Quantity cannot be zero.';
  END IF;

  IF length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required and must be at least 3 characters.';
  END IF;

  SELECT * INTO v_cand FROM public.candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found.';
  END IF;

  v_prev_score := COALESCE(v_cand.current_score, v_cand.total_votes, 0);

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
  v_new_score := GREATEST(0, v_raw_score);

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

  INSERT INTO public.score_ledger (
    candidate_id, type, quantity, previous_score, new_score, reason, admin_user_id, admin_email, reference_id
  ) VALUES (
    p_candidate_id, p_type, v_signed_qty, v_prev_score, v_new_score, p_reason, p_admin_id, p_admin_email, p_reference_id
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

REVOKE ALL ON FUNCTION public.adjust_candidate_score(uuid, text, int, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_candidate_score(uuid, text, int, text, uuid, text, text) TO service_role;

-- Backward compatibility wrapper
CREATE OR REPLACE FUNCTION public.increment_candidate_votes(p_candidate_id uuid, p_quantity int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM public.adjust_candidate_score(p_candidate_id, 'PAID_VOTE', p_quantity, 'Stripe Payment', NULL, NULL, NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.increment_candidate_votes(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_candidate_votes(uuid, int) TO service_role;

-- 8. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_ledger ENABLE ROW LEVEL SECURITY;

-- Candidates policies
DROP POLICY IF EXISTS "Public can view active candidates" ON public.candidates;
CREATE POLICY "Public can view active candidates"
  ON public.candidates FOR SELECT
  USING (status = 'active');

DROP POLICY IF EXISTS "Admin can do everything with candidates" ON public.candidates;
CREATE POLICY "Admin can do everything with candidates"
  ON public.candidates FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()));

-- Payments policies
DROP POLICY IF EXISTS "Admin can view all payments" ON public.payments;
CREATE POLICY "Admin can view all payments"
  ON public.payments FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()));

-- Votes policies
DROP POLICY IF EXISTS "Admin can view all votes" ON public.votes;
CREATE POLICY "Admin can view all votes"
  ON public.votes FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()));

-- Admin users policies
DROP POLICY IF EXISTS "Admins can read admin_users" ON public.admin_users;
CREATE POLICY "Admins can read admin_users"
  ON public.admin_users FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_users au WHERE au.id = auth.uid()));

-- Score ledger policies
DROP POLICY IF EXISTS "Admins can view score_ledger" ON public.score_ledger;
CREATE POLICY "Admins can view score_ledger"
  ON public.score_ledger FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()));

-- 9. STORAGE BUCKET & POLICIES
INSERT INTO storage.buckets (id, name, public)
VALUES ('candidates', 'candidates', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can read candidate photos" ON storage.objects;
CREATE POLICY "Public can read candidate photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'candidates');

DROP POLICY IF EXISTS "Admins can upload candidate photos" ON storage.objects;
CREATE POLICY "Admins can upload candidate photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'candidates' AND EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()));

DROP POLICY IF EXISTS "Admins can update candidate photos" ON storage.objects;
CREATE POLICY "Admins can update candidate photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'candidates' AND EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()));

DROP POLICY IF EXISTS "Admins can delete candidate photos" ON storage.objects;
CREATE POLICY "Admins can delete candidate photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'candidates' AND EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()));

-- 10. REALTIME CONFIGURATION
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'candidates'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.candidates;
  END IF;
END $$;
