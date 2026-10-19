-- ====================================================
-- Migration: 11_auto_open_video_overlay.sql
-- Add auto_open_overlay column to live_show_settings
-- Safe, additive, idempotent.
-- ====================================================

ALTER TABLE public.live_show_settings
  ADD COLUMN IF NOT EXISTS auto_open_overlay boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.live_show_settings.auto_open_overlay IS
  'When true, visitors arriving on the website automatically see the configured YouTube video in a premium overlay modal.';

DO $$
BEGIN
  RAISE NOTICE 'Migration 11_auto_open_video_overlay applied successfully.';
END;
$$;
