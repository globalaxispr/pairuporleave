/**
 * Flat $2.00/vote + 15% service fee verification (pure integer-cent logic + frontend/server parity).
 * Run: node scripts/test-tiered-pricing.mjs   (Node >= 22.6, native TS stripping)
 * No network, no Stripe, no database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const server = await import(join(root, "supabase/functions/_shared/pricing.ts").replace(/\\/g, "/").replace(/^/, "file:///").replace("file:////", "file:///"));
const client = await import(join(root, "src/lib/pricing.ts").replace(/\\/g, "/").replace(/^/, "file:///").replace("file:////", "file:///"));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n    ${e.message}`);
  }
}

const {
  calculateVotePrice,
  calculateVotePricingCents: calc,
  MAX_VOTES_PER_TRANSACTION: MAX,
  UNIT_PRICE_CENTS,
  SERVICE_FEE_PERCENT,
  ACTIVE_PRICING_VERSION,
} = server;

console.log("\nFLAT $2.00 + 15% SERVICE FEE PRICING TESTS\n");

test("constants match official flat_2usd_15pct_v1 spec", () => {
  assert.equal(ACTIVE_PRICING_VERSION, "flat_2usd_15pct_v1");
  assert.equal(UNIT_PRICE_CENTS, 200);
  assert.equal(SERVICE_FEE_PERCENT, 15);
  assert.equal(MAX, 1000);
});

// Mandatory test quantities: 1, 2, 5, 10, 25, 50, 100, 200, 500, 1000
const EXPECTED_CENTS = {
  1:    { subtotal: 200,    fee: 30,    total: 230 },
  2:    { subtotal: 400,    fee: 60,    total: 460 },
  5:    { subtotal: 1000,   fee: 150,   total: 1150 },
  10:   { subtotal: 2000,   fee: 300,   total: 2300 },
  25:   { subtotal: 5000,   fee: 750,   total: 5750 },
  50:   { subtotal: 10000,  fee: 1500,  total: 11500 },
  100:  { subtotal: 20000,  fee: 3000,  total: 23000 },
  200:  { subtotal: 40000,  fee: 6000,  total: 46000 },
  500:  { subtotal: 100000, fee: 15000, total: 115000 },
  1000: { subtotal: 200000, fee: 30000, total: 230000 },
};

for (const type of ["individual", "couple"]) {
  for (const [qStr, exp] of Object.entries(EXPECTED_CENTS)) {
    const q = Number(qStr);
    test(`${type} ${q} vote(s) = subtotal $${(exp.subtotal / 100).toFixed(2)} + fee $${(exp.fee / 100).toFixed(2)} = $${(exp.total / 100).toFixed(2)}`, () => {
      const p = calc(type, q);
      assert.equal(p.unitPriceCents, 200);
      assert.equal(p.voteQuantity, q);
      assert.equal(p.subtotalCents, exp.subtotal);
      assert.equal(p.serviceFeePercent, 15);
      assert.equal(p.serviceFeeCents, exp.fee);
      assert.equal(p.taxCents, 0);
      assert.equal(p.totalAmountCents, exp.total);
      assert.deepEqual(calculateVotePrice(q), p);
    });
  }
}

test("individual and couple produce identical pricing for every quantity 1..MAX", () => {
  for (let q = 1; q <= MAX; q++) {
    const ind = calc("individual", q);
    const cpl = calc("couple", q);
    assert.deepEqual(ind, cpl);
    assert.equal(ind.unitPriceCents, 200);
    assert.equal(ind.subtotalCents, q * 200);
    assert.equal(ind.serviceFeeCents, Math.round((q * 200 * 15) / 100));
    assert.equal(ind.taxCents, 0);
    assert.equal(ind.totalAmountCents, ind.subtotalCents + ind.serviceFeeCents);
  }
});

test("unknown / null candidate type also prices at $2.00 + 15%", () => {
  assert.equal(calc(null, 1).totalAmountCents, 230);
  assert.equal(calc("whatever", 1).unitPriceCents, 200);
});

test("invalid quantities are rejected (0, -1, 1.5, 1001, NaN, string, null, Infinity)", () => {
  for (const bad of [0, -1, 1.5, MAX + 1, NaN, "10", null, undefined, Infinity]) {
    assert.equal(server.isValidVoteQuantity(bad), false, String(bad));
    assert.throws(() => calc("couple", bad), RangeError, String(bad));
    assert.throws(() => calculateVotePrice(bad), RangeError, String(bad));
  }
  for (const ok of [1, 10, 25, MAX]) assert.equal(server.isValidVoteQuantity(ok), true);
});

test("frontend and server modules are byte-identical (no drift)", () => {
  const a = readFileSync(join(root, "supabase/functions/_shared/pricing.ts"), "utf8").replace(/\r\n/g, "\n");
  const b = readFileSync(join(root, "src/lib/pricing.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(a, b);
});

test("frontend result === server result for every quantity and type", () => {
  for (const type of ["individual", "couple"]) {
    for (let q = 1; q <= MAX; q++) {
      assert.deepEqual(client.calculateVotePricingCents(type, q), server.calculateVotePricingCents(type, q));
    }
  }
});

test("Stripe line items (unit_amount x quantity + 1 x serviceFeeCents) sum exactly to totalAmountCents", () => {
  for (const type of ["individual", "couple"]) {
    for (const q of [1, 2, 5, 10, 25, 50, 100, 200, 500, MAX]) {
      const p = calc(type, q);
      const stripeTotal = p.unitPriceCents * q + p.serviceFeeCents * 1;
      assert.equal(stripeTotal, p.totalAmountCents);
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
