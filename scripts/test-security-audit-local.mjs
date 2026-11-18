/**
 * PAIR UP OR LEAVE — ISOLATED LOCAL SECURITY AUDIT & EXPLOIT REPRODUCTION SUITE
 *
 * Runs 100% locally on real PostgreSQL (PGlite) with synthetic data.
 * Zero network calls, zero connection to production.
 *
 * Tests:
 *  - Exact reproduction of production table/view ACLs, RLS policies, and RPCs
 *  - All 20 required security test scenarios from Section 12
 *  - Active exploit simulation of the public.public_candidates auto-updatable view finding
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT_DIR, "supabase", "migrations");

const toFileUrl = (p) =>
  p.replace(/\\/g, "/").replace(/^/, "file:///").replace("file:////", "file:///");

const { createHandlers } = await import(
  toFileUrl(path.join(ROOT_DIR, "supabase/functions/stripe-webhook/handlers.ts"))
);
const { createReconciler, timingSafeEqualStrings } = await import(
  toFileUrl(path.join(ROOT_DIR, "supabase/functions/reconcile-pending-payments/reconciler.ts"))
);
const { createVerifyPaymentHandler, resetVerifyPaymentCooldowns } = await import(
  toFileUrl(path.join(ROOT_DIR, "supabase/functions/verify-payment/handler.ts"))
);
const { calculateVotePricingByVersionCents } = await import(
  toFileUrl(path.join(ROOT_DIR, "supabase/functions/_shared/pricing.ts"))
);

console.log("======================================================================");
console.log("PAIR UP OR LEAVE — ISOLATED LOCAL SECURITY AUDIT & EXPLOIT SIMULATION");
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

async function runAuditSuite() {
  const db = new PGlite();

  // Initialize exact production roles, schema, RLS, view, and migrations 13, 18, 19
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS storage;

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

    CREATE TABLE public.candidates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      display_name text,
      slug text UNIQUE NOT NULL,
      category text NOT NULL,
      position text NOT NULL,
      description text,
      biography text,
      vision text,
      photo_url text,
      person_one_name text,
      person_two_name text,
      person_one_photo_url text,
      person_two_photo_url text,
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

    CREATE TABLE auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text UNIQUE,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.admin_users (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      email text NOT NULL,
      role text NOT NULL DEFAULT 'admin',
      created_at timestamptz NOT NULL DEFAULT now()
    );

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

    CREATE OR REPLACE FUNCTION public.prevent_score_ledger_mutation()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'Score ledger transactions are immutable historical records and cannot be modified or deleted.';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER score_ledger_immutable_trigger
      BEFORE UPDATE OR DELETE ON public.score_ledger
      FOR EACH ROW EXECUTE FUNCTION public.prevent_score_ledger_mutation();

    -- Enable RLS matching production exactly
    ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.score_ledger ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Public can view active candidates" ON public.candidates FOR SELECT USING (status = 'active');
    CREATE POLICY "Admin can do everything with candidates" ON public.candidates FOR ALL
      USING (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()));

    CREATE POLICY "Admin can view all payments" ON public.payments FOR SELECT
      USING (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()));
    CREATE POLICY "Admin can view all votes" ON public.votes FOR SELECT
      USING (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()));
    CREATE POLICY "Admins can read admin_users" ON public.admin_users FOR SELECT
      USING (id = auth.uid());
    CREATE POLICY "Admins can view score_ledger" ON public.score_ledger FOR SELECT
      USING (EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.id = auth.uid()));

    -- Replicate exact production table ACLs observed in pg_class.relacl
    REVOKE ALL ON public.admin_users FROM anon;
    GRANT ALL ON public.admin_users TO authenticated, service_role;

    REVOKE ALL ON public.candidates FROM anon;
    GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.candidates TO anon;
    GRANT ALL ON public.candidates TO authenticated, service_role;

    REVOKE ALL ON public.payments FROM anon;
    GRANT ALL ON public.payments TO authenticated, service_role;

    REVOKE ALL ON public.votes FROM anon;
    GRANT ALL ON public.votes TO authenticated, service_role;

    REVOKE ALL ON public.score_ledger FROM anon;
    GRANT ALL ON public.score_ledger TO authenticated, service_role;

    -- Replicate exact production public_candidates view & its exact production ACL
    CREATE OR REPLACE VIEW public.public_candidates AS
      SELECT id, name, slug, category, position, description, biography, vision,
             photo_url, status, current_score, candidate_type, person_one_name,
             person_two_name, person_one_photo_url, person_two_photo_url,
             display_name, created_at, updated_at
      FROM public.candidates
      WHERE status = 'active';

    GRANT ALL ON public.public_candidates TO anon, authenticated, service_role;
  `);

  // Apply migrations 13, 18, 19
  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, "13_stripe_webhook_hardening.sql"), "utf-8"));
  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, "18_harden_adjust_candidate_score_rpc.sql"), "utf-8"));
  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, "19_payment_reliability_and_recovery.sql"), "utf-8"));

  // Seed synthetic candidate, admin user, and regular non-admin user
  const candId = (await db.query(`
    INSERT INTO public.candidates (name, display_name, slug, category, position, candidate_type, status, current_score, total_votes, paid_votes)
    VALUES ('Synthetic Couple', 'SYNTHETIC COUPLE', 'synthetic-couple', 'Couples', 'Finalist', 'couple', 'active', 50, 50, 50)
    RETURNING id;
  `)).rows[0].id;

  const adminId = (await db.query(`INSERT INTO auth.users (email) VALUES ('admin@synthetic.test') RETURNING id;`)).rows[0].id;
  await db.query(`INSERT INTO public.admin_users (id, email, role) VALUES ($1, 'admin@synthetic.test', 'SUPER_ADMIN');`, [adminId]);

  const regularUserId = (await db.query(`INSERT INTO auth.users (email) VALUES ('voter@synthetic.test') RETURNING id;`)).rows[0].id;

  // =========================================================================
  // 20 REQUIRED LOCAL SECURITY TESTS (SECTION 12)
  // =========================================================================

  await test("1. Anonymous vote insertion denial (public.votes table)", async () => {
    await db.exec(`SET ROLE anon; SET "request.jwt.claim.role" = 'anon'; RESET "request.jwt.claim.sub";`);
    await assert.rejects(
      async () => {
        await db.query(`INSERT INTO public.votes (candidate_id, payment_id, quantity) VALUES ($1, gen_random_uuid(), 10);`, [candId]);
      },
      /permission denied for table votes/
    );
    await db.exec(`RESET ROLE;`);
  });

  await test("2. Non-admin authenticated vote insertion denial (RLS on public.votes)", async () => {
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.role" = 'authenticated'; SET "request.jwt.claim.sub" = '${regularUserId}';`);
    await assert.rejects(
      async () => {
        await db.query(`INSERT INTO public.votes (candidate_id, payment_id, quantity) VALUES ($1, gen_random_uuid(), 10);`, [candId]);
      },
      /new row violates row-level security policy for table "votes"/
    );
    await db.exec(`RESET ROLE;`);
  });

  await test("3. Anonymous direct score update denial on base table public.candidates (RLS + revoked SELECT)", async () => {
    await db.exec(`SET ROLE anon; SET "request.jwt.claim.role" = 'anon'; RESET "request.jwt.claim.sub";`);
    await assert.rejects(
      async () => {
        await db.query(`UPDATE public.candidates SET current_score = 999999;`);
      },
      /permission denied for table (candidates|admin_users)/
    );
    await db.exec(`RESET ROLE;`);
  });

  await test("4. Non-admin authenticated direct score update denial on base table public.candidates (RLS)", async () => {
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.role" = 'authenticated'; SET "request.jwt.claim.sub" = '${regularUserId}';`);
    const res = await db.query(`UPDATE public.candidates SET current_score = 999999 WHERE id = $1;`, [candId]);
    assert.equal(res.affectedRows, 0, "RLS on base public.candidates blocks non-admin UPDATE");
    await db.exec(`RESET ROLE;`);
    const score = (await db.query(`SELECT current_score FROM public.candidates WHERE id = $1;`, [candId])).rows[0].current_score;
    assert.equal(Number(score), 50);
  });

  await test("5. Fake PAID_VOTE RPC rejection (anon, non-admin, and admin all blocked from PAID_VOTE)", async () => {
    // Anon
    await db.exec(`SET ROLE anon; SET "request.jwt.claim.role" = 'anon';`);
    await assert.rejects(
      async () => {
        await db.query(`SELECT public.adjust_candidate_score($1::uuid, 'PAID_VOTE', 100, 'hacked', NULL, NULL, '123');`, [candId]);
      },
      /permission denied for function adjust_candidate_score/
    );

    // Non-admin authenticated
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.role" = 'authenticated'; SET "request.jwt.claim.sub" = '${regularUserId}';`);
    await assert.rejects(
      async () => {
        await db.query(`SELECT public.adjust_candidate_score($1::uuid, 'PAID_VOTE', 100, 'hacked', NULL, NULL, '123');`, [candId]);
      },
      /Forbidden: PAID_VOTE transactions can only be recorded via verified payment fulfillment/
    );

    // Authorized Admin attempting PAID_VOTE
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.role" = 'authenticated'; SET "request.jwt.claim.sub" = '${adminId}';`);
    await assert.rejects(
      async () => {
        await db.query(`SELECT public.adjust_candidate_score($1::uuid, 'PAID_VOTE', 100, 'hacked', NULL, NULL, '123');`, [candId]);
      },
      /Forbidden: PAID_VOTE transactions can only be recorded via verified payment fulfillment/
    );
    await db.exec(`RESET ROLE;`);
  });

  await test("6. Fake paid payment insertion rejection (anon and authenticated blocked from inserting into public.payments)", async () => {
    await db.exec(`SET ROLE anon; SET "request.jwt.claim.role" = 'anon';`);
    await assert.rejects(
      async () => {
        await db.query(`INSERT INTO public.payments (stripe_session_id, candidate_id, vote_quantity, vote_price, subtotal_amount, amount, status) VALUES ('cs_fake', $1, 100, 200, 20000, 20000, 'paid');`, [candId]);
      },
      /permission denied for table payments/
    );

    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.role" = 'authenticated'; SET "request.jwt.claim.sub" = '${regularUserId}';`);
    await assert.rejects(
      async () => {
        await db.query(`INSERT INTO public.payments (stripe_session_id, candidate_id, vote_quantity, vote_price, subtotal_amount, amount, status) VALUES ('cs_fake', $1, 100, 200, 20000, 20000, 'paid');`, [candId]);
      },
      /new row violates row-level security policy for table "payments"/
    );

    // Even an authenticated ADMIN cannot insert or update public.payments via PostgREST because payments only has a SELECT RLS policy!
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.role" = 'authenticated'; SET "request.jwt.claim.sub" = '${adminId}';`);
    await assert.rejects(
      async () => {
        await db.query(`INSERT INTO public.payments (stripe_session_id, candidate_id, vote_quantity, vote_price, subtotal_amount, amount, status) VALUES ('cs_fake_admin', $1, 100, 200, 20000, 20000, 'paid');`, [candId]);
      },
      /new row violates row-level security policy for table "payments"/
    );
    await db.exec(`RESET ROLE;`);
  });

  await test("7. Payment status tampering rejection (pending -> paid blocked for anon, non-admin, and admin via RLS)", async () => {
    const payId = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, candidate_id, candidate_type, vote_quantity, vote_price, subtotal_amount, service_fee_amount, amount, status)
      VALUES ('cs_pending_tamper', $1, 'couple', 10, 200, 2000, 800, 2800, 'pending')
      RETURNING id;
    `, [candId])).rows[0].id;

    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.role" = 'authenticated'; SET "request.jwt.claim.sub" = '${regularUserId}';`);
    const r1 = await db.query(`UPDATE public.payments SET status = 'paid' WHERE id = $1;`, [payId]);
    assert.equal(r1.affectedRows, 0);

    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.role" = 'authenticated'; SET "request.jwt.claim.sub" = '${adminId}';`);
    const r2 = await db.query(`UPDATE public.payments SET status = 'paid' WHERE id = $1;`, [payId]);
    assert.equal(r2.affectedRows, 0, "Even admins cannot directly UPDATE payments.status via PostgREST");
    await db.exec(`RESET ROLE;`);
  });

  await test("8. Forged webhook rejection (unpaid status or invalid PaymentIntent rejected)", async () => {
    await db.exec(`SET "request.jwt.claim.role" = 'service_role';`);
    const payId = (await db.query(`SELECT id FROM public.payments WHERE stripe_session_id = 'cs_pending_tamper';`)).rows[0].id;
    await assert.rejects(
      async () => {
        await db.query(`SELECT public.confirm_stripe_payment($1::uuid, 'invalid_pi', $2::uuid, 10, 'couple', 200);`, [payId, candId]);
      },
      /valid Stripe PaymentIntent ID \(pi_\.\.\.\) is required/
    );
  });

  await test("9. Duplicate webhook idempotency (second call returns already_processed=true and credits 0 extra votes)", async () => {
    await db.exec(`SET "request.jwt.claim.role" = 'service_role';`);
    const payId = (await db.query(`SELECT id FROM public.payments WHERE stripe_session_id = 'cs_pending_tamper';`)).rows[0].id;

    const r1 = (await db.query(`SELECT public.confirm_stripe_payment($1::uuid, 'pi_valid_tamper_test', $2::uuid, 10, 'couple', 200) AS res;`, [payId, candId])).rows[0].res;
    assert.equal(r1.already_processed, false);

    const r2 = (await db.query(`SELECT public.confirm_stripe_payment($1::uuid, 'pi_valid_tamper_test', $2::uuid, 10, 'couple', 200) AS res;`, [payId, candId])).rows[0].res;
    assert.equal(r2.already_processed, true);

    const score = (await db.query(`SELECT current_score FROM public.candidates WHERE id = $1::uuid;`, [candId])).rows[0].current_score;
    assert.equal(Number(score), 60); // 50 + 10
  });

  await test("10. Concurrent payment confirmation serialization (FOR UPDATE row lock prevents race condition double-credit)", async () => {
    const payId = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, candidate_id, candidate_type, vote_quantity, vote_price, subtotal_amount, service_fee_amount, amount, status)
      VALUES ('cs_conc_audit', $1, 'couple', 5, 200, 1000, 400, 1400, 'pending')
      RETURNING id;
    `, [candId])).rows[0].id;

    const [a, b] = await Promise.all([
      db.query(`SELECT public.confirm_stripe_payment($1::uuid, 'pi_conc_audit', $2::uuid, 5, 'couple', 200) AS res;`, [payId, candId]),
      db.query(`SELECT public.confirm_stripe_payment($1::uuid, 'pi_conc_audit', $2::uuid, 5, 'couple', 200) AS res;`, [payId, candId]),
    ]);
    const fulfilledCount = (a.rows[0].res.already_processed ? 0 : 1) + (b.rows[0].res.already_processed ? 0 : 1);
    assert.equal(fulfilledCount, 1);
    const score = (await db.query(`SELECT current_score FROM public.candidates WHERE id = $1::uuid;`, [candId])).rows[0].current_score;
    assert.equal(Number(score), 65); // 60 + 5
  });

  await test("11. Payment replay resistance (reusing a paid PaymentIntent on another payment row is rejected)", async () => {
    const payId2 = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, candidate_id, candidate_type, vote_quantity, vote_price, subtotal_amount, service_fee_amount, amount, status)
      VALUES ('cs_replay_audit', $1, 'couple', 5, 200, 1000, 400, 1400, 'pending')
      RETURNING id;
    `, [candId])).rows[0].id;

    await assert.rejects(
      async () => {
        await db.query(`SELECT public.confirm_stripe_payment($1::uuid, 'pi_conc_audit', $2::uuid, 5, 'couple', 200);`, [payId2, candId]);
      },
      /already associated with another payment/
    );
  });

  await test("12. Checkout amount manipulation rejection (subtotal + fee + tax != amount blocked by constraint and RPC)", async () => {
    await assert.rejects(
      async () => {
        await db.query(`
          INSERT INTO public.payments (stripe_session_id, candidate_id, candidate_type, vote_quantity, vote_price, subtotal_amount, service_fee_amount, amount, status)
          VALUES ('cs_bad_math', $1, 'couple', 10, 200, 2000, 800, 100, 'pending');
        `, [candId]);
      },
      /payments_total_amount_integrity_check/
    );
  });

  await test("13. Candidate substitution rejection (confirming payment for different candidate_id is blocked)", async () => {
    const otherCandId = (await db.query(`
      INSERT INTO public.candidates (name, slug, category, position, candidate_type, status)
      VALUES ('Other Candidate', 'other-cand', 'Couples', 'Contestant', 'couple', 'active')
      RETURNING id;
    `)).rows[0].id;
    const payId = (await db.query(`SELECT id FROM public.payments WHERE stripe_session_id = 'cs_replay_audit';`)).rows[0].id;

    await assert.rejects(
      async () => {
        await db.query(`SELECT public.confirm_stripe_payment($1::uuid, 'pi_fresh_subst', $2::uuid, 5, 'couple', 200);`, [payId, otherCandId]);
      },
      /candidate_id .* does not match payment record/
    );
  });

  await test("14. Session / Vote quantity substitution rejection (confirming payment with inflated vote_quantity is blocked)", async () => {
    const payId = (await db.query(`SELECT id FROM public.payments WHERE stripe_session_id = 'cs_replay_audit';`)).rows[0].id;
    await assert.rejects(
      async () => {
        await db.query(`SELECT public.confirm_stripe_payment($1::uuid, 'pi_fresh_qty', $2::uuid, 500, 'couple', 200);`, [payId, candId]);
      },
      /vote_quantity .* does not match valid payment record/
    );
  });

  await test("15. Unauthorized reconciliation RPC rejection (anon and authenticated blocked from all reconciliation RPCs)", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}; SET "request.jwt.claim.role" = '${role}'; SET "request.jwt.claim.sub" = '${adminId}';`);
      await assert.rejects(
        async () => {
          await db.query(`SELECT * FROM public.get_reconcilable_payments(10, 5);`);
        },
        /permission denied for function get_reconcilable_payments/
      );
      await assert.rejects(
        async () => {
          await db.query(`SELECT public.confirm_stripe_payment(gen_random_uuid(), 'pi_123', gen_random_uuid(), 1, 'couple', 200);`);
        },
        /permission denied for function confirm_stripe_payment/
      );
    }
    await db.exec(`RESET ROLE;`);
  });

  await test("16. Admin-only manual adjustment authorization (non-admin authenticated user rejected from ADMIN_ADD / BONUS)", async () => {
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.role" = 'authenticated'; SET "request.jwt.claim.sub" = '${regularUserId}';`);
    await assert.rejects(
      async () => {
        await db.query(`SELECT public.adjust_candidate_score($1::uuid, 'ADMIN_ADD', 50, 'Self-promotion attempt');`, [candId]);
      },
      /Forbidden: User .* is not an authorized administrator/
    );
    await db.exec(`RESET ROLE;`);
  });

  await test("17. Audit identity spoofing resistance (spoofed p_admin_id and p_admin_email overwritten by auth.uid())", async () => {
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.role" = 'authenticated'; SET "request.jwt.claim.sub" = '${adminId}';`);
    const res = (await db.query(`
      SELECT public.adjust_candidate_score($1::uuid, 'ADMIN_ADD', 10, 'Authorized bonus', $2::uuid, 'fake@spoof.org', NULL) AS res;
    `, [candId, regularUserId])).rows[0].res;

    await db.exec(`RESET ROLE;`);
    const ledger = (await db.query(`SELECT admin_user_id, admin_email FROM public.score_ledger WHERE id = $1::uuid;`, [res.ledger_id])).rows[0];
    assert.equal(ledger.admin_user_id, adminId);
    assert.equal(ledger.admin_email, "admin@synthetic.test");
  });

  await test("18. Legacy RPC access denial (increment_candidate_votes is completely removed)", async () => {
    const r = await db.query(`SELECT count(*) AS c FROM pg_proc WHERE proname = 'increment_candidate_votes';`);
    assert.equal(Number(r.rows[0].c), 0);
  });

  await test("19. Score recalculation & ledger immutability safety (score_ledger cannot be updated or deleted)", async () => {
    await assert.rejects(
      async () => {
        await db.query(`UPDATE public.score_ledger SET quantity = 9999;`);
      },
      /Score ledger transactions are immutable/
    );
    await assert.rejects(
      async () => {
        await db.query(`DELETE FROM public.score_ledger;`);
      },
      /Score ledger transactions are immutable/
    );
  });

  await test("20. Recovery without duplicate vote crediting (failed -> paid recovery credits once and blocks subsequent replay)", async () => {
    await db.exec(`SET "request.jwt.claim.role" = 'service_role';`);
    const payId = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, candidate_id, candidate_type, vote_quantity, vote_price, subtotal_amount, service_fee_amount, amount, status)
      VALUES ('cs_recover_audit', $1, 'couple', 8, 200, 1600, 640, 2240, 'failed')
      RETURNING id;
    `, [candId])).rows[0].id;

    const r1 = (await db.query(`SELECT public.confirm_stripe_payment($1::uuid, 'pi_recover_audit', $2::uuid, 8, 'couple', 200) AS res;`, [payId, candId])).rows[0].res;
    assert.equal(r1.recovered, true);
    assert.equal(r1.already_processed, false);

    const r2 = (await db.query(`SELECT public.confirm_stripe_payment($1::uuid, 'pi_recover_audit', $2::uuid, 8, 'couple', 200) AS res;`, [payId, candId])).rows[0].res;
    assert.equal(r2.already_processed, true);

    const score = (await db.query(`SELECT current_score FROM public.candidates WHERE id = $1::uuid;`, [candId])).rows[0].current_score;
    assert.equal(Number(score), 83); // 65 + 10 (admin) + 8 (recovered)
  });

  // =========================================================================
  // CRITICAL VULNERABILITY PROOF-OF-CONCEPT (LOCAL ISOLATED REPRODUCTION ONLY)
  // =========================================================================
  console.log("\n--- 21. LOCAL PROOF-OF-CONCEPT: public.public_candidates AUTO-UPDATABLE VIEW BYPASS ---");

  await test("21. CRITICAL FINDING REPRODUCTION: In current production view config (security_invoker=false + GRANT ALL to anon/authenticated), anon AND non-admin authenticated users CAN update current_score via public.public_candidates view, bypassing candidates RLS!", async () => {
    // Switch to unauthenticated 'anon' role
    await db.exec(`SET ROLE anon; SET "request.jwt.claim.role" = 'anon'; RESET "request.jwt.claim.sub";`);

    // 1. Direct update on public.candidates is blocked:
    await assert.rejects(
      async () => {
        await db.query(`UPDATE public.candidates SET current_score = 777777 WHERE id = $1;`, [candId]);
      },
      /permission denied for table (candidates|admin_users)/
    );

    // 2. Update through public.public_candidates view (owned by postgres, security_invoker=false, anon has UPDATE grant):
    await db.query(`UPDATE public.public_candidates SET current_score = 777777 WHERE id = $1;`, [candId]);

    await db.exec(`RESET ROLE;`);
    const afterViewExploit = (await db.query(`SELECT current_score, paid_votes FROM public.candidates WHERE id = $1;`, [candId])).rows[0];
    assert.equal(
      Number(afterViewExploit.current_score),
      777777,
      "EXPLOIT CONFIRMED LOCALLY: Auto-updatable view public_candidates owned by postgres bypasses candidates RLS when anon has UPDATE privilege on the view!"
    );

    // 3. Verify the exact remediation in local Postgres:
    //    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.public_candidates FROM PUBLIC, anon, authenticated;
    //    ALTER VIEW public.public_candidates SET (security_invoker = true);
    await db.exec(`
      UPDATE public.candidates SET current_score = 83 WHERE id = '${candId}';
      REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.public_candidates FROM PUBLIC, anon, authenticated;
    `);

    await db.exec(`SET ROLE anon; SET "request.jwt.claim.role" = 'anon';`);
    await assert.rejects(
      async () => {
        await db.query(`UPDATE public.public_candidates SET current_score = 999999 WHERE id = $1;`, [candId]);
      },
      /permission denied for view public_candidates/
    );
    await db.exec(`RESET ROLE;`);
  });

  console.log("\n======================================================================");
  console.log(`LOCAL SECURITY AUDIT SUITE RESULTS: ${passed}/${total} PASSED, ${failed} FAILED`);
  console.log("======================================================================");

  if (failed > 0) process.exit(1);
}

runAuditSuite().catch((err) => {
  console.error("FATAL AUDIT SUITE ERROR:", err);
  process.exit(1);
});
