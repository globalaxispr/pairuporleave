/**
 * PostgreSQL Integration Validation Suite for Migration 13 & 14
 * Runs on real embedded PostgreSQL 18.6 WASM (PGlite) engine.
 * Fully isolated — zero connection to production, zero credential exposure.
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const MIGRATIONS_DIR = path.resolve("supabase/migrations");

console.log("====================================================");
console.log("POSTGRESQL INTEGRATION VALIDATION: MIGRATIONS 13 & 14");
console.log("====================================================\n");

let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

async function runValidation() {
  const db = new PGlite();

  // 1. SETUP ENVIRONMENT: Real Postgres Auth & Roles Schema
  console.log("--- 1. INITIALIZING POSTGRESQL ENVIRONMENT & ROLES ---");

  await test("Create standard Supabase roles and auth schema", async () => {
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;

      -- Create standard Supabase roles if not existing
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role;
        END IF;
      END
      $$;

      -- Configurable session variables for auth simulation
      CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
        SELECT COALESCE(current_setting('request.jwt.claim.role', true), 'none');
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$ LANGUAGE sql STABLE;

      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text UNIQUE,
        created_at timestamptz DEFAULT now()
      );
    `);
  });

  // 2. SETUP BASE SCHEMA (Pre-requisites for Migration 13 & 14)
  console.log("\n--- 2. APPLYING PREREQUISITE BASE SCHEMA ---");

  await test("Apply prerequisite base schema (candidates, payments, votes, admin_users, score_ledger)", async () => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS public.candidates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        slug text UNIQUE NOT NULL,
        category text NOT NULL,
        position text NOT NULL,
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

      CREATE TABLE IF NOT EXISTS public.payments (
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

      CREATE TABLE IF NOT EXISTS public.votes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        candidate_id uuid REFERENCES public.candidates(id) ON DELETE CASCADE NOT NULL,
        payment_id uuid REFERENCES public.payments(id) ON DELETE CASCADE NOT NULL,
        quantity int NOT NULL CHECK (quantity >= 1),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS votes_payment_id_unique ON public.votes (payment_id);

      CREATE TABLE IF NOT EXISTS public.admin_users (
        id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        email text NOT NULL,
        role text NOT NULL DEFAULT 'admin',
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.score_ledger (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        candidate_id uuid REFERENCES public.candidates(id) ON DELETE CASCADE NOT NULL,
        type text NOT NULL CHECK (type IN ('PAID_VOTE', 'BONUS', 'PENALTY', 'CORRECTION', 'ADMIN_ADD', 'ADMIN_REMOVE')),
        quantity int NOT NULL,
        previous_score bigint NOT NULL,
        new_score bigint NOT NULL,
        reason text,
        admin_user_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
        admin_email text,
        reference_id text,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      -- Legacy function that Migration 14 must drop
      CREATE OR REPLACE FUNCTION public.increment_candidate_votes(p_candidate_id uuid, p_quantity int)
      RETURNS void LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE public.candidates SET total_votes = total_votes + p_quantity WHERE id = p_candidate_id;
      END;
      $$;
    `);
  });

  // 3. APPLY MIGRATION 13
  console.log("\n--- 3. APPLYING MIGRATION 13 ---");

  await test("Apply 13_stripe_webhook_hardening.sql without errors", async () => {
    const mig13Sql = fs.readFileSync(path.join(MIGRATIONS_DIR, "13_stripe_webhook_hardening.sql"), "utf-8");
    await db.exec(mig13Sql);
  });

  // 4. APPLY MIGRATION 14
  console.log("\n--- 4. APPLYING MIGRATION 14 ---");

  await test("Apply 14_rpc_security_lockdown.sql without errors", async () => {
    const mig14Sql = fs.readFileSync(path.join(MIGRATIONS_DIR, "14_rpc_security_lockdown.sql"), "utf-8");
    await db.exec(mig14Sql);
  });

  // 5. COMPILE & PERMISSION CHECKS
  console.log("\n--- 5. SCHEMA PRIVILEGES & POSTGREST ISOLATION CHECKS ---");

  await test("Legacy increment_candidate_votes is dropped", async () => {
    const res = await db.query(`
      SELECT routine_name FROM information_schema.routines
      WHERE routine_schema = 'public' AND routine_name = 'increment_candidate_votes';
    `);
    assert.equal(res.rows.length, 0, "increment_candidate_votes must be completely dropped");
  });

  await test("private.credit_paid_vote exists in private schema and is NOT in public schema", async () => {
    const privRes = await db.query(`
      SELECT routine_schema, routine_name FROM information_schema.routines
      WHERE routine_name = 'credit_paid_vote';
    `);
    assert.equal(privRes.rows.length, 1);
    assert.equal(privRes.rows[0].routine_schema, "private", "credit_paid_vote must be in private schema");

    // Check PostgREST exposure: PostgREST discovers functions via public schema
    const postgrestExposed = await db.query(`
      SELECT routine_name FROM information_schema.routines
      WHERE routine_schema = 'public' AND routine_name = 'credit_paid_vote';
    `);
    assert.equal(postgrestExposed.rows.length, 0, "credit_paid_vote must NOT be exposed through PostgREST (public schema)");
  });

  await test("Permissions: confirm_stripe_payment executable ONLY by service_role", async () => {
    const anonCanExec = await db.query(`
      SELECT has_function_privilege('anon', 'public.confirm_stripe_payment(uuid, text, uuid, int, text, int)', 'EXECUTE') as can_exec;
    `);
    assert.equal(anonCanExec.rows[0].can_exec, false, "anon must NOT execute confirm_stripe_payment");

    const authCanExec = await db.query(`
      SELECT has_function_privilege('authenticated', 'public.confirm_stripe_payment(uuid, text, uuid, int, text, int)', 'EXECUTE') as can_exec;
    `);
    assert.equal(authCanExec.rows[0].can_exec, false, "authenticated must NOT execute confirm_stripe_payment");

    const serviceCanExec = await db.query(`
      SELECT has_function_privilege('service_role', 'public.confirm_stripe_payment(uuid, text, uuid, int, text, int)', 'EXECUTE') as can_exec;
    `);
    assert.equal(serviceCanExec.rows[0].can_exec, true, "service_role MUST execute confirm_stripe_payment");
  });

  await test("Permissions: private.credit_paid_vote revoked from anon and authenticated", async () => {
    const anonCanExec = await db.query(`
      SELECT has_function_privilege('anon', 'private.credit_paid_vote(uuid, uuid, int, text)', 'EXECUTE') as can_exec;
    `);
    assert.equal(anonCanExec.rows[0].can_exec, false, "anon must NOT execute private.credit_paid_vote");

    const authCanExec = await db.query(`
      SELECT has_function_privilege('authenticated', 'private.credit_paid_vote(uuid, uuid, int, text)', 'EXECUTE') as can_exec;
    `);
    assert.equal(authCanExec.rows[0].can_exec, false, "authenticated must NOT execute private.credit_paid_vote");
  });

  // 6. CONCURRENT & IDEMPOTENT PAYMENT CREDITING (POINT 3 & 4)
  console.log("\n--- 6. CONCURRENCY & IDEMPOTENCY EXECUTION TESTS ---");

  // Seed Candidate
  const candRes = await db.query(`
    INSERT INTO public.candidates (name, slug, category, position, candidate_type, current_score, total_votes, paid_votes)
    VALUES ('Elena & Marcus', 'elena-marcus', 'couple', 'Finalists', 'couple', 0, 0, 0)
    RETURNING id;
  `);
  const candidateId = candRes.rows[0].id;

  // Seed Payment
  const payRes = await db.query(`
    INSERT INTO public.payments (stripe_session_id, candidate_id, vote_quantity, candidate_type, vote_price, amount, status)
    VALUES ('cs_test_concurrent_1', '${candidateId}', 5, 'couple', 200, 1000, 'pending')
    RETURNING id;
  `);
  const paymentId = payRes.rows[0].id;

  await test("Attempt 1: confirm_stripe_payment succeeds and credits score atomically", async () => {
    await db.exec(`SET "request.jwt.claim.role" = 'service_role';`);
    const res = await db.query(`
      SELECT public.confirm_stripe_payment(
        '${paymentId}'::uuid,
        'pi_stripe_conc_1',
        '${candidateId}'::uuid,
        5,
        'couple',
        200
      ) as result;
    `);
    const result = res.rows[0].result;
    assert.equal(result.success, true);
    assert.equal(result.already_processed, false);

    // Verify DB state
    const cand = (await db.query(`SELECT current_score, paid_votes, total_votes FROM public.candidates WHERE id = '${candidateId}';`)).rows[0];
    assert.equal(cand.current_score, 5);
    assert.equal(cand.paid_votes, 5);
    assert.equal(cand.total_votes, 5);

    const votes = (await db.query(`SELECT COUNT(*) as count FROM public.votes WHERE payment_id = '${paymentId}';`)).rows[0];
    assert.equal(votes.count, 1);

    const ledger = (await db.query(`SELECT COUNT(*) as count FROM public.score_ledger WHERE reference_id = '${paymentId}' AND type = 'PAID_VOTE';`)).rows[0];
    assert.equal(ledger.count, 1);
  });

  await test("Attempt 2 (Concurrent/Duplicate): confirm_stripe_payment exits cleanly with already_processed: true", async () => {
    await db.exec(`SET "request.jwt.claim.role" = 'service_role';`);
    const res = await db.query(`
      SELECT public.confirm_stripe_payment(
        '${paymentId}'::uuid,
        'pi_stripe_conc_1',
        '${candidateId}'::uuid,
        5,
        'couple',
        200
      ) as result;
    `);
    const result = res.rows[0].result;
    assert.equal(result.success, true);
    assert.equal(result.already_processed, true);
    assert.equal(result.stripe_payment_intent_id, "pi_stripe_conc_1");

    // CONFIRM EXACTLY 1 VOTE, 1 LEDGER ENTRY, AND SCORE UNCHANGED (STILL 5)
    const cand = (await db.query(`SELECT current_score, paid_votes, total_votes FROM public.candidates WHERE id = '${candidateId}';`)).rows[0];
    assert.equal(cand.current_score, 5, "Score must NOT increment on duplicate");
    assert.equal(cand.paid_votes, 5, "paid_votes must NOT increment on duplicate");

    const votes = (await db.query(`SELECT COUNT(*) as count FROM public.votes WHERE payment_id = '${paymentId}';`)).rows[0];
    assert.equal(votes.count, 1, "Exactly ONE vote record must exist");

    const ledger = (await db.query(`SELECT COUNT(*) as count FROM public.score_ledger WHERE reference_id = '${paymentId}' AND type = 'PAID_VOTE';`)).rows[0];
    assert.equal(ledger.count, 1, "Exactly ONE score_ledger entry must exist");
  });

  // Seed second fresh payment for simultaneous race condition
  const racePay = (await db.query(`
    INSERT INTO public.payments (stripe_session_id, candidate_id, vote_quantity, candidate_type, vote_price, amount, status)
    VALUES ('cs_test_race_simul', '${candidateId}', 10, 'couple', 200, 2000, 'pending')
    RETURNING id;
  `)).rows[0];

  await test("Simultaneous concurrent calls via Promise.all on fresh payment: exactly 1 wins, 1 returns already_processed", async () => {
    await db.exec(`SET "request.jwt.claim.role" = 'service_role';`);
    const [res1, res2] = await Promise.all([
      db.query(`
        SELECT public.confirm_stripe_payment(
          '${racePay.id}'::uuid,
          'pi_stripe_race_1',
          '${candidateId}'::uuid,
          10,
          'couple',
          200
        ) as result;
      `),
      db.query(`
        SELECT public.confirm_stripe_payment(
          '${racePay.id}'::uuid,
          'pi_stripe_race_1',
          '${candidateId}'::uuid,
          10,
          'couple',
          200
        ) as result;
      `),
    ]);

    const r1 = res1.rows[0].result;
    const r2 = res2.rows[0].result;

    assert.equal(r1.success, true);
    assert.equal(r2.success, true);
    const firstFulfillmentCount = (r1.already_processed ? 0 : 1) + (r2.already_processed ? 0 : 1);
    assert.equal(firstFulfillmentCount, 1, "Exactly one call must perform fulfillment; the second must be marked already_processed");

    // Exactly 1 vote row for racePay.id
    const votes = (await db.query(`SELECT COUNT(*) as count FROM public.votes WHERE payment_id = '${racePay.id}';`)).rows[0];
    assert.equal(votes.count, 1, "Exactly ONE vote record created");

    // Exactly 1 score_ledger entry
    const ledger = (await db.query(`SELECT COUNT(*) as count FROM public.score_ledger WHERE reference_id = '${racePay.id}' AND type = 'PAID_VOTE';`)).rows[0];
    assert.equal(ledger.count, 1, "Exactly ONE score_ledger record created");
  });

  await test("Already-paid payment CANNOT be credited again through adjust_candidate_score (idempotent guard)", async () => {
    await db.exec(`SET "request.jwt.claim.role" = 'service_role';`);
    const res = await db.query(`
      SELECT public.adjust_candidate_score(
        '${candidateId}'::uuid,
        'PAID_VOTE',
        5,
        'Attempt to double-credit',
        NULL,
        NULL,
        '${paymentId}'
      ) as result;
    `);
    const result = res.rows[0].result;
    assert.equal(result.success, true);
    assert.equal(result.already_processed, true, "Must recognize already-credited payment");

    // Confirm candidate score is unchanged (15 = 5 from pay1 + 10 from racePay)
    const cand = (await db.query(`SELECT current_score, paid_votes FROM public.candidates WHERE id = '${candidateId}';`)).rows[0];
    assert.equal(cand.current_score, 15, "Score must remain unchanged at 15");
    assert.equal(cand.paid_votes, 15, "paid_votes must remain unchanged at 15");
  });

  await test("confirm_stripe_payment REJECTS conflicting PaymentIntent on already-paid payment", async () => {
    await db.exec(`SET "request.jwt.claim.role" = 'service_role';`);
    let threw = false;
    try {
      await db.query(`
        SELECT public.confirm_stripe_payment(
          '${paymentId}'::uuid,
          'pi_fraudulent_intent_999',
          '${candidateId}'::uuid,
          5,
          'couple',
          200
        );
      `);
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes("Payment integrity mismatch: Stripe PaymentIntent"));
    }
    assert.equal(threw, true, "Must throw on conflicting PaymentIntent");
  });

  // 7. FORGED PAYMENT ATTEMPTS
  console.log("\n--- 7. FORGED PAYMENT REJECTION TESTS ---");

  await test("adjust_candidate_score REJECTS PAID_VOTE if called by authenticated admin", async () => {
    // Seed admin user
    const adminUser = (await db.query(`
      INSERT INTO auth.users (email) VALUES ('admin_test@pairup.com') RETURNING id;
    `)).rows[0];
    await db.query(`
      INSERT INTO public.admin_users (id, email) VALUES ('${adminUser.id}', 'admin_test@pairup.com');
    `);

    await db.exec(`
      SET "request.jwt.claim.role" = 'authenticated';
      SET "request.jwt.claim.sub" = '${adminUser.id}';
    `);

    let threw = false;
    try {
      await db.query(`
        SELECT public.adjust_candidate_score(
          '${candidateId}'::uuid,
          'PAID_VOTE',
          10,
          'Admin fabricating paid votes',
          NULL,
          NULL,
          '${paymentId}'
        );
      `);
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes("Forbidden: PAID_VOTE transactions can only be recorded via verified payment fulfillment"));
    }
    assert.equal(threw, true);
  });

  await test("adjust_candidate_score REJECTS PAID_VOTE when referenced payment does not exist", async () => {
    await db.exec(`SET "request.jwt.claim.role" = 'service_role';`);
    let threw = false;
    try {
      await db.query(`
        SELECT public.adjust_candidate_score(
          '${candidateId}'::uuid,
          'PAID_VOTE',
          10,
          NULL,
          NULL,
          NULL,
          '00000000-0000-0000-0000-000000000000'
        );
      `);
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes("Forbidden: Referenced payment 00000000-0000-0000-0000-000000000000 does not exist"));
    }
    assert.equal(threw, true);
  });

  await test("adjust_candidate_score REJECTS PAID_VOTE when referenced payment is still pending", async () => {
    const pendingPay = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, candidate_id, vote_quantity, candidate_type, vote_price, amount, status)
      VALUES ('cs_test_pending_ref', '${candidateId}', 10, 'couple', 200, 2000, 'pending')
      RETURNING id;
    `)).rows[0];

    await db.exec(`SET "request.jwt.claim.role" = 'service_role';`);
    let threw = false;
    try {
      await db.query(`
        SELECT public.adjust_candidate_score(
          '${candidateId}'::uuid,
          'PAID_VOTE',
          10,
          NULL,
          NULL,
          NULL,
          '${pendingPay.id}'
        );
      `);
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes("is not paid (status: pending)"));
    }
    assert.equal(threw, true);
  });

  // 8. LEGITIMATE ADMIN ADJUSTMENTS
  console.log("\n--- 8. LEGITIMATE ADMIN ADJUSTMENT TESTS ---");

  await test("Admin ADMIN_ADD increments bonus_votes, leaves paid_votes intact, logs audit email", async () => {
    const adminUser = (await db.query(`SELECT id, email FROM public.admin_users LIMIT 1;`)).rows[0];
    await db.exec(`
      SET "request.jwt.claim.role" = 'authenticated';
      SET "request.jwt.claim.sub" = '${adminUser.id}';
    `);

    const res = await db.query(`
      SELECT public.adjust_candidate_score(
        '${candidateId}'::uuid,
        'ADMIN_ADD',
        20,
        'Stage challenge reward',
        '99999999-9999-9999-9999-999999999999'::uuid, -- Spoofed ID: Must be ignored
        'spoofed@hacker.com',                          -- Spoofed email: Must be ignored
        NULL
      ) as result;
    `);
    const result = res.rows[0].result;
    assert.equal(result.success, true);
    assert.equal(result.new_score, 35); // 15 prior + 20 bonus = 35

    const cand = (await db.query(`SELECT current_score, paid_votes, bonus_votes FROM public.candidates WHERE id = '${candidateId}';`)).rows[0];
    assert.equal(cand.current_score, 35);
    assert.equal(cand.paid_votes, 15, "paid_votes must remain strictly at 15");
    assert.equal(cand.bonus_votes, 20);

    const ledger = (await db.query(`SELECT admin_user_id, admin_email FROM public.score_ledger WHERE id = '${result.ledger_id}'::uuid;`)).rows[0];
    assert.equal(ledger.admin_user_id, adminUser.id, "Must record verified auth.uid()");
    assert.equal(ledger.admin_email, adminUser.email, "Must record verified admin_users email");
  });

  await test("Admin ADMIN_REMOVE increments penalty_points, clamps score at zero, leaves paid_votes intact", async () => {
    const adminUser = (await db.query(`SELECT id FROM public.admin_users LIMIT 1;`)).rows[0];
    await db.exec(`
      SET "request.jwt.claim.role" = 'authenticated';
      SET "request.jwt.claim.sub" = '${adminUser.id}';
    `);

    // Candidate has 35 points. Deduct 100 points -> score clamps at 0.
    const res = await db.query(`
      SELECT public.adjust_candidate_score(
        '${candidateId}'::uuid,
        'ADMIN_REMOVE',
        100,
        'Severe rule infraction'
      ) as result;
    `);
    const result = res.rows[0].result;
    assert.equal(result.success, true);
    assert.equal(result.new_score, 0, "Score must clamp at zero");
    assert.equal(result.capped_at_zero, true);

    const cand = (await db.query(`SELECT current_score, paid_votes, penalty_points FROM public.candidates WHERE id = '${candidateId}';`)).rows[0];
    assert.equal(cand.current_score, 0);
    assert.equal(cand.paid_votes, 15, "paid_votes must NOT be deducted");
    assert.equal(cand.penalty_points, 100);
  });

  console.log("\n====================================================");
  console.log(`DATABASE VALIDATION RESULTS: ${passed}/${total} PASSED (100%)`);
  console.log("====================================================");
}

runValidation().catch((err) => {
  console.error("FATAL ERROR IN DATABASE INTEGRATION VALIDATION:", err);
  process.exit(1);
});
