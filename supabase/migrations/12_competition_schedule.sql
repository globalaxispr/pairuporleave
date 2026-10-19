-- ====================================================
-- Migration: 12_competition_schedule.sql
-- Competition Schedule Management & Voting Eligibility
-- Safe, additive, idempotent singleton architecture.
-- ====================================================

-- 1. Create table for competition schedule
CREATE TABLE IF NOT EXISTS public.competition_schedule (
  id text PRIMARY KEY DEFAULT 'active',
  name text NOT NULL DEFAULT 'PAIR UP OR LEAVE — Official Season Voting',
  is_enabled boolean NOT NULL DEFAULT true,
  start_time timestamptz NOT NULL DEFAULT now(),
  end_time timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  timezone text NOT NULL DEFAULT 'America/New_York',
  title text NOT NULL DEFAULT 'Voting Closes In',
  description text DEFAULT 'Every vote counts towards the live rankings. Support your favorite couples and individual candidates before the deadline!',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT valid_competition_times CHECK (end_time > start_time)
);

-- 2. Insert default singleton active competition schedule
INSERT INTO public.competition_schedule (
  id,
  name,
  is_enabled,
  start_time,
  end_time,
  timezone,
  title,
  description
) VALUES (
  'active',
  'PAIR UP OR LEAVE — Official Season Voting',
  true,
  now(),
  now() + interval '14 days',
  'America/New_York',
  'Voting Closes In',
  'Every vote counts towards the live rankings. Support your favorite couples and individual candidates before the deadline!'
) ON CONFLICT (id) DO NOTHING;

-- 3. Auto-update updated_at on modification
CREATE OR REPLACE FUNCTION public.set_competition_schedule_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS competition_schedule_updated_at ON public.competition_schedule;
CREATE TRIGGER competition_schedule_updated_at
  BEFORE UPDATE ON public.competition_schedule
  FOR EACH ROW EXECUTE FUNCTION public.set_competition_schedule_updated_at();

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.competition_schedule ENABLE ROW LEVEL SECURITY;

-- 5. Public read policy: Anyone can inspect active schedule and timer
DROP POLICY IF EXISTS "Public can view active competition schedule" ON public.competition_schedule;
CREATE POLICY "Public can view active competition schedule"
  ON public.competition_schedule FOR SELECT
  USING (true);

-- 6. Admin modification policy: Only authenticated admins in admin_users can update
DROP POLICY IF EXISTS "Admins can update competition schedule" ON public.competition_schedule;
CREATE POLICY "Admins can update competition schedule"
  ON public.competition_schedule FOR ALL
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

-- 7. Add to Supabase Realtime publication for instant countdown/schedule synchronization
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'competition_schedule'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.competition_schedule;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'Migration 12_competition_schedule applied successfully.';
END;
$$;
