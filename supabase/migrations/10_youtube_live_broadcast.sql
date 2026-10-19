-- ====================================================
-- Migration: 10_youtube_live_broadcast.sql
-- Add table and RLS policies for PAIR UP OR LEAVE YouTube Live Show settings.
-- Safe, idempotent, non-destructive.
-- ====================================================

-- 1. Create table for live show broadcast settings
CREATE TABLE IF NOT EXISTS public.live_show_settings (
  id text PRIMARY KEY DEFAULT 'primary',
  is_enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('live', 'scheduled', 'offline')),
  video_id text CHECK (video_id IS NULL OR video_id ~ '^[a-zA-Z0-9_-]{11}$'),
  video_url text,
  title text NOT NULL DEFAULT 'PAIR UP OR LEAVE — Official Live Show',
  description text DEFAULT 'Watch the official PAIR UP OR LEAVE live broadcast. Follow the couples, individual candidates, and live drama as voting unfolds.',
  scheduled_start_time timestamptz,
  channel_url text NOT NULL DEFAULT 'https://youtube.com/@pairuporleave',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2. Insert default singleton row if not already present
INSERT INTO public.live_show_settings (
  id,
  is_enabled,
  status,
  video_id,
  video_url,
  title,
  description,
  channel_url
) VALUES (
  'primary',
  true,
  'offline',
  NULL,
  NULL,
  'PAIR UP OR LEAVE — Official Live Show',
  'Watch the official PAIR UP OR LEAVE live broadcast. Follow the couples, individual candidates, and live drama as voting unfolds.',
  'https://youtube.com/@pairuporleave'
) ON CONFLICT (id) DO NOTHING;

-- 3. Auto-update updated_at on modification
DROP TRIGGER IF EXISTS live_show_settings_updated_at ON public.live_show_settings;
CREATE TRIGGER live_show_settings_updated_at
  BEFORE UPDATE ON public.live_show_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.live_show_settings ENABLE ROW LEVEL SECURITY;

-- 5. Public read policy: Anyone can read published show settings
DROP POLICY IF EXISTS "Public can view live show settings" ON public.live_show_settings;
CREATE POLICY "Public can view live show settings"
  ON public.live_show_settings FOR SELECT
  USING (true);

-- 6. Admin modification policy: Only authenticated admins in admin_users can insert/update
DROP POLICY IF EXISTS "Admins can update live show settings" ON public.live_show_settings;
CREATE POLICY "Admins can update live show settings"
  ON public.live_show_settings FOR ALL
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

-- 7. Enable Supabase Realtime for instant broadcast status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_show_settings;

DO $$
BEGIN
  RAISE NOTICE 'Migration 10_youtube_live_broadcast applied successfully.';
END;
$$;
