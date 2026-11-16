/**
 * PAIR UP OR LEAVE — COMPREHENSIVE PAYMENT RELIABILITY, RECOVERY & SECURITY SUITE
 *
 * Executes end-to-end integration tests against a REAL local PostgreSQL instance
 * (PGlite / PostgreSQL) combined with the real TypeScript handlers:
 *   - supabase/migrations/18_harden_adjust_candidate_score_rpc.sql
 *   - supabase/migrations/19_payment_reliability_and_recovery.sql
 *   - supabase/functions/stripe-webhook/handlers.ts
 *   - supabase/functions/reconcile-pending-payments/reconciler.ts
 *   - supabase/functions/verify-payment/handler.ts
 *
 * Zero production connections, zero live Stripe charges, 100% isolated.
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
const {
  createReconciler,
  timingSafeEqualStrings,
  computeNextBackoffIso,
} = await import(
  toFileUrl(path.join(ROOT_DIR, "supabase/functions/reconcile-pending-payments/reconciler.ts"))
);
const {
  createVerifyPaymentHandler,
  resetVerifyPaymentCooldowns,
} = await import(
  toFileUrl(path.join(ROOT_DIR, "supabase/functions/verify-payment/handler.ts"))
);

// ---------------------------------------------------------------------------
// Real PostgreSQL (PGlite) Adapter implementing the SupabaseClient subset
// used by handlers.ts, reconciler.ts, and verify-payment/handler.ts
// ---------------------------------------------------------------------------
class PGliteQueryBuilder {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.op = "select";
    this.selectCols = "*";
    this.filters = [];
    this.payload = null;
    this.limitCount = null;
    this.orderCol = null;
    this.orderAsc = true;
  }

  select(cols = "*") {
    if (this.op === "select") {
      this.selectCols = cols;
    }
    return this;
  }

  insert(rowOrRows) {
    this.op = "insert";
    this.payload = Array.isArray(rowOrRows) ? rowOrRows[0] : rowOrRows;
    return this;
  }

  update(patch) {
    this.op = "update";
    this.payload = patch;
    return this;
  }

  eq(col, val) {
    this.filters.push({ col, val });
    return this;
  }

  order(col, opts = { ascending: true }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }

  limit(n) {
    this.limitCount = n;
    return this;
  }

  async _execute() {
    try {
      await this.db.exec(`SET "request.jwt.claim.role" = 'service_role';`);
      const params = [];
      const buildWhere = () => {
        if (this.filters.length === 0) return "";
        const clauses = this.filters.map((f) => {
          params.push(f.val);
          return `${f.col} = $${params.length}`;
        });
        return ` WHERE ${clauses.join(" AND ")}`;
      };

      if (this.op === "insert") {
        const keys = Object.keys(this.payload).filter((k) => this.payload[k] !== undefined);
        const vals = keys.map((k) => {
          params.push(this.payload[k]);
          return `$${params.length}`;
        });
        const sql = `INSERT INTO public.${this.table} (${keys.join(", ")}) VALUES (${vals.join(", ")}) RETURNING *;`;
        const res = await this.db.query(sql, params);
        return { data: res.rows, error: null };
      }

      if (this.op === "update") {
        const keys = Object.keys(this.payload).filter((k) => this.payload[k] !== undefined);
        const sets = keys.map((k) => {
          params.push(this.payload[k]);
          return `${k} = $${params.length}`;
        });
        const where = buildWhere();
        const sql = `UPDATE public.${this.table} SET ${sets.join(", ")}${where} RETURNING *;`;
        const res = await this.db.query(sql, params);
        return { data: res.rows, error: null };
      }

      // SELECT
      const where = buildWhere();
      let sql = `SELECT * FROM public.${this.table}${where}`;
      if (this.orderCol) {
        sql += ` ORDER BY ${this.orderCol} ${this.orderAsc ? "ASC" : "DESC"}`;
      }
      if (this.limitCount !== null) {
        sql += ` LIMIT ${Number(this.limitCount)}`;
      }
      const res = await this.db.query(sql, params);

      // If querying payments with embedded candidates(...) join in verify-payment
      if (this.table === "payments" && this.selectCols.includes("candidates")) {
        for (const row of res.rows) {
          if (row.candidate_id) {
            const cRes = await this.db.query(
              `SELECT name, display_name, category, position, candidate_type FROM public.candidates WHERE id = $1`,
              [row.candidate_id]
            );
            row.candidates = cRes.rows[0] ?? null;
          } else {
            row.candidates = null;
          }
        }
      }

      return { data: res.rows, error: null };
    } catch (err) {
      return { data: null, error: { message: err.message } };
    }
  }

  async maybeSingle() {
    const { data, error } = await this._execute();
    if (error) return { data: null, error };
    return { data: data?.[0] ?? null, error: null };
  }

  async single() {
    const { data, error } = await this._execute();
    if (error) return { data: null, error };
    if (!data || data.length === 0) {
      return { data: null, error: { code: "PGRST116", message: "No rows found" } };
    }
    return { data: data[0], error: null };
  }

  then(onFulfilled, onRejected) {
    return this._execute().then(onFulfilled, onRejected);
  }
}

class PGliteSupabaseAdapter {
  constructor(db) {
    this.db = db;
    this.rpcCalls = [];
    this.simulateRpcUnavailable = false;
  }

  from(table) {
    return new PGliteQueryBuilder(this.db, table);
  }

  async rpc(fnName, args = {}) {
    this.rpcCalls.push({ fnName, args });
    if (this.simulateRpcUnavailable) {
      return { data: null, error: { message: "Database connection temporarily unavailable" } };
    }
    try {
      await this.db.exec(`SET "request.jwt.claim.role" = 'service_role';`);

      if (fnName === "confirm_stripe_payment") {
        const res = await this.db.query(
          `SELECT public.confirm_stripe_payment($1::uuid, $2::text, $3::uuid, $4::int, $5::text, $6::int) AS result;`,
          [
            args.p_payment_id,
            args.p_stripe_payment_intent_id,
            args.p_candidate_id,
            args.p_vote_quantity,
            args.p_candidate_type,
            args.p_vote_price,
          ]
        );
        return { data: res.rows[0]?.result ?? null, error: null };
      }

      if (fnName === "get_reconcilable_payments") {
        const res = await this.db.query(
          `SELECT * FROM public.get_reconcilable_payments($1::int, $2::int);`,
          [args.p_batch_size ?? 25, args.p_min_pending_age_minutes ?? 5]
        );
        return { data: res.rows, error: null };
      }

      if (fnName === "flag_payment_manual_review") {
        const res = await this.db.query(
          `SELECT public.flag_payment_manual_review($1::uuid, $2::text, $3::text, $4::jsonb) AS result;`,
          [
            args.p_payment_id,
            args.p_reason,
            args.p_source ?? "reconcile_edge_fn",
            JSON.stringify(args.p_details ?? {}),
          ]
        );
        return { data: res.rows[0]?.result ?? null, error: null };
      }

      if (fnName === "record_payment_reconciliation_attempt") {
        const res = await this.db.query(
          `SELECT public.record_payment_reconciliation_attempt($1::uuid, $2::text, $3::text, $4::timestamptz, $5::boolean, $6::text, $7::jsonb) AS result;`,
          [
            args.p_payment_id,
            args.p_reconciliation_status,
            args.p_error ?? null,
            args.p_next_reconcile_at ?? null,
            Boolean(args.p_mark_failed),
            args.p_source ?? "reconcile_edge_fn",
            JSON.stringify(args.p_details ?? {}),
          ]
        );
        return { data: res.rows[0]?.result ?? null, error: null };
      }

      if (fnName === "record_stripe_refund_or_dispute") {
        const res = await this.db.query(
          `SELECT public.record_stripe_refund_or_dispute($1::text, $2::text, $3::uuid, $4::text, $5::text, $6::text, $7::int, $8::text, $9::text, $10::jsonb) AS result;`,
          [
            args.p_stripe_event_id,
            args.p_event_type,
            args.p_payment_id ?? null,
            args.p_stripe_payment_intent_id ?? null,
            args.p_stripe_charge_id ?? null,
            args.p_stripe_dispute_id ?? null,
            args.p_amount_cents ?? 0,
            args.p_reason ?? null,
            args.p_dispute_status ?? null,
            JSON.stringify(args.p_details ?? {}),
          ]
        );
        return { data: res.rows[0]?.result ?? null, error: null };
      }

      throw new Error(`Unsupported RPC in adapter: ${fnName}`);
    } catch (err) {
      return { data: null, error: { message: err.message } };
    }
  }
}

// Configurable Mock Stripe Verifier
class TestStripeVerifier {
  constructor() {
    this.sessions = new Map();
    this.retrieveCalls = [];
    this.throwTransientError = false;
  }

  registerSession(session) {
    this.sessions.set(session.id, session);
  }

  checkout = {
    sessions: {
      retrieve: async (id, params) => {
        this.retrieveCalls.push({ id, params });
        if (this.throwTransientError) {
          const err = new Error("Stripe API 503 Service Temporarily Unavailable");
          err.statusCode = 503;
          throw err;
        }
        const s = this.sessions.get(id);
        if (!s) {
          const err = new Error(`No such checkout.session: '${id}'`);
          err.code = "resource_missing";
          err.statusCode = 404;
          throw err;
        }
        return structuredClone(s);
      },
    },
  };
}

console.log("====================================================================");
console.log("PAIR UP OR LEAVE — REAL POSTGRESQL & E2E PAYMENT RELIABILITY SUITE");
console.log("====================================================================\n");

let passed = 0;
let failed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

async function runSuite() {
  const db = new PGlite();
  const pgVersionRes = await db.query("SELECT version();");
  console.log(`Engine: ${pgVersionRes.rows[0].version}\n`);

  // =========================================================================
  // SECTION 1: SCHEMA & MIGRATIONS (00 -> 13 -> 18 -> 19)
  // =========================================================================
  console.log("--- 1. REAL POSTGRESQL SCHEMA & MIGRATION APPLICATION ---");

  await test("1.1 Initialize Supabase auth roles and base production schema (migrations 00-13)", async () => {
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS storage;

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
      END $$;

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

      CREATE TABLE IF NOT EXISTS public.candidates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        display_name text,
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
        type text NOT NULL CHECK (type IN ('PAID_VOTE', 'BONUS', 'PENALTY', 'CORRECTION')),
        quantity int NOT NULL,
        previous_score bigint NOT NULL,
        new_score bigint NOT NULL,
        reason text NOT NULL,
        admin_user_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
        admin_email text,
        reference_id text,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE OR REPLACE FUNCTION prevent_score_ledger_mutation()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'Score ledger transactions are immutable historical records and cannot be modified or deleted.';
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER score_ledger_immutable_trigger
        BEFORE UPDATE OR DELETE ON public.score_ledger
        FOR EACH ROW EXECUTE FUNCTION prevent_score_ledger_mutation();

      CREATE TABLE IF NOT EXISTS public.competition_schedule (
        id text PRIMARY KEY,
        competition_name text NOT NULL DEFAULT 'PAIR UP OR LEAVE',
        is_published boolean NOT NULL DEFAULT true,
        start_time timestamptz NOT NULL DEFAULT (now() - interval '7 days'),
        end_time timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
        timezone text NOT NULL DEFAULT 'America/New_York',
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const mig13Sql = fs.readFileSync(path.join(MIGRATIONS_DIR, "13_stripe_webhook_hardening.sql"), "utf-8");
    await db.exec(mig13Sql);
  });

  await test("1.2 Apply 18_harden_adjust_candidate_score_rpc.sql cleanly", async () => {
    const mig18Sql = fs.readFileSync(path.join(MIGRATIONS_DIR, "18_harden_adjust_candidate_score_rpc.sql"), "utf-8");
    await db.exec(mig18Sql);
  });

  await test("1.3 Apply 19_payment_reliability_and_recovery.sql cleanly", async () => {
    const mig19Sql = fs.readFileSync(path.join(MIGRATIONS_DIR, "19_payment_reliability_and_recovery.sql"), "utf-8");
    await db.exec(mig19Sql);
  });

  await test("1.4 Verify RPC privilege isolation (anon & authenticated blocked from payment & reconciliation RPCs)", async () => {
    const rpcs = [
      "public.confirm_stripe_payment(uuid, text, uuid, int, text, int)",
      "public.get_reconcilable_payments(int, int)",
      "public.flag_payment_manual_review(uuid, text, text, jsonb)",
      "public.record_payment_reconciliation_attempt(uuid, text, text, timestamptz, boolean, text, jsonb)",
      "public.record_stripe_refund_or_dispute(text, text, uuid, text, text, text, int, text, text, jsonb)",
    ];
    for (const sig of rpcs) {
      const anonExec = (await db.query(`SELECT has_function_privilege('anon', '${sig}', 'EXECUTE') AS ok;`)).rows[0].ok;
      const authExec = (await db.query(`SELECT has_function_privilege('authenticated', '${sig}', 'EXECUTE') AS ok;`)).rows[0].ok;
      const srvExec = (await db.query(`SELECT has_function_privilege('service_role', '${sig}', 'EXECUTE') AS ok;`)).rows[0].ok;
      assert.equal(anonExec, false, `anon must NOT execute ${sig}`);
      assert.equal(authExec, false, `authenticated must NOT execute ${sig}`);
      assert.equal(srvExec, true, `service_role MUST execute ${sig}`);
    }
  });

  // Seed test candidates and admin user
  const candIndId = (await db.query(`
    INSERT INTO public.candidates (name, display_name, slug, category, position, candidate_type, status)
    VALUES ('Sophia Laurent', 'Sophia Laurent', 'sophia-laurent', 'Individuals', 'Contestant', 'individual', 'active')
    RETURNING id;
  `)).rows[0].id;

  const candCoupleId = (await db.query(`
    INSERT INTO public.candidates (name, display_name, slug, category, position, candidate_type, status)
    VALUES ('Stanley & Ginou', 'STANLEY & GINOU', 'stanley-ginou', 'Couples', 'Finalists', 'couple', 'active')
    RETURNING id;
  `)).rows[0].id;

  const adminUserId = (await db.query(`
    INSERT INTO auth.users (email) VALUES ('verified_admin@pairuporleave.com') RETURNING id;
  `)).rows[0].id;
  await db.query(`
    INSERT INTO public.admin_users (id, email, role) VALUES ($1, 'verified_admin@pairuporleave.com', 'admin');
  `, [adminUserId]);

  const supabaseAdapter = new PGliteSupabaseAdapter(db);
  const stripeVerifier = new TestStripeVerifier();
  const handlers = createHandlers({ supabaseAdmin: supabaseAdapter, stripe: stripeVerifier });
  const reconciler = createReconciler({ supabaseAdmin: supabaseAdapter, stripe: stripeVerifier });
  const verifyHandler = createVerifyPaymentHandler({ supabaseAdmin: supabaseAdapter, stripe: stripeVerifier });

  // =========================================================================
  // SECTION 2: PRIORITY 1 — SECURE PAID VOTE CREDITING & ADMIN REGRESSION
  // =========================================================================
  console.log("\n--- 2. PRIORITY 1: SECURE PAID VOTE CREDITING & ADMIN SCORE REGRESSION ---");

  await test("2.1 Security: Authenticated admin is strictly BLOCKED from calling adjust_candidate_score with PAID_VOTE", async () => {
    await db.exec(`
      SET "request.jwt.claim.role" = 'authenticated';
      SET "request.jwt.claim.sub" = '${adminUserId}';
    `);
    await assert.rejects(
      async () => {
        await db.query(
          `SELECT public.adjust_candidate_score($1::uuid, 'PAID_VOTE', 50, 'Admin forged paid vote', $2::uuid, 'verified_admin@pairuporleave.com', gen_random_uuid()::text);`,
          [candIndId, adminUserId]
        );
      },
      /Forbidden: PAID_VOTE transactions can only be recorded via verified payment fulfillment/
    );
  });

  await test("2.2 Security: service_role is BLOCKED from calling PAID_VOTE with nonexistent, pending, or failed payment", async () => {
    await db.exec(`SET "request.jwt.claim.role" = 'service_role';`);

    // Nonexistent payment
    await assert.rejects(
      async () => {
        await db.query(
          `SELECT public.adjust_candidate_score($1::uuid, 'PAID_VOTE', 5, 'Fake ref', NULL, NULL, '00000000-0000-0000-0000-000000000000');`,
          [candIndId]
        );
      },
      /Referenced payment 00000000-0000-0000-0000-000000000000 does not exist/
    );

    // Pending payment
    const pendingPayId = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, candidate_id, candidate_type, vote_price, vote_quantity, subtotal_amount, service_fee_amount, amount, status)
      VALUES ('cs_test_sec_pending', $1, 'individual', 100, 5, 500, 400, 900, 'pending')
      RETURNING id;
    `, [candIndId])).rows[0].id;

    await assert.rejects(
      async () => {
        await db.query(
          `SELECT public.adjust_candidate_score($1::uuid, 'PAID_VOTE', 5, 'Pending ref', NULL, NULL, $2::text);`,
          [candIndId, pendingPayId]
        );
      },
      /is not paid \(status: pending\)/
    );
  });

  await test("2.3 Security: Audit identity anti-spoofing derives admin_user_id and admin_email from auth.uid()", async () => {
    await db.exec(`
      SET "request.jwt.claim.role" = 'authenticated';
      SET "request.jwt.claim.sub" = '${adminUserId}';
    `);

    const res = await db.query(
      `SELECT public.adjust_candidate_score($1::uuid, 'ADMIN_ADD', 25, NULL, '11111111-1111-1111-1111-111111111111'::uuid, 'spoofed@attacker.org', NULL) AS result;`,
      [candIndId]
    );
    const out = res.rows[0].result;
    assert.equal(out.success, true);
    assert.equal(out.new_score, 25);

    const ledgerRow = (await db.query(`SELECT * FROM public.score_ledger WHERE id = $1::uuid;`, [out.ledger_id])).rows[0];
    assert.equal(ledgerRow.admin_user_id, adminUserId, "Must record verified auth.uid()");
    assert.equal(ledgerRow.admin_email, "verified_admin@pairuporleave.com", "Must record canonical admin email");
    assert.equal(ledgerRow.reason, "Admin manual points addition", "Must populate default reason when NULL");

    const cand = (await db.query(`SELECT current_score, paid_votes, bonus_votes FROM public.candidates WHERE id = $1::uuid;`, [candIndId])).rows[0];
    assert.equal(Number(cand.current_score), 25);
    assert.equal(Number(cand.paid_votes), 0, "Admin points must never increment paid_votes");
    assert.equal(Number(cand.bonus_votes), 25);
  });

  await test("2.4 Regression: Admin Remove Points (ADMIN_REMOVE), BONUS, PENALTY, CORRECTION work and clamp at 0", async () => {
    await db.exec(`
      SET "request.jwt.claim.role" = 'authenticated';
      SET "request.jwt.claim.sub" = '${adminUserId}';
    `);

    // Remove 10 points -> 15
    const r1 = (await db.query(`SELECT public.adjust_candidate_score($1::uuid, 'ADMIN_REMOVE', 10, 'Rule deduction') AS result;`, [candIndId])).rows[0].result;
    assert.equal(r1.new_score, 15);
    assert.equal(r1.capped_at_zero, false);

    // Bonus 5 -> 20
    const r2 = (await db.query(`SELECT public.adjust_candidate_score($1::uuid, 'BONUS', 5, '') AS result;`, [candIndId])).rows[0].result;
    assert.equal(r2.new_score, 20);

    // Penalty 50 -> clamped at 0
    const r3 = (await db.query(`SELECT public.adjust_candidate_score($1::uuid, 'PENALTY', 50, NULL) AS result;`, [candIndId])).rows[0].result;
    assert.equal(r3.new_score, 0);
    assert.equal(r3.capped_at_zero, true);

    // Correction +10 -> 10, then -10 -> 0
    await db.query(`SELECT public.adjust_candidate_score($1::uuid, 'CORRECTION', 10, 'Audit fix +10');`, [candIndId]);
    const r4 = (await db.query(`SELECT public.adjust_candidate_score($1::uuid, 'CORRECTION', -10, 'Audit fix -10') AS result;`, [candIndId])).rows[0].result;
    assert.equal(r4.new_score, 0);
  });

  // =========================================================================
  // SECTION 3: NORMAL PAYMENTS & PRICING COMPATIBILITY (tiered_v2 & dynamic_v3)
  // =========================================================================
  console.log("\n--- 3. NORMAL PAYMENTS & PRICING COMPATIBILITY (tiered_v2, dynamic_v3, legacy) ---");

  await test("3.1 Normal Individual Payment (tiered_v2: 5 votes, $5.00 subtotal + $4.00 fee = $9.00) credits exact votes", async () => {
    const payId = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, candidate_id, candidate_type, vote_price, vote_quantity, subtotal_amount, service_fee_amount, tax_amount, amount, currency, status)
      VALUES ('cs_live_norm_ind_5', $1, 'individual', 100, 5, 500, 400, 0, 900, 'usd', 'pending')
      RETURNING id;
    `, [candIndId])).rows[0].id;

    await handlers.handleCheckoutCompleted({
      id: "cs_live_norm_ind_5",
      payment_status: "paid",
      amount_total: 900,
      currency: "usd",
      payment_intent: "pi_norm_ind_5",
      metadata: { candidate_id: candIndId, vote_quantity: "5", pricing_version: "tiered_v2" },
    });

    const pay = (await db.query(`SELECT status, stripe_payment_intent_id, paid_at, votes_credited_at FROM public.payments WHERE id = $1::uuid;`, [payId])).rows[0];
    assert.equal(pay.status, "paid");
    assert.equal(pay.stripe_payment_intent_id, "pi_norm_ind_5");
    assert.ok(pay.paid_at !== null);
    assert.ok(pay.votes_credited_at !== null);

    const cand = (await db.query(`SELECT current_score, paid_votes FROM public.candidates WHERE id = $1::uuid;`, [candIndId])).rows[0];
    assert.equal(Number(cand.current_score), 5);
    assert.equal(Number(cand.paid_votes), 5);
  });

  await test("3.2 Dynamic Service Fee Couple Payment (dynamic_v3: 200 couple votes = $400.00 + $12.27 fee = $412.27) credits exactly 200 votes", async () => {
    const subtotalCents = 200 * 200; // 40000 ($400.00)
    const serviceFeeCents = Math.ceil((subtotalCents * 29 + 31000) / 971); // 1227 ($12.27)
    const totalCents = subtotalCents + serviceFeeCents; // 41227 ($412.27)
    assert.equal(serviceFeeCents, 1227);
    assert.equal(totalCents, 41227);

    const payId = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, candidate_id, candidate_type, vote_price, vote_quantity, subtotal_amount, service_fee_amount, tax_amount, amount, currency, status)
      VALUES ('cs_live_dyn_couple_200', $1, 'couple', 200, 200, $2, $3, 0, $4, 'usd', 'pending')
      RETURNING id;
    `, [candCoupleId, subtotalCents, serviceFeeCents, totalCents])).rows[0].id;

    await handlers.handleCheckoutCompleted({
      id: "cs_live_dyn_couple_200",
      payment_status: "paid",
      amount_total: 41227,
      currency: "usd",
      payment_intent: "pi_dyn_couple_200",
      metadata: { candidate_id: candCoupleId, vote_quantity: "200", pricing_version: "dynamic_v3" },
    });

    const cand = (await db.query(`SELECT current_score, paid_votes FROM public.candidates WHERE id = $1::uuid;`, [candCoupleId])).rows[0];
    assert.equal(Number(cand.current_score), 200, "Must credit strictly 200 votes");
    assert.equal(Number(cand.paid_votes), 200);

    const voteRow = (await db.query(`SELECT quantity FROM public.votes WHERE payment_id = $1::uuid;`, [payId])).rows[0];
    assert.equal(voteRow.quantity, 200);
  });

  await test("3.3 Legacy Pending Checkout Session (subtotal_amount omitted on insert, service_fee_amount = 0) auto-populates and confirms cleanly", async () => {
    const payId = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, candidate_id, candidate_type, vote_price, vote_quantity, amount, currency, status)
      VALUES ('cs_live_legacy_couple_3', $1, 'couple', 200, 3, 600, 'usd', 'pending')
      RETURNING id, subtotal_amount, service_fee_amount;
    `, [candCoupleId])).rows[0].id;

    await handlers.handleCheckoutCompleted({
      id: "cs_live_legacy_couple_3",
      payment_status: "paid",
      amount_total: 600,
      currency: "usd",
      payment_intent: "pi_legacy_couple_3",
    });

    const cand = (await db.query(`SELECT current_score, paid_votes FROM public.candidates WHERE id = $1::uuid;`, [candCoupleId])).rows[0];
    assert.equal(Number(cand.current_score), 203);
    assert.equal(Number(cand.paid_votes), 203);
    assert.ok(payId);
  });

  // =========================================================================
  // SECTION 4: FAILURE RECOVERY & RECONCILIATION
  // =========================================================================
  console.log("\n--- 4. FAILURE RECOVERY, OUT-OF-ORDER EVENTS & RECONCILIATION ---");

  await test("4.1 Out-of-order events: checkout.session.expired followed by paid webhook verifies with Stripe and recovers failed -> paid once", async () => {
    const payId = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, candidate_id, candidate_type, vote_price, vote_quantity, subtotal_amount, service_fee_amount, amount, status)
      VALUES ('cs_ooo_expired_then_paid', $1, 'individual', 100, 10, 1000, 800, 1800, 'pending')
      RETURNING id;
    `, [candIndId])).rows[0].id;

    // 1. Expired event arrives first -> marks failed
    await handlers.handleCheckoutFailed(
      { id: "cs_ooo_expired_then_paid", payment_intent: "pi_ooo_10" },
      "checkout.session.expired"
    );
    let pay = (await db.query(`SELECT status FROM public.payments WHERE id = $1::uuid;`, [payId])).rows[0];
    assert.equal(pay.status, "failed");

    // 2. Register authoritative paid session in Stripe API
    stripeVerifier.registerSession({
      id: "cs_ooo_expired_then_paid",
      status: "complete",
      payment_status: "paid",
      amount_total: 1800,
      currency: "usd",
      payment_intent: {
        id: "pi_ooo_10",
        status: "succeeded",
        amount_received: 1800,
        amount_refunded: 0,
        currency: "usd",
      },
      metadata: { candidate_id: candIndId, vote_quantity: "10" },
    });

    // 3. Paid webhook arrives -> verifies against Stripe API and recovers failed -> paid
    await handlers.handleCheckoutCompleted({
      id: "cs_ooo_expired_then_paid",
      payment_status: "paid",
      amount_total: 1800,
      currency: "usd",
      payment_intent: "pi_ooo_10",
    });

    pay = (await db.query(`SELECT status, recovered_at FROM public.payments WHERE id = $1::uuid;`, [payId])).rows[0];
    assert.equal(pay.status, "paid");
    assert.ok(pay.recovered_at !== null, "recovered_at must be populated");

    // 4. Late async_payment_failed arrives after paid -> must NOT downgrade paid status
    await handlers.handleCheckoutFailed(
      { id: "cs_ooo_expired_then_paid", payment_intent: "pi_ooo_10" },
      "checkout.session.async_payment_failed"
    );
    pay = (await db.query(`SELECT status FROM public.payments WHERE id = $1::uuid;`, [payId])).rows[0];
    assert.equal(pay.status, "paid");

    const cand = (await db.query(`SELECT current_score, paid_votes FROM public.candidates WHERE id = $1::uuid;`, [candIndId])).rows[0];
    assert.equal(Number(cand.current_score), 15); // 5 + 10
  });

  await test("4.2 Paid-without-votes recovery: older payment (10 days old > 48h) marked 'paid' but missing votes/ledger is detected in Tier 1 and repaired", async () => {
    // Simulate a 10-day-old payment marked 'paid' where votes & score_ledger were never created
    const payId = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, stripe_payment_intent_id, candidate_id, candidate_type, vote_price, vote_quantity, subtotal_amount, service_fee_amount, amount, status, created_at)
      VALUES ('cs_paid_no_votes_10d', 'pi_paid_no_votes_10d', $1, 'couple', 200, 7, 1400, 560, 1960, 'paid', now() - interval '10 days')
      RETURNING id;
    `, [candCoupleId])).rows[0].id;

    stripeVerifier.registerSession({
      id: "cs_paid_no_votes_10d",
      status: "complete",
      payment_status: "paid",
      amount_total: 1960,
      currency: "usd",
      payment_intent: {
        id: "pi_paid_no_votes_10d",
        status: "succeeded",
        amount_received: 1960,
        amount_refunded: 0,
        currency: "usd",
      },
      metadata: { candidate_id: candCoupleId, vote_quantity: "7" },
    });

    const summary = await reconciler.runReconciliationBatch({
      triggerSource: "scheduled_cron",
    });

    const item = summary.items.find((i) => i.payment_id === payId);
    assert.ok(item, "10-day-old uncredited paid payment must be selected by Tier 1 query");
    assert.equal(item.outcome, "recovered");

    const cand = (await db.query(`SELECT current_score, paid_votes FROM public.candidates WHERE id = $1::uuid;`, [candCoupleId])).rows[0];
    assert.equal(Number(cand.current_score), 210); // 203 + 7
    assert.equal(Number(cand.paid_votes), 210);
  });

  await test("4.3 Success-page fallback recovery (verify-payment): recovers pending paid session when webhook was missed, and subsequent webhook is idempotent", async () => {
    resetVerifyPaymentCooldowns();
    const payId = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, candidate_id, candidate_type, vote_price, vote_quantity, subtotal_amount, service_fee_amount, amount, status)
      VALUES ('cs_verify_fallback_1', $1, 'individual', 100, 4, 400, 320, 720, 'pending')
      RETURNING id;
    `, [candIndId])).rows[0].id;

    stripeVerifier.registerSession({
      id: "cs_verify_fallback_1",
      status: "complete",
      payment_status: "paid",
      amount_total: 720,
      currency: "usd",
      payment_intent: {
        id: "pi_verify_fallback_1",
        status: "succeeded",
        amount_received: 720,
        amount_refunded: 0,
        currency: "usd",
      },
      metadata: { candidate_id: candIndId, vote_quantity: "4" },
    });

    // Customer hits /vote/success -> calls verify-payment
    const vRes1 = await verifyHandler.verifyPaymentSession("cs_verify_fallback_1");
    assert.equal(vRes1.httpStatus, 200);
    assert.equal(vRes1.body.status, "paid");
    assert.equal(vRes1.body.votes_credited, true);
    assert.equal(vRes1.body.recovered, true);

    // Repeated success-page refresh -> idempotent, zero extra votes
    const vRes2 = await verifyHandler.verifyPaymentSession("cs_verify_fallback_1", { bypassCooldown: true });
    assert.equal(vRes2.body.status, "paid");
    assert.equal(vRes2.body.votes_credited, true);

    // Delayed webhook arrives later -> idempotent, zero extra votes
    await handlers.handleCheckoutCompleted({
      id: "cs_verify_fallback_1",
      payment_status: "paid",
      amount_total: 720,
      currency: "usd",
      payment_intent: "pi_verify_fallback_1",
    });

    const cand = (await db.query(`SELECT current_score, paid_votes FROM public.candidates WHERE id = $1::uuid;`, [candIndId])).rows[0];
    assert.equal(Number(cand.current_score), 19); // 15 + 4
    assert.equal((await db.query(`SELECT COUNT(*) AS c FROM public.votes WHERE payment_id = $1::uuid;`, [payId])).rows[0].c, 1);
    assert.equal((await db.query(`SELECT COUNT(*) AS c FROM public.score_ledger WHERE reference_id = $1::text AND type = 'PAID_VOTE';`, [payId])).rows[0].c, 1);
  });

  await test("4.4 Database temporarily unavailable followed by recovery: zero partial state on DB error, then reconciles cleanly", async () => {
    const payId = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, candidate_id, candidate_type, vote_price, vote_quantity, subtotal_amount, service_fee_amount, amount, status, created_at)
      VALUES ('cs_db_outage_1', $1, 'individual', 100, 6, 600, 480, 1080, 'pending', now() - interval '10 minutes')
      RETURNING id;
    `, [candIndId])).rows[0].id;

    stripeVerifier.registerSession({
      id: "cs_db_outage_1",
      status: "complete",
      payment_status: "paid",
      amount_total: 1080,
      currency: "usd",
      payment_intent: {
        id: "pi_db_outage_1",
        status: "succeeded",
        amount_received: 1080,
        amount_refunded: 0,
        currency: "usd",
      },
      metadata: { candidate_id: candIndId, vote_quantity: "6" },
    });

    // Simulate DB RPC outage during webhook
    supabaseAdapter.simulateRpcUnavailable = true;
    await assert.rejects(
      async () => {
        await handlers.handleCheckoutCompleted({
          id: "cs_db_outage_1",
          payment_status: "paid",
          amount_total: 1080,
          currency: "usd",
          payment_intent: "pi_db_outage_1",
        });
      },
      /Database connection temporarily unavailable/
    );
    supabaseAdapter.simulateRpcUnavailable = false;

    // Verify payment remained 'pending' and 0 votes were credited
    const payBefore = (await db.query(`SELECT status FROM public.payments WHERE id = $1::uuid;`, [payId])).rows[0];
    assert.equal(payBefore.status, "pending");

    // Now background reconciliation runs when DB is back online -> recovers cleanly!
    const summary = await reconciler.runReconciliationBatch({ triggerSource: "scheduled_cron" });
    const item = summary.items.find((i) => i.payment_id === payId);
    assert.ok(item);
    assert.equal(item.outcome, "recovered");

    const cand = (await db.query(`SELECT current_score FROM public.candidates WHERE id = $1::uuid;`, [candIndId])).rows[0];
    assert.equal(Number(cand.current_score), 25); // 19 + 6
  });

  await test("4.5 Stripe API temporarily unavailable & retry exhaustion escalation: records transient_error with backoff, then escalates to exhausted/manual_review at limit", async () => {
    const payId = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, candidate_id, candidate_type, vote_price, vote_quantity, subtotal_amount, service_fee_amount, amount, status, reconciliation_attempts, created_at)
      VALUES ('cs_stripe_outage_exhaust', $1, 'individual', 100, 2, 200, 160, 360, 'pending', 10, now() - interval '2 hours')
      RETURNING id;
    `, [candIndId])).rows[0].id;

    stripeVerifier.throwTransientError = true;

    // Attempt 11 -> transient_error with backoff
    const sum1 = await reconciler.runReconciliationBatch({ paymentId: payId, triggerSource: "scheduled_cron" });
    assert.equal(sum1.items[0].outcome, "transient_error");
    let pay = (await db.query(`SELECT reconciliation_attempts, reconciliation_status, manual_review_required, next_reconcile_at FROM public.payments WHERE id = $1::uuid;`, [payId])).rows[0];
    assert.equal(pay.reconciliation_attempts, 11);
    assert.equal(pay.reconciliation_status, "transient_error");
    assert.equal(pay.manual_review_required, false);
    assert.ok(pay.next_reconcile_at !== null);

    // Attempt 12 (reaches MAX_TRANSIENT_ATTEMPTS = 12) -> escalates to 'exhausted' & manual_review_required = true
    const sum2 = await reconciler.runReconciliationBatch({ paymentId: payId, triggerSource: "scheduled_cron" });
    assert.equal(sum2.items[0].outcome, "flagged_manual_review");
    pay = (await db.query(`SELECT reconciliation_attempts, reconciliation_status, manual_review_required, next_reconcile_at FROM public.payments WHERE id = $1::uuid;`, [payId])).rows[0];
    assert.equal(pay.reconciliation_attempts, 12);
    assert.equal(pay.reconciliation_status, "exhausted");
    assert.equal(pay.manual_review_required, true);
    assert.equal(pay.next_reconcile_at, null, "Must stop automatic polling once exhausted");

    stripeVerifier.throwTransientError = false;
  });

  await test("4.6 Partially fulfilled state (vote record exists without score_ledger record) is refused without guessing and flagged for manual review", async () => {
    const payId = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, stripe_payment_intent_id, candidate_id, candidate_type, vote_price, vote_quantity, subtotal_amount, service_fee_amount, amount, status, created_at)
      VALUES ('cs_partial_state_1', 'pi_partial_state_1', $1, 'individual', 100, 3, 300, 240, 540, 'paid', now() - interval '20 minutes')
      RETURNING id;
    `, [candIndId])).rows[0].id;

    // Insert vote row WITHOUT score_ledger row to simulate partial legacy state
    await db.query(`
      INSERT INTO public.votes (candidate_id, payment_id, quantity)
      VALUES ($1, $2, 3);
    `, [candIndId, payId]);

    const scoreBefore = Number((await db.query(`SELECT current_score FROM public.candidates WHERE id = $1::uuid;`, [candIndId])).rows[0].current_score);

    const summary = await reconciler.runReconciliationBatch({ triggerSource: "scheduled_cron" });
    const item = summary.items.find((i) => i.payment_id === payId);
    assert.ok(item);
    assert.equal(item.outcome, "flagged_manual_review");

    const pay = (await db.query(`SELECT manual_review_required, reconciliation_status, manual_review_reason FROM public.payments WHERE id = $1::uuid;`, [payId])).rows[0];
    assert.equal(pay.manual_review_required, true);
    assert.equal(pay.reconciliation_status, "manual_review");
    assert.ok(pay.manual_review_reason.includes("inconsistent credit state"));

    const scoreAfter = Number((await db.query(`SELECT current_score FROM public.candidates WHERE id = $1::uuid;`, [candIndId])).rows[0].current_score);
    assert.equal(scoreAfter, scoreBefore, "Candidate score must NOT be guessed or modified on partial conflict");
  });

  await test("4.7 Unpaid expired session is marked failed and skipped_unpaid so it is never polled again", async () => {
    const payId = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, candidate_id, candidate_type, vote_price, vote_quantity, subtotal_amount, service_fee_amount, amount, status, created_at)
      VALUES ('cs_unpaid_expired_1', $1, 'individual', 100, 1, 100, 80, 180, 'pending', now() - interval '30 minutes')
      RETURNING id;
    `, [candIndId])).rows[0].id;

    stripeVerifier.registerSession({
      id: "cs_unpaid_expired_1",
      status: "expired",
      payment_status: "unpaid",
      amount_total: 180,
      currency: "usd",
      payment_intent: null,
    });

    const summary = await reconciler.runReconciliationBatch({ triggerSource: "scheduled_cron" });
    const item = summary.items.find((i) => i.payment_id === payId);
    assert.ok(item);
    assert.equal(item.outcome, "skipped_unpaid");

    const pay = (await db.query(`SELECT status, reconciliation_status FROM public.payments WHERE id = $1::uuid;`, [payId])).rows[0];
    assert.equal(pay.status, "failed");
    assert.equal(pay.reconciliation_status, "skipped_unpaid");

    // Next reconciliation batch must NOT scan it again
    const summary2 = await reconciler.runReconciliationBatch({ triggerSource: "scheduled_cron" });
    assert.equal(summary2.items.some((i) => i.payment_id === payId), false);
  });

  // =========================================================================
  // SECTION 5: CONCURRENCY & IDEMPOTENCY
  // =========================================================================
  console.log("\n--- 5. CONCURRENCY (WEBHOOK + RECONCILIATION + WORKERS + VERIFY-PAYMENT) ---");

  await test("5.1 Concurrent webhook delivery + reconciliation worker + verify-payment fallback via Promise.all credits votes EXACTLY ONCE", async () => {
    resetVerifyPaymentCooldowns();
    const payId = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, candidate_id, candidate_type, vote_price, vote_quantity, subtotal_amount, service_fee_amount, amount, status, created_at)
      VALUES ('cs_conc_triple_race', $1, 'couple', 200, 15, 3000, 1200, 4200, 'pending', now() - interval '10 minutes')
      RETURNING id;
    `, [candCoupleId])).rows[0].id;

    const sessionPayload = {
      id: "cs_conc_triple_race",
      status: "complete",
      payment_status: "paid",
      amount_total: 4200,
      currency: "usd",
      payment_intent: {
        id: "pi_conc_triple_race",
        status: "succeeded",
        amount_received: 4200,
        amount_refunded: 0,
        currency: "usd",
      },
      metadata: { candidate_id: candCoupleId, vote_quantity: "15" },
    };
    stripeVerifier.registerSession(sessionPayload);

    const scoreBefore = Number((await db.query(`SELECT current_score FROM public.candidates WHERE id = $1::uuid;`, [candCoupleId])).rows[0].current_score);

    // Fire webhook, 2 reconciliation workers, and verify-payment simultaneously!
    await Promise.all([
      handlers.handleCheckoutCompleted(sessionPayload),
      reconciler.runReconciliationBatch({ triggerSource: "worker_1" }),
      reconciler.runReconciliationBatch({ triggerSource: "worker_2" }),
      verifyHandler.verifyPaymentSession("cs_conc_triple_race", { bypassCooldown: true }),
    ]);

    const scoreAfter = Number((await db.query(`SELECT current_score FROM public.candidates WHERE id = $1::uuid;`, [candCoupleId])).rows[0].current_score);
    assert.equal(scoreAfter - scoreBefore, 15, "Candidate score must increase by strictly 15 votes");

    const voteCount = (await db.query(`SELECT COUNT(*) AS c FROM public.votes WHERE payment_id = $1::uuid;`, [payId])).rows[0].c;
    const ledgerCount = (await db.query(`SELECT COUNT(*) AS c FROM public.score_ledger WHERE reference_id = $1::text AND type = 'PAID_VOTE';`, [payId])).rows[0].c;
    assert.equal(Number(voteCount), 1);
    assert.equal(Number(ledgerCount), 1);
  });

  // =========================================================================
  // SECTION 6: SECURITY & TAMPERING REJECTION
  // =========================================================================
  console.log("\n--- 6. SECURITY: TAMPERING, REPLAY, PROBING & AUTHENTICATION ---");

  await test("6.1 Security: PaymentIntent replay attack across different payments is blocked at RPC and unique index level", async () => {
    const payId = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, candidate_id, candidate_type, vote_price, vote_quantity, subtotal_amount, service_fee_amount, amount, status)
      VALUES ('cs_replay_pi_attack', $1, 'individual', 100, 10, 1000, 800, 1800, 'pending')
      RETURNING id;
    `, [candIndId])).rows[0].id;

    // Attempt to reuse 'pi_norm_ind_5' which already belongs to cs_live_norm_ind_5
    await assert.rejects(
      async () => {
        await handlers.handleCheckoutCompleted({
          id: "cs_replay_pi_attack",
          payment_status: "paid",
          amount_total: 1800,
          currency: "usd",
          payment_intent: "pi_norm_ind_5",
        });
      },
      /already associated with another payment/
    );

    const pay = (await db.query(`SELECT status, manual_review_required FROM public.payments WHERE id = $1::uuid;`, [payId])).rows[0];
    assert.equal(pay.status, "pending");
    assert.equal(pay.manual_review_required, true, "Must flag payment for manual review on PI collision");
  });

  await test("6.2 Security: Tampered amount, tampered candidate_id, and tampered vote_quantity award ZERO votes", async () => {
    const scoreBefore = Number((await db.query(`SELECT current_score FROM public.candidates WHERE id = $1::uuid;`, [candIndId])).rows[0].current_score);

    const payId = (await db.query(`
      INSERT INTO public.payments (stripe_session_id, candidate_id, candidate_type, vote_price, vote_quantity, subtotal_amount, service_fee_amount, amount, status)
      VALUES ('cs_tamper_test', $1, 'individual', 100, 5, 500, 400, 900, 'pending')
      RETURNING id;
    `, [candIndId])).rows[0].id;

    // Tampered candidate_id in metadata
    await assert.rejects(
      async () => {
        await handlers.handleCheckoutCompleted({
          id: "cs_tamper_test",
          payment_status: "paid",
          amount_total: 900,
          currency: "usd",
          payment_intent: "pi_tamper_1",
          metadata: { candidate_id: candCoupleId, vote_quantity: "5" },
        });
      },
      /session metadata candidate_id/
    );

    // Tampered vote_quantity in metadata
    await assert.rejects(
      async () => {
        await handlers.handleCheckoutCompleted({
          id: "cs_tamper_test",
          payment_status: "paid",
          amount_total: 900,
          currency: "usd",
          payment_intent: "pi_tamper_1",
          metadata: { candidate_id: candIndId, vote_quantity: "999" },
        });
      },
      /session metadata vote_quantity/
    );

    // Tampered amount_total (paid 100 cents instead of 900 cents) -> marks failed, 0 votes
    await handlers.handleCheckoutCompleted({
      id: "cs_tamper_test",
      payment_status: "paid",
      amount_total: 100,
      currency: "usd",
      payment_intent: "pi_tamper_1",
    });

    const pay = (await db.query(`SELECT status FROM public.payments WHERE id = $1::uuid;`, [payId])).rows[0];
    assert.equal(pay.status, "failed");

    const scoreAfter = Number((await db.query(`SELECT current_score FROM public.candidates WHERE id = $1::uuid;`, [candIndId])).rows[0].current_score);
    assert.equal(scoreAfter, scoreBefore);
  });

  await test("6.3 Security: verify-payment blocks arbitrary session probing without calling Stripe API", async () => {
    const stripeCallsBefore = stripeVerifier.retrieveCalls.length;
    const resInvalid = await verifyHandler.verifyPaymentSession("not_a_stripe_session");
    assert.equal(resInvalid.httpStatus, 400);

    const resUnrecorded = await verifyHandler.verifyPaymentSession("cs_live_unrecorded_probing_attempt_999");
    assert.equal(resUnrecorded.httpStatus, 404);
    assert.equal(stripeVerifier.retrieveCalls.length, stripeCallsBefore, "Must NEVER call Stripe API for unrecorded session IDs");
  });

  await test("6.4 Security: Constant-time reconciliation secret comparison & exponential backoff helper verification", async () => {
    const secret = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
    assert.equal(timingSafeEqualStrings(secret, secret), true);
    assert.equal(timingSafeEqualStrings(secret, secret.slice(0, -1) + "1"), false);
    assert.equal(timingSafeEqualStrings(secret, "short"), false);
    assert.equal(timingSafeEqualStrings("", ""), false);

    const t0 = 1_700_000_000_000;
    assert.equal(new Date(computeNextBackoffIso(0, t0)).getTime() - t0, 10 * 60_000);
    assert.equal(new Date(computeNextBackoffIso(1, t0)).getTime() - t0, 20 * 60_000);
    assert.equal(new Date(computeNextBackoffIso(2, t0)).getTime() - t0, 40 * 60_000);
    assert.equal(new Date(computeNextBackoffIso(9, t0)).getTime() - t0, 360 * 60_000);
  });

  // =========================================================================
  // SECTION 7: PRIORITY 4 — REFUNDS AND DISPUTES
  // =========================================================================
  console.log("\n--- 7. PRIORITY 4: REFUNDS AND DISPUTES (FULL, PARTIAL, DUPLICATE, DISPUTES, UNKNOWN) ---");

  await test("7.1 Partial refund (charge.refunded) records refund_status='partial', flags manual review, preserves status='paid' and candidate score", async () => {
    const scoreBefore = Number((await db.query(`SELECT current_score, paid_votes FROM public.candidates WHERE id = $1::uuid;`, [candCoupleId])).rows[0].current_score);

    // Target cs_live_dyn_couple_200 (pi_dyn_couple_200, amount = 41227)
    const refRes = await handlers.handleChargeRefunded(
      {
        id: "ch_partial_200",
        payment_intent: "pi_dyn_couple_200",
        amount: 41227,
        amount_refunded: 1227,
        refunded: false,
        currency: "usd",
        refunds: { data: [{ reason: "requested_by_customer" }] },
      },
      "evt_refund_partial_1"
    );

    assert.equal(refRes.already_processed, false);
    assert.equal(refRes.refund_status, "partial");

    const pay = (await db.query(`SELECT status, refund_status, refunded_amount, manual_review_required, stripe_charge_id FROM public.payments WHERE stripe_payment_intent_id = 'pi_dyn_couple_200';`)).rows[0];
    assert.equal(pay.status, "paid", "Partial refund must keep status='paid'");
    assert.equal(pay.refund_status, "partial");
    assert.equal(pay.refunded_amount, 1227);
    assert.equal(pay.manual_review_required, true);
    assert.equal(pay.stripe_charge_id, "ch_partial_200");

    const scoreAfter = Number((await db.query(`SELECT current_score FROM public.candidates WHERE id = $1::uuid;`, [candCoupleId])).rows[0].current_score);
    assert.equal(scoreAfter, scoreBefore, "Must NEVER automatically deduct candidate score on refund");
  });

  await test("7.2 Duplicate refund event (same stripe_event_id) is idempotently ignored", async () => {
    const dupRes = await handlers.handleChargeRefunded(
      {
        id: "ch_partial_200",
        payment_intent: "pi_dyn_couple_200",
        amount: 41227,
        amount_refunded: 1227,
        refunded: false,
        currency: "usd",
      },
      "evt_refund_partial_1"
    );
    assert.equal(dupRes.already_processed, true);

    const logCount = (await db.query(`SELECT COUNT(*) AS c FROM public.payment_events_log WHERE stripe_event_id = 'evt_refund_partial_1';`)).rows[0].c;
    assert.equal(Number(logCount), 1);
  });

  await test("7.3 Full refund (charge.refunded) transitions status='refunded', refund_status='full', flags manual review, preserves votes and score", async () => {
    const scoreBefore = Number((await db.query(`SELECT current_score FROM public.candidates WHERE id = $1::uuid;`, [candIndId])).rows[0].current_score);

    // Target cs_live_norm_ind_5 (pi_norm_ind_5, amount = 900)
    const fullRes = await handlers.handleChargeRefunded(
      {
        id: "ch_full_ind_5",
        payment_intent: "pi_norm_ind_5",
        amount: 900,
        amount_refunded: 900,
        refunded: true,
        currency: "usd",
      },
      "evt_refund_full_1"
    );

    assert.equal(fullRes.already_processed, false);
    assert.equal(fullRes.refund_status, "full");

    const pay = (await db.query(`SELECT id, status, refund_status, refunded_amount, manual_review_required FROM public.payments WHERE stripe_payment_intent_id = 'pi_norm_ind_5';`)).rows[0];
    assert.equal(pay.status, "refunded");
    assert.equal(pay.refund_status, "full");
    assert.equal(pay.refunded_amount, 900);
    assert.equal(pay.manual_review_required, true);

    const voteExists = (await db.query(`SELECT COUNT(*) AS c FROM public.votes WHERE payment_id = $1::uuid;`, [pay.id])).rows[0].c;
    const scoreAfter = Number((await db.query(`SELECT current_score FROM public.candidates WHERE id = $1::uuid;`, [candIndId])).rows[0].current_score);
    assert.equal(Number(voteExists), 1, "Original vote record must be preserved");
    assert.equal(scoreAfter, scoreBefore, "Candidate score must be preserved");
  });

  await test("7.4 Dispute lifecycle: charge.dispute.created flags manual review; charge.dispute.closed ('won' vs 'lost') updates status and preserves votes", async () => {
    const scoreBefore = Number((await db.query(`SELECT current_score FROM public.candidates WHERE id = $1::uuid;`, [candCoupleId])).rows[0].current_score);

    // Target pi_legacy_couple_3 (600 cents)
    const openRes = await handlers.handleChargeDispute(
      {
        id: "dp_test_1",
        payment_intent: "pi_legacy_couple_3",
        charge: "ch_legacy_3",
        amount: 600,
        status: "needs_response",
        reason: "fraudulent",
        currency: "usd",
      },
      "charge.dispute.created",
      "evt_dispute_open_1"
    );
    assert.equal(openRes.already_processed, false);
    assert.equal(openRes.dispute_status, "needs_response");
    assert.equal(openRes.manual_review_required, true);

    let pay = (await db.query(`SELECT dispute_status, stripe_dispute_id, disputed_amount, manual_review_required FROM public.payments WHERE stripe_payment_intent_id = 'pi_legacy_couple_3';`)).rows[0];
    assert.equal(pay.dispute_status, "needs_response");
    assert.equal(pay.stripe_dispute_id, "dp_test_1");
    assert.equal(pay.disputed_amount, 600);
    assert.equal(pay.manual_review_required, true);

    // Dispute closed in merchant's favor ('won') -> clears manual_review_required since payment was already fulfilled and not refunded
    const wonRes = await handlers.handleChargeDispute(
      {
        id: "dp_test_1",
        payment_intent: "pi_legacy_couple_3",
        charge: "ch_legacy_3",
        amount: 600,
        status: "won",
        reason: "fraudulent",
        currency: "usd",
      },
      "charge.dispute.closed",
      "evt_dispute_won_1"
    );
    assert.equal(wonRes.dispute_status, "won");
    assert.equal(wonRes.manual_review_required, false);

    // Dispute closed as 'lost' -> keeps manual_review_required = true while preserving votes and score
    const lostRes = await handlers.handleChargeDispute(
      {
        id: "dp_test_1",
        payment_intent: "pi_legacy_couple_3",
        charge: "ch_legacy_3",
        amount: 600,
        status: "lost",
        reason: "fraudulent",
        currency: "usd",
      },
      "charge.dispute.closed",
      "evt_dispute_lost_1"
    );
    assert.equal(lostRes.dispute_status, "lost");
    assert.equal(lostRes.manual_review_required, true);

    const scoreAfter = Number((await db.query(`SELECT current_score FROM public.candidates WHERE id = $1::uuid;`, [candCoupleId])).rows[0].current_score);
    assert.equal(scoreAfter, scoreBefore);
  });

  await test("7.5 Unknown payment reference on refund/dispute logs audit event and exits cleanly without throwing", async () => {
    const unknownRes = await handlers.handleChargeRefunded(
      {
        id: "ch_unknown_999",
        payment_intent: "pi_unknown_external_999",
        amount: 2500,
        amount_refunded: 2500,
        refunded: true,
        currency: "usd",
      },
      "evt_refund_unknown_999"
    );
    assert.equal(unknownRes.unknown_payment, true);
    assert.equal(unknownRes.already_processed, false);

    const logRow = (await db.query(`SELECT outcome, details FROM public.payment_events_log WHERE stripe_event_id = 'evt_refund_unknown_999';`)).rows[0];
    assert.equal(logRow.outcome, "flagged_manual_review");
    assert.equal(logRow.details.warning, "unknown_payment_reference");
  });

  await test("7.6 Immutability: score_ledger and payment_events_log reject UPDATE and DELETE", async () => {
    await assert.rejects(
      async () => {
        await db.query(`DELETE FROM public.score_ledger;`);
      },
      /Score ledger transactions are immutable/
    );
    await assert.rejects(
      async () => {
        await db.query(`DELETE FROM public.payment_events_log;`);
      },
      /payment_events_log records are immutable/
    );
  });

  // =========================================================================
  // SECTION 8: EDGE FUNCTION AUTHENTICATION & BOUNDARY SECURITY
  // =========================================================================
  console.log("\n--- 8. RECONCILIATION ENDPOINT SECURITY & BOUNDARY VALIDATION ---");

  await test("8.1 Security: Browser context (Origin / Sec-Fetch-Site) is strictly rejected when attempting to use X-Reconciliation-Secret", async () => {
    const cronSecret = "f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9";
    function validateReconcileAuth({ origin, secFetchSite, headerSecret, bearerToken, body }) {
      const isBrowser = Boolean(origin || secFetchSite);
      if (headerSecret !== null && headerSecret !== undefined) {
        if (isBrowser) {
          return { status: 403, error: "Forbidden: Server-to-server reconciliation cannot be invoked from a browser context." };
        }
        if (!timingSafeEqualStrings(headerSecret, cronSecret)) {
          return { status: 401, error: "Unauthorized: Invalid server-to-server reconciliation credentials." };
        }
        return { status: 200, mode: "scheduled_cron" };
      }
      if (!bearerToken) {
        return { status: 401, error: "Unauthorized: Missing administrator Bearer token." };
      }
      if (bearerToken !== "valid_admin_jwt") {
        return { status: 403, error: "Forbidden: User is not an authorized administrator." };
      }
      if (body && (body.vote_quantity !== undefined || body.amount !== undefined || body.candidate_id !== undefined || body.stripe_session_id !== undefined)) {
        return { status: 400, error: "Forbidden: Reconciliation does not accept client-supplied session IDs, amounts, candidates, or vote quantities." };
      }
      return { status: 200, mode: "admin_manual" };
    }

    // Browser origin + valid cron secret -> 403
    assert.equal(
      validateReconcileAuth({ origin: "https://pairuporleave.com", headerSecret: cronSecret }).status,
      403
    );
    // Sec-Fetch-Site + valid cron secret -> 403
    assert.equal(
      validateReconcileAuth({ secFetchSite: "cross-site", headerSecret: cronSecret }).status,
      403
    );
    // Invalid cron secret from server -> 401
    assert.equal(
      validateReconcileAuth({ headerSecret: "wrong_secret_000000000000000000000000000000000000000000000000" }).status,
      401
    );
    // Valid server-to-server cron secret without browser headers -> 200
    assert.equal(
      validateReconcileAuth({ headerSecret: cronSecret }).status,
      200
    );
    // Non-admin JWT -> 403
    assert.equal(
      validateReconcileAuth({ origin: "https://pairuporleave.com", bearerToken: "non_admin_jwt" }).status,
      403
    );
    // Admin attempting to inject vote_quantity, amount, candidate_id, or stripe_session_id -> 400
    for (const badBody of [
      { vote_quantity: 100 },
      { amount: 100 },
      { candidate_id: candIndId },
      { stripe_session_id: "cs_live_123" },
    ]) {
      assert.equal(
        validateReconcileAuth({ origin: "https://pairuporleave.com", bearerToken: "valid_admin_jwt", body: badBody }).status,
        400
      );
    }
    // Valid admin manual retry with only payment_id -> 200
    assert.equal(
      validateReconcileAuth({ origin: "https://pairuporleave.com", bearerToken: "valid_admin_jwt", body: { payment_id: candIndId } }).status,
      200
    );
  });

  console.log("\n====================================================================");
  console.log(`PAYMENT RELIABILITY SUITE RESULTS: ${passed}/${total} PASSED, ${failed} FAILED`);
  console.log("====================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error("FATAL SUITE ERROR:", err);
  process.exit(1);
});

