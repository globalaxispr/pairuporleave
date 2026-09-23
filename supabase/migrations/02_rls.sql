-- ====================================================
-- VotePulse Row Level Security Policies
-- Run AFTER 01_schema.sql
-- ====================================================

-- ====================================================
-- CANDIDATES
-- ====================================================
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

-- Public: read active candidates only
CREATE POLICY "Public can view active candidates"
  ON candidates FOR SELECT
  USING (status = 'active');

-- Admin: full access
CREATE POLICY "Admin can do everything with candidates"
  ON candidates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
    )
  );

-- Service role: bypass RLS entirely (for Edge Functions)
-- This is automatic for the service_role in Supabase


-- ====================================================
-- PAYMENTS
-- ====================================================
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Public: NO access
-- Only Edge Functions (service role) can insert/update
-- Admin: read all
CREATE POLICY "Admin can view all payments"
  ON payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
    )
  );


-- ====================================================
-- VOTES
-- ====================================================
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- Public: NO access
-- Only Edge Functions (service role) can insert
-- Admin: read all
CREATE POLICY "Admin can view all votes"
  ON votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
    )
  );


-- ====================================================
-- ADMIN USERS
-- ====================================================
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Admin users can read their own record
CREATE POLICY "Admins can read admin_users"
  ON admin_users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.id = auth.uid()
    )
  );


-- ====================================================
-- STORAGE: candidates bucket
-- ====================================================
-- Run this in the Supabase Dashboard → Storage → New bucket
-- Or via SQL:

INSERT INTO storage.buckets (id, name, public)
VALUES ('candidates', 'candidates', true)
ON CONFLICT DO NOTHING;

-- Allow public to read candidate photos
CREATE POLICY "Public can read candidate photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'candidates');

-- Allow admins to upload candidate photos
CREATE POLICY "Admins can upload candidate photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'candidates'
    AND EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
    )
  );

CREATE POLICY "Admins can update candidate photos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'candidates'
    AND EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
    )
  );

CREATE POLICY "Admins can delete candidate photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'candidates'
    AND EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
    )
  );


-- ====================================================
-- ENABLE REALTIME
-- ====================================================
-- Enable realtime for the candidates table so vote count
-- updates are pushed to subscribing clients.
ALTER PUBLICATION supabase_realtime ADD TABLE candidates;
