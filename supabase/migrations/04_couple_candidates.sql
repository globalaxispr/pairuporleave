-- ====================================================
-- Migration: 04_couple_candidates.sql
-- Add support for Couple Candidates (two people together)
-- and candidate-type-specific pricing.
-- ====================================================

-- 1. Extend CANDIDATES table
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS candidate_type text NOT NULL DEFAULT 'individual'
    CHECK (candidate_type IN ('individual', 'couple')),
  ADD COLUMN IF NOT EXISTS person_one_name text,
  ADD COLUMN IF NOT EXISTS person_two_name text,
  ADD COLUMN IF NOT EXISTS person_one_photo_url text,
  ADD COLUMN IF NOT EXISTS person_two_photo_url text,
  ADD COLUMN IF NOT EXISTS display_name text;

-- Index candidate_type for fast filtering
CREATE INDEX IF NOT EXISTS candidates_type_idx ON candidates (candidate_type);

-- 2. Extend PAYMENTS table to record transaction pricing details
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS candidate_type text NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS vote_price int NOT NULL DEFAULT 100; -- in cents (100 for individual, 200 for couple)

CREATE INDEX IF NOT EXISTS payments_candidate_type_idx ON payments (candidate_type);
