/**
 * Tiered service fee verification (pure integer-cent logic + frontend/server parity).
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

const { calculateVotePricingCents: calc, MAX_VOTES_PER_TRANSACTION: MAX } = server;

console.log("\nTIERED SERVICE FEE TESTS\n");

// --- Owner-approved couple examples (cents) ---
const COUPLE = { 1: 280, 10: 2800, 19: 5320, 20: 5000, 50: 12500, 100: 25000 };
for (const [q, total] of Object.entries(COUPLE)) {
  test(`couple ${q} votes = $${(total / 100).toFixed(2)}`, () => {
    assert.equal(calc("couple", Number(q), true).totalAmountCents, total);
  });
}

// --- Individual expectations: $1.00 + $0.80 / $0.50 ---
const INDIVIDUAL = { 1: 180, 10: 1800, 19: 3420, 20: 3000, 21: 3150, 50: 7500, 100: 15000, [MAX]: 150000 };
for (const [q, total] of Object.entries(INDIVIDUAL)) {
  test(`individual ${q} votes = $${(total / 100).toFixed(2)}`, () => {
    assert.equal(calc("individual", Number(q), true).totalAmountCents, total);
  });
}

test("couple 21 votes = $52.50, couple max (1000) = $2500.00", () => {
  assert.equal(calc("couple", 21, true).totalAmountCents, 5250);
  assert.equal(calc("couple", MAX, true).totalAmountCents, 250000);
});

test("breakdown fields for couple 19 and 20", () => {
  const a = calc("couple", 19, true);
  assert.deepEqual(
    [a.subtotalCents, a.serviceFeePerVoteCents, a.serviceFeeCents, a.discountTierApplied],
    [3800, 80, 1520, false]
  );
  const b = calc("couple", 20, true);
  assert.deepEqual(
    [b.subtotalCents, b.serviceFeePerVoteCents, b.serviceFeeCents, b.discountTierApplied],
    [4000, 50, 1000, true]
  );
});

test("INTENTIONAL: total for 20 votes < total for 19 votes (owner-approved)", () => {
  for (const type of ["individual", "couple"]) {
    assert.ok(calc(type, 20, true).totalAmountCents < calc(type, 19, true).totalAmountCents);
  }
});

test("threshold is 20 exactly; fee is per-vote for ALL votes", () => {
  assert.equal(calc("individual", 19, true).serviceFeePerVoteCents, 80);
  assert.equal(calc("individual", 20, true).serviceFeePerVoteCents, 50);
  assert.equal(calc("individual", 20, true).serviceFeeCents, 20 * 50);
  assert.equal(calc("individual", 21, true).serviceFeeCents, 21 * 50);
});

test("fees disabled => base price only, zero fee", () => {
  const p = calc("couple", 20, false);
  assert.equal(p.serviceFeeCents, 0);
  assert.equal(p.totalAmountCents, 4000);
  assert.equal(p.discountTierApplied, false);
});

test("unknown / null candidate type is priced as individual", () => {
  assert.equal(calc(null, 1, true).totalAmountCents, 180);
  assert.equal(calc("whatever", 1, true).unitPriceCents, 100);
});

test("every quantity 1..MAX: all integers, total = subtotal + fee + tax, votes unchanged", () => {
  for (const type of ["individual", "couple"]) {
    for (let q = 1; q <= MAX; q++) {
      const p = calc(type, q, true);
      for (const v of [p.subtotalCents, p.serviceFeeCents, p.totalAmountCents, p.serviceFeePerVoteCents]) {
        assert.ok(Number.isSafeInteger(v) && v >= 0);
      }
      assert.equal(p.voteQuantity, q);
      assert.equal(p.subtotalCents, q * (type === "couple" ? 200 : 100));
      assert.equal(p.totalAmountCents, p.subtotalCents + p.serviceFeeCents + p.taxCents);
      assert.equal(p.serviceFeeCents, q * (q >= 20 ? 50 : 80));
    }
  }
});

test("invalid quantities are rejected (0, -1, 1.5, 1001, NaN, string, null, Infinity)", () => {
  for (const bad of [0, -1, 1.5, MAX + 1, NaN, "10", null, undefined, Infinity]) {
    assert.equal(server.isValidVoteQuantity(bad), false, String(bad));
    assert.throws(() => calc("couple", bad, true), RangeError, String(bad));
  }
  for (const ok of [1, 19, 20, MAX]) assert.equal(server.isValidVoteQuantity(ok), true);
});

test("frontend and server modules are byte-identical (no drift)", () => {
  const a = readFileSync(join(root, "supabase/functions/_shared/pricing.ts"), "utf8").replace(/\r\n/g, "\n");
  const b = readFileSync(join(root, "src/lib/pricing.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(a, b);
});

test("frontend result === server result for every quantity and type", () => {
  for (const type of ["individual", "couple"]) {
    for (let q = 1; q <= MAX; q++) {
      assert.deepEqual(client.calculateVotePricingCents(type, q, true), server.calculateVotePricingCents(type, q, true));
    }
  }
});

test("Stripe line items (unit_amount x quantity) sum exactly to the computed total", () => {
  for (const type of ["individual", "couple"]) {
    for (const q of [1, 10, 19, 20, 21, 50, 100, MAX]) {
      const p = calc(type, q, true);
      const stripeTotal = p.unitPriceCents * q + p.serviceFeePerVoteCents * q;
      assert.equal(stripeTotal, p.totalAmountCents);
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
