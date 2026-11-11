// Deno test: create-checkout-session end-to-end with MOCKED Stripe + Supabase (global fetch is stubbed).
// No network, no real Stripe, no real database. Run:
//   deno test --node-modules-dir=auto --allow-env --allow-read supabase/functions/create-checkout-session/test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("STRIPE_SECRET_KEY", "sk_test_mock_key_for_unit_tests");
Deno.env.set("SUPABASE_URL", "https://mock-project.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "mock-service-role");
Deno.env.set("SITE_URL", "https://pairuporleave.com");
Deno.env.set("ENVIRONMENT", "production");

// ---- capture the Deno.serve handler instead of opening a port ----
// deno-lint-ignore no-explicit-any
let handler: (req: Request) => Promise<Response> = null as any;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: (req: Request) => Promise<Response>) => {
  handler = h;
  return {};
};

// ---- mock state ----
interface Recorded {
  stripeBodies: URLSearchParams[];
  paymentInserts: Record<string, unknown>[];
}
let rec: Recorded;
let candidateType: "individual" | "couple" = "couple";
let candidateStatus = "active";
let scheduleEndTime = new Date(Date.now() + 86_400_000).toISOString();

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
  const req = new Request(input, init);
  const url = new URL(req.url);
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

  if (url.hostname === "api.stripe.com") {
    const body = new URLSearchParams(await req.text());
    rec.stripeBodies.push(body);
    return json({ id: "cs_test_mock123", object: "checkout.session", url: "https://checkout.stripe.com/c/pay/cs_test_mock123" });
  }
  if (url.hostname === "mock-project.supabase.co") {
    if (url.pathname.endsWith("/candidates")) {
      return json({
        id: "11111111-1111-4111-8111-111111111111",
        name: "Mock Candidate",
        display_name: "Mock Couple",
        candidate_type: candidateType,
        status: candidateStatus,
        category: "Couples",
      });
    }
    if (url.pathname.endsWith("/competition_schedule")) {
      return json({
        id: "active",
        competition_name: "PAIR UP OR LEAVE",
        is_published: true,
        start_time: new Date(Date.now() - 86_400_000).toISOString(),
        end_time: scheduleEndTime,
        timezone: "America/New_York",
      });
    }
    if (url.pathname.endsWith("/payments") && req.method === "POST") {
      rec.paymentInserts.push(JSON.parse(await req.text()));
      return new Response(null, { status: 201 });
    }
  }
  return realFetch(input, init);
}) as typeof fetch;

await import("./index.ts");

const CANDIDATE_ID = "11111111-1111-4111-8111-111111111111";

function call(body: Record<string, unknown>, origin: string | null = "https://pairuporleave.com") {
  const headers: Record<string, string> = { "Content-Type": "application/json", "x-real-ip": "unknown" };
  if (origin) headers["origin"] = origin;
  return handler(new Request("https://mock-project.supabase.co/functions/v1/create-checkout-session", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }));
}

/** Sum the Stripe line items exactly as Stripe computes the session amount. */
function stripeTotalCents(p: URLSearchParams): number {
  let total = 0;
  for (let i = 0; ; i++) {
    const amt = p.get(`line_items[${i}][price_data][unit_amount]`);
    if (amt === null) break;
    total += Number(amt) * Number(p.get(`line_items[${i}][quantity]`));
  }
  return total;
}

function setup(opts: { fee: boolean; type?: "individual" | "couple" }) {
  rec = { stripeBodies: [], paymentInserts: [] };
  candidateType = opts.type ?? "couple";
  candidateStatus = "active";
  scheduleEndTime = new Date(Date.now() + 86_400_000).toISOString();
  Deno.env.set("ENABLE_PLATFORM_SERVICE_FEE", opts.fee ? "true" : "false");
}

const OPTS = { sanitizeOps: false, sanitizeResources: false };

Deno.test({ name: "couple examples: Stripe amount == frontend-displayed total == DB amount; votes credited == quantity", ...OPTS, fn: async () => {
  const expected: Record<number, number> = { 1: 280, 10: 2800, 19: 5320, 20: 5000, 21: 5250, 50: 12500, 100: 25000, 1000: 250000 };
  for (const [qStr, total] of Object.entries(expected)) {
    const q = Number(qStr);
    setup({ fee: true, type: "couple" });
    const res = await call({ candidate_id: CANDIDATE_ID, vote_quantity: q, pricing_version: "tiered_v2", client_total_cents: total });
    assertEquals(res.status, 200, `q=${q}`);
    assertEquals((await res.json()).url, "https://checkout.stripe.com/c/pay/cs_test_mock123");
    assertEquals(rec.stripeBodies.length, 1);
    const sp = rec.stripeBodies[0];
    assertEquals(stripeTotalCents(sp), total, `stripe total q=${q}`);
    assertEquals(sp.get("metadata[expected_amount_cents]"), String(total));
    assertEquals(sp.get("metadata[vote_quantity]"), String(q));
    assertEquals(sp.get("metadata[pricing_version]"), "tiered_v2");
    assertEquals(sp.get("metadata[service_fee_per_vote_cents]"), q >= 20 ? "50" : "80");
    const row = rec.paymentInserts[0];
    assertEquals(row.vote_quantity, q);
    assertEquals(row.amount, total);
    assertEquals(row.subtotal_amount, q * 200);
    assertEquals(row.service_fee_amount, q * (q >= 20 ? 50 : 80));
    assertEquals(row.tax_amount, 0);
    assertEquals(row.status, "pending");
    assertEquals((row.subtotal_amount as number) + (row.service_fee_amount as number) + (row.tax_amount as number), row.amount);
  }
}});

