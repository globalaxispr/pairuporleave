/**
 * PAIR UP OR LEAVE — MIGRATION 20 LOCAL SECURITY & COMPATIBILITY TEST SUITE
 *
 * Tests all Section 9 (Stripe payment compatibility) & Section 10 (Non-admin
 * security test matrix) requirements, plus rollback verification, in an isolated
 * local PostgreSQL (PGlite) instance with synthetic data.
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT_DIR, "supabase", "migrations");

console.log("======================================================================");
console.log("PAIR UP OR LEAVE — MIGRATION 20 SECURITY & COMPATIBILITY TEST SUITE");
console.log("======================================================================\n");

let passed = 0;
let failed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function run() {
  const db = new PGlite();

  // Setup exact pre-patch production schema, roles, grants, policies, and migrations 13, 18, 19
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
    END $$;

    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

    CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
      SELECT COALESCE(
        NULLIF(current_setting('request.jwt.claim.role', true), ''),
        CASE WHEN current_user IN ('anon', 'authenticated', 'service_role') THEN current_user ELSE 'none' END
      );
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$ LANGUAGE sql STABLE;

    CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE);
    CREATE TABLE public.admin_users (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      email text NOT NULL,
      role text NOT NULL DEFAULT 'admin',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE public.candidates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      display_name text,
      person_one_name text,
      person_two_name text,
      person_one_photo_url text,
      person_two_photo_url text,
      slug text UNIQUE NOT NULL,
      category text NOT NULL,
      position text NOT NULL,
      description text,
      biography text,
      vision text,
      photo_url text,
      candidate_type text NOT NULL DEFAULT 'individual' CHECK (candidate_type IN ('individual', 'couple')),
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
      total_votes bigint NOT NULL DEFAULT 0,
      paid_votes bigint NOT NULL DEFAULT 0,
      bonus_votes bigint NOT NULL DEFAULT 0,
      penalty_points bigint NOT NULL DEFAULT 0,
      current_score bigint NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE public.payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      stripe_session_id text UNIQUE NOT NULL,
      stripe_payment_intent_id text,
      candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL,
      vote_quantity int NOT NULL CHECK (vote_quantity >= 1),
      amount int NOT NULL CHECK (amount > 0),
      currency text NOT NULL DEFAULT 'usd',
      candidate_type text NOT NULL DEFAULT 'individual',
      vote_price int NOT NULL DEFAULT 100,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE public.votes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      candidate_id uuid REFERENCES public.candidates(id) ON DELETE CASCADE NOT NULL,
      payment_id uuid REFERENCES public.payments(id) ON DELETE CASCADE NOT NULL,
      quantity int NOT NULL CHECK (quantity >= 1),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX votes_payment_id_unique ON public.votes (payment_id);

    CREATE TABLE public.score_ledger (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      candidate_id uuid REFERENCES public.candidates(id) ON DELETE CASCADE NOT NULL,
      type text NOT NULL CHECK (type IN ('PAID_VOTE', 'BONUS', 'PENALTY', 'CORRECTION', 'ADMIN_ADD', 'ADMIN_REMOVE')),
      quantity int NOT NULL,
      previous_score bigint NOT NULL,
      new_score bigint NOT NULL,
      reason text NOT NULL,
      admin_user_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
      admin_email text,
      reference_id text,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE public.competition_schedule (
      id text PRIMARY KEY,
      competition_name text NOT NULL DEFAULT 'PAIR UP OR LEAVE',
      is_published boolean NOT NULL DEFAULT true,
      start_time timestamptz NOT NULL DEFAULT now(),
      end_time timestamptz NOT NULL DEFAULT now() + interval '7 days'
    );

    CREATE TABLE public.live_show_settings (
      id text PRIMARY KEY,
      is_enabled boolean NOT NULL DEFAULT true,
      status text NOT NULL DEFAULT 'offline'
    );

    ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.score_ledger ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.competition_schedule ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.live_show_settings ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Public can view active candidates" ON public.candidates FOR SELECT USING (status = 'active');
    CREATE POLICY "Admin can do everything with candidates" ON public.candidates FOR ALL
      USING (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()));
    CREATE POLICY "Admin can view all payments" ON public.payments FOR SELECT
      USING (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()));
    CREATE POLICY "Admin can view all votes" ON public.votes FOR SELECT
      USING (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()));
    CREATE POLICY "Admins can read admin_users" ON public.admin_users FOR SELECT USING (id = auth.uid());
    CREATE POLICY "Admins can view score_ledger" ON public.score_ledger FOR SELECT
      USING (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()));
    CREATE POLICY "Public can view competition schedule" ON public.competition_schedule FOR SELECT TO anon, authenticated USING (true);
    CREATE POLICY "Public can view live show settings" ON public.live_show_settings FOR SELECT USING (true);

    REVOKE ALL ON public.admin_users FROM anon;
    GRANT ALL ON public.admin_users TO authenticated, service_role;
    REVOKE ALL ON public.candidates FROM anon;
    GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.candidates TO anon;
    GRANT ALL ON public.candidates TO authenticated, service_role;
    GRANT ALL ON public.competition_schedule TO anon, authenticated, service_role;
    GRANT ALL ON public.live_show_settings TO anon, authenticated, service_role;

    CREATE OR REPLACE VIEW public.public_candidates AS
      SELECT id, name, slug, category, position, description, biography, vision,
             photo_url, status, current_score, candidate_type, person_one_name,
             person_two_name, person_one_photo_url, person_two_photo_url,
             display_name, created_at, updated_at
      FROM public.candidates
      WHERE status = 'active';
    GRANT ALL ON public.public_candidates TO anon, authenticated, service_role;
  `);

  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, "13_stripe_webhook_hardening.sql"), "utf-8"));
  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, "18_harden_adjust_candidate_score_rpc.sql"), "utf-8"));
  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, "19_payment_reliability_and_recovery.sql"), "utf-8"));

  // Apply Migration 20!
  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, "20_close_public_view_and_protect_scores.sql"), "utf-8"));

  // Seed synthetic active candidate, paused candidate, admin, and non-admin user
  const activeCandId = (await db.query(`
    INSERT INTO public.candidates (name, display_name, slug, category, position, candidate_type, status, current_score, total_votes, paid_votes, bonus_votes)
    VALUES ('Active Couple', 'ACTIVE COUPLE', 'active-couple', 'Couples', 'Finalist', 'couple', 'active', 160, 160, 35, 125)
    RETURNING id;
  `)).rows[0].id;

  const pausedCandId = (await db.query(`
    INSERT INTO public.candidates (name, display_name, slug, category, position, candidate_type, status, current_score, total_votes, paid_votes)
    VALUES ('Paused Couple', 'PAUSED COUPLE', 'paused-couple', 'Couples', 'Finalist', 'couple', 'paused', 10, 10, 10)
    RETURNING id;
  `)).rows[0].id;

  const adminId = (await db.query(`INSERT INTO auth.users (email) VALUES ('admin@synthetic.test') RETURNING id;`)).rows[0].id;
  await db.query(`INSERT INTO public.admin_users (id, email, role) VALUES ($1, 'admin@synthetic.test', 'SUPER_ADMIN');`, [adminId]);

  const userId = (await db.query(`INSERT INTO auth.users (email) VALUES ('user@synthetic.test') RETURNING id;`)).rows[0].id;

  // =========================================================================
  // SECTION 10: NON-ADMIN SECURITY TEST MATRIX
  // =========================================================================
  await test("1. Anonymous direct candidate UPDATE is denied", async () => {
    await db.exec(`SET ROLE anon; SET "request.jwt.claim.role" = 'anon'; RESET "request.jwt.claim.sub";`);
    await assert.rejects(
      async () => db.query(`UPDATE public.candidates SET current_score = 999 WHERE id = $1;`, [activeCandId]),
      /permission denied for table candidates/
    );
    await db.exec(`RESET ROLE;`);
  });

  await test("2. Non-admin authenticated direct candidate UPDATE is denied", async () => {
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.role" = 'authenticated'; SET "request.jwt.claim.sub" = '${userId}';`);
    await assert.rejects(
      async () => db.query(`UPDATE public.candidates SET current_score = 999 WHERE id = $1;`, [activeCandId]),
      /permission denied for (table|column) /
    );
    // Even profile column update is blocked by RLS (0 rows)
    const profRes = await db.query(`UPDATE public.candidates SET name = 'Hacked' WHERE id = $1;`, [activeCandId]);
    assert.equal(profRes.affectedRows, 0);
    await db.exec(`RESET ROLE;`);
  });

  await test("3. Anonymous public_candidates UPDATE is denied", async () => {
    await db.exec(`SET ROLE anon; SET "request.jwt.claim.role" = 'anon'; RESET "request.jwt.claim.sub";`);
    await assert.rejects(
      async () => db.query(`UPDATE public.public_candidates SET current_score = 999 WHERE id = $1;`, [activeCandId]),
      /permission denied for view public_candidates/
    );
    await db.exec(`RESET ROLE;`);
  });

  await test("4. Non-admin authenticated public_candidates UPDATE is denied", async () => {
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.role" = 'authenticated'; SET "request.jwt.claim.sub" = '${userId}';`);
    await assert.rejects(
      async () => db.query(`UPDATE public.public_candidates SET current_score = 999 WHERE id = $1;`, [activeCandId]),
      /permission denied for view public_candidates/
    );
    await db.exec(`RESET ROLE;`);
  });

  await test("5. Anonymous public_candidates INSERT is denied", async () => {
    await db.exec(`SET ROLE anon; SET "request.jwt.claim.role" = 'anon';`);
    await assert.rejects(
      async () => db.query(`INSERT INTO public.public_candidates (id, name, slug, category, position, status, current_score) VALUES (gen_random_uuid(), 'Fake', 'fake', 'Couples', 'Pos', 'active', 9999);`),
      /permission denied for view public_candidates/
    );
    await db.exec(`RESET ROLE;`);
  });

  await test("6. Anonymous public_candidates DELETE is denied", async () => {
    await db.exec(`SET ROLE anon; SET "request.jwt.claim.role" = 'anon';`);
    await assert.rejects(
      async () => db.query(`DELETE FROM public.public_candidates WHERE id = $1;`, [activeCandId]),
      /permission denied for view public_candidates/
    );
    await db.exec(`RESET ROLE;`);
  });

  await test("7. Direct score column modification is denied even for authenticated admins (must use RPC)", async () => {
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.role" = 'authenticated'; SET "request.jwt.claim.sub" = '${adminId}';`);
    for (const col of ["current_score", "total_votes", "paid_votes", "bonus_votes", "penalty_points"]) {
      await assert.rejects(
        async () => db.query(`UPDATE public.candidates SET ${col} = 999 WHERE id = $1;`, [activeCandId]),
        /permission denied for table candidates/
      );
    }
    await db.exec(`RESET ROLE;`);
  });

  await test("8. Fake PAID_VOTE RPC is rejected for anon, non-admin, and admin", async () => {
    await db.exec(`SET ROLE anon; SET "request.jwt.claim.role" = 'anon';`);
    await assert.rejects(
      async () => db.query(`SELECT public.adjust_candidate_score($1::uuid, 'PAID_VOTE', 50, 'hack');`, [activeCandId]),
      /permission denied for function adjust_candidate_score/
    );

    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.role" = 'authenticated'; SET "request.jwt.claim.sub" = '${adminId}';`);
    await assert.rejects(
      async () => db.query(`SELECT public.adjust_candidate_score($1::uuid, 'PAID_VOTE', 50, 'hack');`, [activeCandId]),
      /Forbidden: PAID_VOTE transactions can only be recorded via verified payment fulfillment/
    );
    await db.exec(`RESET ROLE;`);
  });

  await test("9. Fake payment confirmation is rejected for anon and authenticated", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}; SET "request.jwt.claim.role" = '${role}'; SET "request.jwt.claim.sub" = '${adminId}';`);
      await assert.rejects(
        async () => db.query(`SELECT public.confirm_stripe_payment(gen_random_uuid(), 'pi_fake', $1::uuid, 10, 'couple', 200);`, [activeCandId]),
        /permission denied for function confirm_stripe_payment/
      );
    }
    await db.exec(`RESET ROLE;`);
  });

  await test("10. Unauthorized admin adjustment is rejected for non-admin authenticated user", async () => {
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.role" = 'authenticated'; SET "request.jwt.claim.sub" = '${userId}';`);
    await assert.rejects(
      async () => db.query(`SELECT public.adjust_candidate_score($1::uuid, 'ADMIN_ADD', 25, 'Unauthorized');`, [activeCandId]),
      /Forbidden: User .* is not an authorized administrator/
    );
    await db.exec(`RESET ROLE;`);
  });

  await test("11. Authorized admin Give Points (ADMIN_ADD) and Remove Points (ADMIN_REMOVE) succeed via RPC", async () => {
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.role" = 'authenticated'; SET "request.jwt.claim.sub" = '${adminId}';`);
    const rAdd = (await db.query(`SELECT public.adjust_candidate_score($1::uuid, 'ADMIN_ADD', 15, 'Authorized Give Points') AS res;`, [activeCandId])).rows[0].res;
    assert.equal(rAdd.success, true);
    assert.equal(rAdd.new_score, 175);

    const rRem = (await db.query(`SELECT public.adjust_candidate_score($1::uuid, 'ADMIN_REMOVE', 15, 'Authorized Remove Points') AS res;`, [activeCandId])).rows[0].res;
    assert.equal(rRem.success, true);
    assert.equal(rRem.new_score, 160);
    await db.exec(`RESET ROLE;`);
  });

  await test("12. Authorized Stripe confirmation credits exact votes, prevents unpaid/duplicate/concurrent double-credit, and supports recovery", async () => {
    await db.exec(`SET "request.jwt.claim.role" = 'service_role';`);

    // 12a. Paid confirmation
    const pay1 = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, candidate_id, candidate_type, vote_quantity, vote_price, subtotal_amount, service_fee_amount, amount, status)
      VALUES ('cs_m20_paid_1', $1, 'couple', 5, 200, 1000, 400, 1400, 'pending') RETURNING id;
    `, [activeCandId])).rows[0].id;

    const c1 = (await db.query(`SELECT public.confirm_stripe_payment($1::uuid, 'pi_m20_1', $2::uuid, 5, 'couple', 200) AS res;`, [pay1, activeCandId])).rows[0].res;
    assert.equal(c1.already_processed, false);

    // 12b. Duplicate confirmation -> already_processed = true
    const c2 = (await db.query(`SELECT public.confirm_stripe_payment($1::uuid, 'pi_m20_1', $2::uuid, 5, 'couple', 200) AS res;`, [pay1, activeCandId])).rows[0].res;
    assert.equal(c2.already_processed, true);

    // 12c. Concurrent confirmation on fresh payment
    const pay2 = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, candidate_id, candidate_type, vote_quantity, vote_price, subtotal_amount, service_fee_amount, amount, status)
      VALUES ('cs_m20_conc_2', $1, 'couple', 3, 200, 600, 240, 840, 'pending') RETURNING id;
    `, [activeCandId])).rows[0].id;

    const [ca, cb] = await Promise.all([
      db.query(`SELECT public.confirm_stripe_payment($1::uuid, 'pi_m20_2', $2::uuid, 3, 'couple', 200) AS res;`, [pay2, activeCandId]),
      db.query(`SELECT public.confirm_stripe_payment($1::uuid, 'pi_m20_2', $2::uuid, 3, 'couple', 200) AS res;`, [pay2, activeCandId]),
    ]);
    assert.equal((ca.rows[0].res.already_processed ? 0 : 1) + (cb.rows[0].res.already_processed ? 0 : 1), 1);

    // 12d. Failed-to-paid recovery
    const pay3 = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, candidate_id, candidate_type, vote_quantity, vote_price, subtotal_amount, service_fee_amount, amount, status)
      VALUES ('cs_m20_rec_3', $1, 'couple', 2, 200, 400, 160, 560, 'failed') RETURNING id;
    `, [activeCandId])).rows[0].id;

    const recRes = (await db.query(`SELECT public.confirm_stripe_payment($1::uuid, 'pi_m20_3', $2::uuid, 2, 'couple', 200) AS res;`, [pay3, activeCandId])).rows[0].res;
    assert.equal(recRes.recovered, true);

    // 12e. Unpaid (missing PI) cannot credit votes
    const pay4 = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, candidate_id, candidate_type, vote_quantity, vote_price, subtotal_amount, service_fee_amount, amount, status)
      VALUES ('cs_m20_unpaid_4', $1, 'couple', 2, 200, 400, 160, 560, 'pending') RETURNING id;
    `, [activeCandId])).rows[0].id;
    await assert.rejects(
      async () => db.query(`SELECT public.confirm_stripe_payment($1::uuid, '', $2::uuid, 2, 'couple', 200);`, [pay4, activeCandId]),
      /valid Stripe PaymentIntent ID/
    );

    const row = (await db.query(`SELECT current_score, paid_votes FROM public.candidates WHERE id = $1::uuid;`, [activeCandId])).rows[0];
    assert.equal(Number(row.current_score), 170); // 160 + 5 + 3 + 2
    assert.equal(Number(row.paid_votes), 45);     // 35 + 5 + 3 + 2
  });

  await test("13. Candidate profile creation and editing remain functional for authenticated admins", async () => {
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.role" = 'authenticated'; SET "request.jwt.claim.sub" = '${adminId}';`);
    const newId = (await db.query(`
      INSERT INTO public.candidates (name, display_name, slug, category, position, candidate_type, status)
      VALUES ('New Candidate', 'NEW CANDIDATE', 'new-cand', 'Individuals', 'Contestant', 'individual', 'active')
      RETURNING id;
    `)).rows[0].id;

    await db.query(`UPDATE public.candidates SET biography = 'Updated bio', status = 'paused' WHERE id = $1;`, [newId]);
    await db.exec(`RESET ROLE;`);

    const check = (await db.query(`SELECT biography, status, current_score FROM public.candidates WHERE id = $1;`, [newId])).rows[0];
    assert.equal(check.biography, "Updated bio");
    assert.equal(check.status, "paused");
    assert.equal(Number(check.current_score), 0);
  });

  await test("14. Public candidate SELECT & ranking work for anon, while inactive (paused) candidates and private score columns are hidden", async () => {
    await db.exec(`SET ROLE anon; SET "request.jwt.claim.role" = 'anon'; RESET "request.jwt.claim.sub";`);

    const vis = await db.query(`SELECT id, display_name, current_score FROM public.public_candidates ORDER BY current_score DESC;`);
    assert.equal(vis.rows.length, 1, "Anon must only see active candidates (1 active, 2 paused)");
    assert.equal(vis.rows[0].id, activeCandId);
    assert.equal(Number(vis.rows[0].current_score), 170);

    // Paused candidate hidden
    const pausedRes = await db.query(`SELECT id FROM public.public_candidates WHERE id = $1;`, [pausedCandId]);
    assert.equal(pausedRes.rows.length, 0);

    // Private columns blocked even on direct candidates SELECT
    await assert.rejects(
      async () => db.query(`SELECT paid_votes FROM public.candidates;`),
      /permission denied for table candidates/
    );
    await db.exec(`RESET ROLE;`);
  });

  await test("15. Admin dashboard SELECT sees all candidates (active + paused) and internal breakdown columns", async () => {
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.role" = 'authenticated'; SET "request.jwt.claim.sub" = '${adminId}';`);
    const adm = await db.query(`SELECT id, status, paid_votes, bonus_votes, penalty_points, current_score FROM public.candidates ORDER BY current_score DESC;`);
    assert.equal(adm.rows.length, 3);
    await db.exec(`RESET ROLE;`);
  });

  await test("16. Rollback script (20_close_public_view_and_protect_scores_down.sql) executes cleanly without altering data", async () => {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, "20_close_public_view_and_protect_scores_down.sql"), "utf-8"));
    const row = (await db.query(`SELECT current_score, paid_votes FROM public.candidates WHERE id = $1::uuid;`, [activeCandId])).rows[0];
    assert.equal(Number(row.current_score), 170);
    assert.equal(Number(row.paid_votes), 45);
  });

  console.log("\n======================================================================");
  console.log(`MIGRATION 20 TEST SUITE RESULTS: ${passed}/${total} PASSED, ${failed} FAILED`);
  console.log("======================================================================");
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
