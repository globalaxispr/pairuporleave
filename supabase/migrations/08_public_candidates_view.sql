-- ====================================================
-- Migration: 08_public_candidates_view.sql
-- PRIVACY & SECURITY: Create a public-safe view of candidates
-- that exposes ONLY the fields required for the public UI.
-- Internal fields (paid_votes, bonus_votes, penalty_points,
-- score_ledger data, admin info) are NEVER exposed to public.
-- ====================================================

-- ====================================================
-- 1. PUBLIC CANDIDATES VIEW
-- Only these columns are ever returned to the public:
--   id, name, slug, category, position, description,
--   biography, vision, photo_url, status, current_score,
--   candidate_type, person_one_name, person_two_name,
--   person_one_photo_url, person_two_photo_url,
--   display_name, created_at, updated_at
--
-- Intentionally EXCLUDED from public view:
--   paid_votes, bonus_votes, penalty_points, total_votes
-- ====================================================
CREATE OR REPLACE VIEW public.public_candidates AS
  SELECT
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
  FROM public.candidates
  WHERE status = 'active';

-- ====================================================
-- 2. GRANT: public (anon) can SELECT from the view only.
-- ====================================================
GRANT SELECT ON public.public_candidates TO anon, authenticated;

-- ====================================================
-- 3. SECURITY: Revoke direct anon SELECT on the base table.
--    anon must use the view. Authenticated admins still go
--    through RLS policies on the underlying candidates table.
-- ====================================================
REVOKE SELECT ON public.candidates FROM anon;

-- ====================================================
-- 4. ENSURE score_ledger, payments, votes, admin_users
--    have NO SELECT grant for anon. Defense-in-depth on
--    top of the existing RLS policies.
-- ====================================================
REVOKE ALL ON public.score_ledger FROM anon;
REVOKE ALL ON public.payments     FROM anon;
REVOKE ALL ON public.votes        FROM anon;
REVOKE ALL ON public.admin_users  FROM anon;

-- ====================================================
-- 5. REALTIME: Update the supabase_realtime publication
--    to broadcast ONLY the public columns for the
--    candidates table. Requires Postgres 15+ (Supabase).
--    This prevents paid_votes, bonus_votes, penalty_points
--    from appearing in realtime payloads to subscribers.
-- ====================================================
DO $$
BEGIN
  -- Drop and re-add with column filtering
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'candidates'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.candidates;
  END IF;

  ALTER PUBLICATION supabase_realtime ADD TABLE public.candidates (
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
  );
END $$;

-- Confirm successful application
DO $$
BEGIN
  RAISE NOTICE 'Migration 08_public_candidates_view applied: public_candidates view created, private columns protected.';
END $$;