Deno.test({ name: "individual quantities 1,10,19,20,21,50,100,1000", ...OPTS, fn: async () => {
  const expected: Record<number, number> = { 1: 180, 10: 1800, 19: 3420, 20: 3000, 21: 3150, 50: 7500, 100: 15000, 1000: 150000 };
  for (const [qStr, total] of Object.entries(expected)) {
    setup({ fee: true, type: "individual" });
    const res = await call({ candidate_id: CANDIDATE_ID, vote_quantity: Number(qStr), pricing_version: "tiered_v2", client_total_cents: total });
    assertEquals(res.status, 200, `q=${qStr}`);
    assertEquals(stripeTotalCents(rec.stripeBodies[0]), total);
    assertEquals(rec.paymentInserts[0].amount, total);
  }
}});

Deno.test({ name: "client-supplied price/fee fields are ignored (server prices from DB candidate + quantity)", ...OPTS, fn: async () => {
  setup({ fee: true, type: "couple" });
  const res = await call({
    candidate_id: CANDIDATE_ID, vote_quantity: 19, pricing_version: "tiered_v2",
    service_fee_cents: 0, service_fee_per_vote_cents: 1, unit_amount: 1, amount: 1, vote_price: 1, candidate_type: "individual",
  });
  assertEquals(res.status, 200);
  assertEquals(stripeTotalCents(rec.stripeBodies[0]), 5320);
  assertEquals(rec.paymentInserts[0].amount, 5320);
}});

Deno.test({ name: "mismatching client_total_cents => 409, nothing created in Stripe or DB", ...OPTS, fn: async () => {
  for (const bad of [100, 5320 + 1, 5000 - 1, 1.5, "5000"]) {
    setup({ fee: true, type: "couple" });
    const res = await call({ candidate_id: CANDIDATE_ID, vote_quantity: 20, pricing_version: "tiered_v2", client_total_cents: bad });
    assertEquals(res.status, 409, String(bad));
    await res.body?.cancel();
    assertEquals(rec.stripeBodies.length, 0);
    assertEquals(rec.paymentInserts.length, 0);
  }
}});

Deno.test({ name: "stale/legacy pricing_version while fees enabled => 409 (fee cannot be bypassed)", ...OPTS, fn: async () => {
  for (const v of ["legacy_base_v0", "all_in_v1", undefined, "bogus"]) {
    setup({ fee: true, type: "couple" });
    const res = await call({ candidate_id: CANDIDATE_ID, vote_quantity: 20, pricing_version: v, client_total_cents: 4000 });
    assertEquals(res.status, 409, String(v));
    await res.body?.cancel();
    assertEquals(rec.stripeBodies.length, 0);
  }
}});

Deno.test({ name: "fees disabled server-side => legacy base price only (existing behaviour preserved)", ...OPTS, fn: async () => {
  setup({ fee: false, type: "couple" });
  const res = await call({ candidate_id: CANDIDATE_ID, vote_quantity: 20, pricing_version: "legacy_base_v0", client_total_cents: 4000 });
  assertEquals(res.status, 200);
  assertEquals(stripeTotalCents(rec.stripeBodies[0]), 4000);
  assertEquals(rec.stripeBodies[0].get("metadata[pricing_version]"), "legacy_base_v0");
  assertEquals(rec.paymentInserts[0].service_fee_amount, 0);
  assertEquals(rec.paymentInserts[0].amount, 4000);
  // a fee-inclusive client total is rejected while server fees are off
  setup({ fee: false, type: "couple" });
  const res2 = await call({ candidate_id: CANDIDATE_ID, vote_quantity: 20, pricing_version: "tiered_v2", client_total_cents: 5000 });
  assertEquals(res2.status, 409);
  await res2.body?.cancel();
}});

Deno.test({ name: "invalid quantities rejected with 400", ...OPTS, fn: async () => {
  for (const bad of [0, -5, 1.5, 1001, 100000, "20", null, NaN]) {
    setup({ fee: true });
    const res = await call({ candidate_id: CANDIDATE_ID, vote_quantity: bad, pricing_version: "tiered_v2" });
    assertEquals(res.status, 400, String(bad));
    await res.body?.cancel();
    assertEquals(rec.stripeBodies.length, 0);
  }
}});

Deno.test({ name: "voting deadline, inactive candidate, origin and uuid rules preserved", ...OPTS, fn: async () => {
  setup({ fee: true });
  scheduleEndTime = new Date(Date.now() - 1000).toISOString();
  let res = await call({ candidate_id: CANDIDATE_ID, vote_quantity: 20, pricing_version: "tiered_v2" });
  assertEquals(res.status, 403);
  assert((await res.json()).error.includes("closed"));
  assertEquals(rec.stripeBodies.length, 0);

  setup({ fee: true });
  candidateStatus = "paused";
  res = await call({ candidate_id: CANDIDATE_ID, vote_quantity: 20, pricing_version: "tiered_v2" });
  assertEquals(res.status, 400);
  await res.body?.cancel();

  setup({ fee: true });
  res = await call({ candidate_id: CANDIDATE_ID, vote_quantity: 20, pricing_version: "tiered_v2" }, "https://evil.example.com");
  assertEquals(res.status, 403);
  await res.body?.cancel();
  res = await call({ candidate_id: CANDIDATE_ID, vote_quantity: 20, pricing_version: "tiered_v2" }, null);
  assertEquals(res.status, 403);
  await res.body?.cancel();

  res = await call({ candidate_id: "not-a-uuid", vote_quantity: 20, pricing_version: "tiered_v2" });
  assertEquals(res.status, 400);
  await res.body?.cancel();
  assertEquals(rec.stripeBodies.length, 0);
}});
