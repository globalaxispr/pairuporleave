-- ====================================================
-- Migration: 17_secure_competition_schedule_rls.sql
-- Security Hardening: Restrict competition_schedule modification
-- strictly to verified administrators in public.admin_users.
--
-- DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT AUTHORIZATION.
-- ====================================================

-- 1. Ensure RLS is active
ALTER TABLE public.competition_schedule ENABLE ROW LEVEL SECURITY;

-- 2. Drop overly permissive authenticated policy
DROP POLICY IF EXISTS "Admins can update competition schedule" ON public.competition_schedule;

-- 3. Create strict admin-only modification policy using the project's standard auth model
CREATE POLICY "Admins can update competition schedule"
  ON public.competition_schedule
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.id = auth.uid()
    )
  );

-- 4. Preserve public read access for countdown and schedule inspection
DROP POLICY IF EXISTS "Public can view active competition schedule" ON public.competition_schedule;
DROP POLICY IF EXISTS "Public can view competition schedule" ON public.competition_schedule;

CREATE POLICY "Public can view competition schedule"
  ON public.competition_schedule
  FOR SELECT
  TO anon, authenticated
  USING (true);

