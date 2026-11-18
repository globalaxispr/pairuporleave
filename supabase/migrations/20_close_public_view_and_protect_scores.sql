-- ============================================================================
-- Migration: 20_close_public_view_and_protect_scores.sql
-- Urgent Narrowly-Scoped Security Patch:
--   F-01 (CRITICAL): Close auto-updatable view bypass on public.public_candidates
--   F-02 (HIGH):     Protect candidate score columns from direct table writes
--   F-03 (MEDIUM):   Scope admin candidates RLS policy to TO authenticated
--                    and revoke unnecessary anon write grants on public tables.
--
-- Preserves all existing candidate scores, paid votes, bonus votes, penalty
-- points, score_ledger history, Stripe webhook fulfillment, and Admin
-- Give/Remove Points & Candidate Create/Edit workflows.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. F-01: CLOSE public.public_candidates AUTO-UPDATABLE VIEW VULNERABILITY
-- ----------------------------------------------------------------------------
-- Enforce caller permissions and RLS on public_candidates instead of view owner (postgres).
ALTER VIEW public.public_candidates SET (security_invoker = true);

-- Strip all write privileges from PUBLIC, anon, and authenticated on the view.
REVOKE ALL ON TABLE public.public_candidates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_candidates TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. F-01 / F-03: LEAST-PRIVILEGE COLUMN & TABLE GRANTS ON public.candidates
-- ----------------------------------------------------------------------------
-- Grant anon SELECT ONLY on the 19 public columns (excludes paid_votes,
-- bonus_votes, penalty_points, total_votes) so security_invoker = true works
-- for public visitors while RLS enforces status = 'active'.
REVOKE ALL ON TABLE public.candidates FROM PUBLIC, anon;
GRANT SELECT (
  id,
  name,
  slug,
  category,
  position,
  description,
  biography,
  vision,
  photo_url,
  status,
  current_score,
  candidate_type,
  person_one_name,
  person_two_name,
  person_one_photo_url,
  person_two_photo_url,
  display_name,
  created_at,
  updated_at
) ON TABLE public.candidates TO anon;

-- Scope admin RLS policy on candidates strictly to authenticated role
DROP POLICY IF EXISTS "Admin can do everything with candidates" ON public.candidates;
CREATE POLICY "Admin can do everything with candidates"
  ON public.candidates FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()));

-- ----------------------------------------------------------------------------
-- 3. F-02: PROTECT CANDIDATE SCORE COLUMNS (COLUMN PRIVILEGES + TRIGGER)
-- ----------------------------------------------------------------------------
-- Revoke INSERT and UPDATE on score columns from authenticated (including admins)
-- so all score changes must flow through public.adjust_candidate_score RPC.
-- Admins retain INSERT/UPDATE on all profile & status columns.
REVOKE INSERT, UPDATE ON TABLE public.candidates FROM authenticated;

GRANT INSERT (
  id,
  name,
  display_name,
  person_one_name,
  person_two_name,
  person_one_photo_url,
  person_two_photo_url,
  slug,
  category,
  position,
  description,
  biography,
  vision,
  photo_url,
  status,
  candidate_type,
  created_at,
  updated_at
) ON TABLE public.candidates TO authenticated;

GRANT UPDATE (
  name,
  display_name,
  person_one_name,
  person_two_name,
  person_one_photo_url,
  person_two_photo_url,
  slug,
  category,
  position,
  description,
  biography,
  vision,
  photo_url,
  status,
  candidate_type,
  updated_at
) ON TABLE public.candidates TO authenticated;

-- Defense-in-depth trigger: reject direct score-column mutations unless executed
-- by postgres/supabase_admin (such as SECURITY DEFINER adjust_candidate_score).
CREATE OR REPLACE FUNCTION public.protect_candidate_score_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (
    NEW.current_score IS DISTINCT FROM OLD.current_score OR
    NEW.total_votes IS DISTINCT FROM OLD.total_votes OR
    NEW.paid_votes IS DISTINCT FROM OLD.paid_votes OR
    NEW.bonus_votes IS DISTINCT FROM OLD.bonus_votes OR
    NEW.penalty_points IS DISTINCT FROM OLD.penalty_points
  ) THEN
    IF current_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Direct modification of candidate score columns is prohibited. Use adjust_candidate_score RPC.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.protect_candidate_score_columns() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.protect_candidate_score_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_candidate_score ON public.candidates;
CREATE TRIGGER trg_protect_candidate_score
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_candidate_score_columns();

-- ----------------------------------------------------------------------------
-- 4. DEFENSE-IN-DEPTH: REVOKE UNNECESSARY ANON WRITE GRANTS ON PUBLIC TABLES
-- ----------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.competition_schedule FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.competition_schedule TO anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.live_show_settings FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.live_show_settings TO anon;

COMMIT;
