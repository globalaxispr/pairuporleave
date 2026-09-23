-- ====================================================
-- VotePulse Database Schema
-- Run this in your Supabase SQL Editor
-- ====================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ====================================================
-- CANDIDATES TABLE
-- ====================================================
CREATE TABLE IF NOT EXISTS candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  category text NOT NULL,
  position text NOT NULL,
  description text,
  biography text,
  vision text,
  photo_url text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused')),
  total_votes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER candidates_updated_at
  BEFORE UPDATE ON candidates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ====================================================
-- PAYMENTS TABLE
-- ====================================================
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_session_id text UNIQUE NOT NULL,
  stripe_payment_intent_id text,
  candidate_id uuid REFERENCES candidates(id) ON DELETE SET NULL,
  vote_quantity int NOT NULL CHECK (vote_quantity >= 1),
  amount int NOT NULL CHECK (amount > 0),  -- in cents
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for idempotency check
CREATE INDEX IF NOT EXISTS payments_stripe_session_idx
  ON payments (stripe_session_id);

-- ====================================================
-- VOTES TABLE
-- ====================================================
CREATE TABLE IF NOT EXISTS votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES candidates(id) ON DELETE CASCADE NOT NULL,
  payment_id uuid REFERENCES payments(id) ON DELETE CASCADE NOT NULL,
  quantity int NOT NULL CHECK (quantity >= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure one vote record per payment (idempotency at DB level)
CREATE UNIQUE INDEX IF NOT EXISTS votes_payment_id_unique
  ON votes (payment_id);

-- ====================================================
-- ADMIN USERS TABLE
-- ====================================================
CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ====================================================
-- SECURE FUNCTION: Increment candidate votes
-- Called only by the service role (Edge Functions)
-- Regular users cannot call this directly via RLS
-- ====================================================
CREATE OR REPLACE FUNCTION increment_candidate_votes(
  p_candidate_id uuid,
  p_quantity int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER  -- runs as function owner (service role)
AS $$
BEGIN
  UPDATE candidates
  SET total_votes = total_votes + p_quantity
  WHERE id = p_candidate_id;
END;
$$;

-- Revoke public access to this function
REVOKE ALL ON FUNCTION increment_candidate_votes(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_candidate_votes(uuid, int) TO service_role;
