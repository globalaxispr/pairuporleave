-- ====================================================
-- Down Migration: 17_secure_competition_schedule_rls_down.sql
-- Reverts competition_schedule RLS to the previous state.
-- ====================================================

DROP POLICY IF EXISTS "Admins can update competition schedule" ON public.competition_schedule;

CREATE POLICY "Admins can update competition schedule"
  ON public.competition_schedule
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

