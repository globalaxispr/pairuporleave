-- ============================================================================
-- Rollback Migration: 20_close_public_view_and_protect_scores_down.sql
-- Restores exact pre-patch view options, grants, and policies captured from
-- production read-only preflight on 2026-11-18 without modifying any scores,
-- votes, payments, or ledger records.
-- ============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_protect_candidate_score ON public.candidates;
DROP FUNCTION IF EXISTS public.protect_candidate_score_columns();

-- Restore authenticated full grants on public.candidates
GRANT ALL ON TABLE public.candidates TO authenticated;

-- Restore anon grants on public.candidates (no SELECT, as before)
REVOKE ALL ON TABLE public.candidates FROM anon;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.candidates TO anon;

-- Restore original RLS policy target role on public.candidates
DROP POLICY IF EXISTS "Admin can do everything with candidates" ON public.candidates;
CREATE POLICY "Admin can do everything with candidates"
  ON public.candidates FOR ALL
  TO public
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()));

-- Restore public_candidates view options and grants
ALTER VIEW public.public_candidates RESET (security_invoker);
GRANT ALL ON TABLE public.public_candidates TO anon, authenticated, service_role;

-- Restore anon grants on competition_schedule and live_show_settings
GRANT ALL ON TABLE public.competition_schedule TO anon;
GRANT ALL ON TABLE public.live_show_settings TO anon;

COMMIT;
