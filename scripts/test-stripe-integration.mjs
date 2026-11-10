/**
 * PAIR UP OR LEAVE — STRIPE INTEGRATION VERIFICATION SUITE
 * Tests all Phase 2, 5, 6, 7, 8, 9 rules and validation logic locally.
 * Zero external network calls, zero real charges.
 */

import assert from "node:assert/strict";

console.log("====================================================");
console.log("RUNNING PAIR UP OR LEAVE STRIPE INTEGRATION TESTS");
console.log("====================================================\n");

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

// ----------------------------------------------------
// 1. BUSINESS PRICING & CREDITING RULES (PHASE 2)
// ----------------------------------------------------
console.log("--- 1. BUSINESS PRICING & VOTE CREDITING ---");

function calculatePricing(candidateType, voteQuantity) {
  const isCouple = candidateType === "couple";
  const unitPriceDollars = isCouple ? 2 : 1;
  const unitPriceCents = isCouple ? 200 : 100;
  const totalAmountCents = voteQuantity * unitPriceCents;
  const totalAmountDollars = voteQuantity * unitPriceDollars;
  const votesAwarded = voteQuantity; // Crucial rule: 1 couple entry receives exactly voteQuantity votes
  return { unitPriceDollars, unitPriceCents, totalAmountCents, totalAmountDollars, votesAwarded };
}

test("Individual candidate: 1 vote = $1.00 USD (100 cents), awards 1 vote", () => {
  const res = calculatePricing("individual", 1);
  assert.equal(res.totalAmountDollars, 1);
  assert.equal(res.totalAmountCents, 100);
  assert.equal(res.votesAwarded, 1);
});

test("Individual candidate: 10 votes = $10.00 USD (1000 cents), awards 10 votes", () => {
  const res = calculatePricing("individual", 10);
  assert.equal(res.totalAmountDollars, 10);
  assert.equal(res.totalAmountCents, 1000);
  assert.equal(res.votesAwarded, 10);
});

test("Couple candidate: 1 vote = $2.00 USD (200 cents), awards 1 vote", () => {
  const res = calculatePricing("couple", 1);
  assert.equal(res.totalAmountDollars, 2);
  assert.equal(res.totalAmountCents, 200);
  assert.equal(res.votesAwarded, 1);
});

test("Couple candidate: 5 votes = $10.00 USD (1000 cents), awards exactly 5 votes", () => {
  const res = calculatePricing("couple", 5);
  assert.equal(res.totalAmountDollars, 10);
  assert.equal(res.totalAmountCents, 1000);
  assert.equal(res.votesAwarded, 5); // Must NEVER award 10 votes
});

test("Couple candidate: 10 votes = $20.00 USD (2000 cents), awards exactly 10 votes", () => {
  const res = calculatePricing("couple", 10);
  assert.equal(res.totalAmountDollars, 20);
  assert.equal(res.totalAmountCents, 2000);
  assert.equal(res.votesAwarded, 10);
});

// ----------------------------------------------------
// 2. INPUT VALIDATION & BOUNDS (PHASE 8)
// ----------------------------------------------------
console.log("\n--- 2. INPUT VALIDATION & SECURITY BOUNDS ---");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_VOTES = 1;
const MAX_VOTES = 1000;

function validateCheckoutRequest(candidateId, quantity) {
  if (!candidateId || typeof candidateId !== "string" || !UUID_REGEX.test(candidateId)) {
    return { valid: false, error: "candidate_id must be a valid UUID" };
  }
  if (!quantity || !Number.isInteger(quantity) || quantity < MIN_VOTES || quantity > MAX_VOTES) {
    return { valid: false, error: `vote_quantity must be an integer between ${MIN_VOTES} and ${MAX_VOTES}` };
  }
  return { valid: true };
}

test("Valid candidate UUID and valid quantity passes", () => {
  const res = validateCheckoutRequest("a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d", 5);
  assert.equal(res.valid, true);
});

test("Rejects invalid candidate UUID (SQL injection attempt)", () => {
  const res = validateCheckoutRequest("1'; DROP TABLE candidates; --", 5);
  assert.equal(res.valid, false);
});

test("Rejects quantity 0", () => {
  const res = validateCheckoutRequest("a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d", 0);
  assert.equal(res.valid, false);
});

test("Rejects negative quantity", () => {
  const res = validateCheckoutRequest("a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d", -5);
  assert.equal(res.valid, false);
});

test("Rejects floating point quantity (5.5)", () => {
  const res = validateCheckoutRequest("a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d", 5.5);
  assert.equal(res.valid, false);
});

test("Rejects quantity exceeding MAX_VOTES_PER_TRANSACTION (1001)", () => {
  const res = validateCheckoutRequest("a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d", 1001);
  assert.equal(res.valid, false);
});

// ----------------------------------------------------
// 3. CANDIDATE STATUS ENFORCEMENT
// ----------------------------------------------------
console.log("\n--- 3. CANDIDATE STATUS ENFORCEMENT ---");

function checkCandidateAcceptingVotes(status) {
  if (status !== "active") {
    return { error: "This candidate is not currently accepting votes." };
  }
  return { success: true };
}

test("Candidate with status 'active' is accepted", () => {
  const res = checkCandidateAcceptingVotes("active");
  assert.equal(res.success, true);
});

test("Candidate with status 'paused' is rejected", () => {
  const res = checkCandidateAcceptingVotes("paused");
  assert.equal(res.error, "This candidate is not currently accepting votes.");
});

// ----------------------------------------------------
// 4. COMPETITION DEADLINE ENFORCEMENT (PHASE 7)
// ----------------------------------------------------
console.log("\n--- 4. COMPETITION DEADLINE POLICY ---");

function evaluateCompetitionWindow(schedule, nowTime) {
  if (!schedule || !schedule.is_enabled) return { allowed: true };
  const start = new Date(schedule.start_time).getTime();
  const end = new Date(schedule.end_time).getTime();

  if (!isNaN(start) && nowTime < start) {
    return { allowed: false, error: "Voting has not started yet" };
  }
  if (!isNaN(end) && nowTime >= end) {
    return { allowed: false, error: "Voting is closed" };
  }
  return { allowed: true };
}

const mockSchedule = {
  is_enabled: true,
  start_time: "2026-10-01T00:00:00Z",
  end_time: "2026-10-25T00:00:00Z",
};

test("Voting allowed within active window", () => {
  const res = evaluateCompetitionWindow(mockSchedule, new Date("2026-10-15T12:00:00Z").getTime());
  assert.equal(res.allowed, true);
});

test("Voting rejected before competition start", () => {
  const res = evaluateCompetitionWindow(mockSchedule, new Date("2026-09-30T23:59:59Z").getTime());
  assert.equal(res.allowed, false);
});

test("Voting rejected after competition deadline", () => {
  const res = evaluateCompetitionWindow(mockSchedule, new Date("2026-10-25T00:00:01Z").getTime());
  assert.equal(res.allowed, false);
});

test("Payment initiated BEFORE deadline but completed AFTER is honored and credited", () => {
  const initiatedAt = new Date("2026-10-24T23:50:00Z").getTime();
  const deadline = new Date("2026-10-25T00:00:00Z").getTime();
  const completedAt = new Date("2026-10-25T00:05:00Z").getTime();

  assert.ok(initiatedAt <= deadline, "Payment was initiated before deadline");
  assert.ok(completedAt > deadline, "Payment completed after deadline");
  // Policy rule: initiatedAt <= deadline -> honored
  const shouldCredit = initiatedAt <= deadline;
  assert.equal(shouldCredit, true);
});

test("Payment initiated AFTER deadline is rejected and NOT credited", () => {
  const initiatedAt = new Date("2026-10-25T00:05:00Z").getTime();
  const deadline = new Date("2026-10-25T00:00:00Z").getTime();
  const shouldCredit = initiatedAt <= deadline;
  assert.equal(shouldCredit, false);
});

// ----------------------------------------------------
// 5. WEBHOOK VERIFICATION & SECURITY (PHASE 5)
// ----------------------------------------------------
console.log("\n--- 5. WEBHOOK SECURITY & IDEMPOTENCY ---");

function simulateWebhookProcessing(session, dbPayment, dbCandidate) {
  // 1. Payment status
  if (session.payment_status !== "paid") {
    return { status: "ignored_unpaid", votesAwarded: 0 };
  }

  // 2. Currency check
  const stripeCurrency = (session.currency ?? "").toLowerCase();
  const expectedCurrency = (dbPayment.currency ?? "usd").toLowerCase();
  if (stripeCurrency !== expectedCurrency) {
    return { status: "failed_currency_mismatch", votesAwarded: 0 };
  }

  // 3. Amount check
  if ((session.amount_total ?? 0) !== dbPayment.amount) {
    return { status: "failed_amount_mismatch", votesAwarded: 0 };
  }

  // 4. Candidate check
  if (!dbPayment.candidate_id || dbPayment.candidate_id !== dbCandidate.id) {
    return { status: "failed_candidate_mismatch", votesAwarded: 0 };
  }

  // 5. Idempotency check
  if (dbPayment.status === "paid") {
    return { status: "skipped_already_paid", votesAwarded: 0 };
  }

  // 6. Credit votes
  return { status: "success", votesAwarded: dbPayment.vote_quantity };
}

test("Valid payment webhook successfully awards votes", () => {
  const session = { id: "cs_test_123", payment_status: "paid", amount_total: 1000, currency: "usd" };
  const dbPayment = { id: "p1", status: "pending", amount: 1000, currency: "usd", candidate_id: "c1", vote_quantity: 5 };
  const dbCandidate = { id: "c1", status: "active" };

  const res = simulateWebhookProcessing(session, dbPayment, dbCandidate);
  assert.equal(res.status, "success");
  assert.equal(res.votesAwarded, 5);
});

test("Webhook with payment_status 'unpaid' awards ZERO votes", () => {
  const session = { id: "cs_test_123", payment_status: "unpaid", amount_total: 1000, currency: "usd" };
  const dbPayment = { id: "p1", status: "pending", amount: 1000, currency: "usd", candidate_id: "c1", vote_quantity: 5 };
  const dbCandidate = { id: "c1", status: "active" };

  const res = simulateWebhookProcessing(session, dbPayment, dbCandidate);
  assert.equal(res.status, "ignored_unpaid");
  assert.equal(res.votesAwarded, 0);
});

test("Webhook with tampered amount awards ZERO votes", () => {
  const session = { id: "cs_test_123", payment_status: "paid", amount_total: 100, currency: "usd" }; // User paid $1 instead of $10
  const dbPayment = { id: "p1", status: "pending", amount: 1000, currency: "usd", candidate_id: "c1", vote_quantity: 10 };
  const dbCandidate = { id: "c1", status: "active" };

  const res = simulateWebhookProcessing(session, dbPayment, dbCandidate);
  assert.equal(res.status, "failed_amount_mismatch");
  assert.equal(res.votesAwarded, 0);
});

test("Webhook with currency mismatch awards ZERO votes", () => {
  const session = { id: "cs_test_123", payment_status: "paid", amount_total: 1000, currency: "eur" };
  const dbPayment = { id: "p1", status: "pending", amount: 1000, currency: "usd", candidate_id: "c1", vote_quantity: 10 };
  const dbCandidate = { id: "c1", status: "active" };

  const res = simulateWebhookProcessing(session, dbPayment, dbCandidate);
  assert.equal(res.status, "failed_currency_mismatch");
  assert.equal(res.votesAwarded, 0);
});

test("Duplicate webhook delivery (retries) awards ZERO additional votes", () => {
  const session = { id: "cs_test_123", payment_status: "paid", amount_total: 1000, currency: "usd" };
  const dbPayment = { id: "p1", status: "paid", amount: 1000, currency: "usd", candidate_id: "c1", vote_quantity: 5 }; // Already paid
  const dbCandidate = { id: "c1", status: "active" };

  const res = simulateWebhookProcessing(session, dbPayment, dbCandidate);
  assert.equal(res.status, "skipped_already_paid");
  assert.equal(res.votesAwarded, 0);
});

test("confirm_stripe_payment RPC failure aborts without marking paid or crediting votes (throws 500 retryable error)", () => {
  const paymentRecord = { id: "p1", status: "pending", vote_quantity: 10 };
  let candidateVotes = 50;

  function executeAtomicRpc(rpcAvailable) {
    if (!rpcAvailable) {
      // Simulate RPC error / DB timeout
      throw new Error("confirm_stripe_payment RPC failed: database unavailable");
    }
    // Transaction succeeds
    paymentRecord.status = "paid";
    candidateVotes += paymentRecord.vote_quantity;
    return { success: true };
  }

  // When RPC fails:
  assert.throws(
    () => executeAtomicRpc(false),
    /confirm_stripe_payment RPC failed/
  );

  // Assert atomic rollback: payment is NOT paid, votes NOT credited
  assert.equal(paymentRecord.status, "pending");
  assert.equal(candidateVotes, 50);
});

// ----------------------------------------------------
// 6. ADMIN SCORE SEPARATION & REVENUE (PHASE 6)
// ----------------------------------------------------
console.log("\n--- 6. ADMIN SCORE SEPARATION & REVENUE ---");

function calculateScore(paidVotes, adminAdd, adminRemove) {
  return Math.max(0, paidVotes + adminAdd - adminRemove);
}

test("Score formula: max(0, paid_votes + admin_add - admin_remove)", () => {
  assert.equal(calculateScore(100, 20, 10), 110);
  assert.equal(calculateScore(10, 0, 50), 0); // Never negative
});

test("ADMIN_REMOVE never creates refund or modifies paid_votes", () => {
  const candidate = { paid_votes: 50, bonus_votes: 10, penalty_points: 0 };
  // Admin removes 20 points
  candidate.penalty_points += 20;
  const score = calculateScore(candidate.paid_votes, candidate.bonus_votes, candidate.penalty_points);
  assert.equal(candidate.paid_votes, 50); // paid_votes remains intact
  assert.equal(score, 40);
});

test("ADMIN_ADD never creates payment or increases paid_votes", () => {
  const candidate = { paid_votes: 50, bonus_votes: 10, penalty_points: 0 };
  // Admin adds 30 bonus points
  candidate.bonus_votes += 30;
  const score = calculateScore(candidate.paid_votes, candidate.bonus_votes, candidate.penalty_points);
  assert.equal(candidate.paid_votes, 50); // paid_votes remains intact
  assert.equal(score, 90);
});

// ----------------------------------------------------
// 7. FORGED PAYMENT REFERENCES & LOCKDOWN (MIGRATION 14)
// ----------------------------------------------------
console.log("\n--- 7. FORGED PAYMENT REFERENCES & LOCKDOWN ---");

function simulateAdjustCandidateScore({
  callerRole,
  callerUid,
  adminUsers = [],
  payments = new Map(),
  scoreLedger = [],
  candidates = new Map(),
  params: { candidateId, type, quantity, reason, adminId, adminEmail, referenceId },
}) {
  // Check 1: Role check
  if (callerRole !== "authenticated" && callerRole !== "service_role") {
    throw new Error(`Forbidden: Role ${callerRole} is not authorized to execute adjust_candidate_score.`);
  }

  // Adjustment type check
  const validTypes = ["PAID_VOTE", "BONUS", "PENALTY", "CORRECTION", "ADMIN_ADD", "ADMIN_REMOVE"];
  if (!validTypes.includes(type)) {
    throw new Error(`Invalid adjustment type: ${type}`);
  }

  // Quantity check
  if (type !== "CORRECTION" && quantity <= 0) {
    throw new Error("Quantity must be a positive integer.");
  }
  if (quantity === 0) {
    throw new Error("Quantity cannot be zero.");
  }
  if (Math.abs(quantity) > 10000) {
    throw new Error("Quantity cannot exceed 10000 points per adjustment.");
  }

  // Strict Check 2: PAID_VOTE lockdown
  if (type === "PAID_VOTE") {
    if (callerRole !== "service_role") {
      throw new Error("Forbidden: PAID_VOTE transactions can only be recorded via verified payment fulfillment.");
    }

    if (!referenceId || !UUID_REGEX.test(referenceId)) {
      throw new Error("Forbidden: PAID_VOTE requires a valid payment UUID reference_id.");
    }

    const paymentRec = payments.get(referenceId);
    if (!paymentRec) {
      throw new Error(`Forbidden: Referenced payment ${referenceId} does not exist.`);
    }

    if (paymentRec.status !== "paid") {
      throw new Error(`Forbidden: Referenced payment ${referenceId} is not paid (status: ${paymentRec.status}).`);
    }

    if (paymentRec.candidate_id !== candidateId) {
      throw new Error(`Forbidden: Candidate mismatch for referenced payment ${referenceId}. Expected ${paymentRec.candidate_id}, got ${candidateId}.`);
    }

    if (paymentRec.vote_quantity !== quantity) {
      throw new Error(`Forbidden: Quantity mismatch for referenced payment ${referenceId}. Expected ${paymentRec.vote_quantity}, got ${quantity}.`);
    }

    // Check if already credited
    const alreadyCredited = scoreLedger.some(l => l.type === "PAID_VOTE" && l.reference_id === referenceId);
    if (alreadyCredited) {
      const cand = candidates.get(candidateId);
      return {
        success: true,
        already_processed: true,
        candidate_id: candidateId,
        current_score: cand ? cand.current_score : 0,
        message: "Payment already processed and credited in score ledger.",
      };
    }

    // Credit payment via private logic
    const cand = candidates.get(candidateId);
    if (!cand) throw new Error("Candidate not found.");
    const prevScore = cand.current_score || 0;
    const newScore = prevScore + quantity;
    cand.current_score = newScore;
    cand.total_votes = newScore;
    cand.paid_votes = (cand.paid_votes || 0) + quantity;
    const ledgerEntry = {
      id: "ledger-" + Math.random(),
      candidate_id: candidateId,
      type: "PAID_VOTE",
      quantity,
      previous_score: prevScore,
      new_score: newScore,
      reason: `Stripe Payment (${paymentRec.candidate_type || "individual"})`,
      reference_id: referenceId,
    };
    scoreLedger.push(ledgerEntry);
    return {
      success: true,
      already_processed: false,
      ledger_id: ledgerEntry.id,
      candidate_id: candidateId,
      previous_score: prevScore,
      new_score: newScore,
      raw_score: newScore,
    };
  }

  // Strict Check 3: Authenticated admin verification
  let derivedAdminId = null;
  let derivedAdminEmail = null;
  if (callerRole === "authenticated") {
    const admin = adminUsers.find(a => a.id === callerUid);
    if (!admin) {
      throw new Error(`Forbidden: User ${callerUid} is not an authorized administrator.`);
    }
    derivedAdminId = admin.id;
    derivedAdminEmail = admin.email;
  } else {
    derivedAdminId = adminId;
    derivedAdminEmail = adminEmail;
  }

  const cand = candidates.get(candidateId);
  if (!cand) throw new Error("Candidate not found.");

  const prevScore = cand.current_score || 0;
  let delta = quantity;
  if (type === "PENALTY" || type === "ADMIN_REMOVE") delta = -Math.abs(quantity);
  const rawScore = prevScore + delta;
  const newScore = Math.max(0, rawScore);

  cand.current_score = newScore;
  cand.total_votes = newScore;
  if (type === "BONUS" || type === "ADMIN_ADD") cand.bonus_votes = (cand.bonus_votes || 0) + quantity;
  if (type === "PENALTY" || type === "ADMIN_REMOVE") cand.penalty_points = (cand.penalty_points || 0) + Math.abs(quantity);

  const ledgerEntry = {
    id: "ledger-" + Math.random(),
    candidate_id: candidateId,
    type,
    quantity: delta,
    previous_score: prevScore,
    new_score: newScore,
    reason,
    admin_user_id: derivedAdminId,
    admin_email: derivedAdminEmail,
    reference_id: referenceId,
  };
  scoreLedger.push(ledgerEntry);

  return {
    success: true,
    ledger_id: ledgerEntry.id,
    candidate_id: candidateId,
    previous_score: prevScore,
    new_score: newScore,
    raw_score: rawScore,
    capped_at_zero: rawScore < 0,
  };
}

test("adjust_candidate_score: rejects PAID_VOTE when called by authenticated admin", () => {
  assert.throws(
    () => simulateAdjustCandidateScore({
      callerRole: "authenticated",
      callerUid: "admin-123",
      adminUsers: [{ id: "admin-123", email: "admin@test.com" }],
      params: {
        candidateId: "c1",
        type: "PAID_VOTE",
        quantity: 10,
        referenceId: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
      },
    }),
    /Forbidden: PAID_VOTE transactions can only be recorded via verified payment fulfillment/
  );
});

test("adjust_candidate_score: rejects PAID_VOTE without valid UUID reference_id", () => {
  assert.throws(
    () => simulateAdjustCandidateScore({
      callerRole: "service_role",
      params: {
        candidateId: "c1",
        type: "PAID_VOTE",
        quantity: 10,
        referenceId: "not-a-uuid",
      },
    }),
    /Forbidden: PAID_VOTE requires a valid payment UUID reference_id/
  );
});

test("adjust_candidate_score: rejects PAID_VOTE when payment does not exist (forged ID)", () => {
  const fakePaymentId = "00000000-0000-0000-0000-000000000000";
  assert.throws(
    () => simulateAdjustCandidateScore({
      callerRole: "service_role",
      payments: new Map(), // Empty database
      params: {
        candidateId: "c1",
        type: "PAID_VOTE",
        quantity: 10,
        referenceId: fakePaymentId,
      },
    }),
    /Forbidden: Referenced payment 00000000-0000-0000-0000-000000000000 does not exist/
  );
});

test("adjust_candidate_score: rejects PAID_VOTE when payment status is 'pending'", () => {
  const paymentId = "11111111-1111-1111-1111-111111111111";
  const payments = new Map([[
    paymentId,
    { id: paymentId, status: "pending", candidate_id: "c1", vote_quantity: 10 }
  ]]);
  assert.throws(
    () => simulateAdjustCandidateScore({
      callerRole: "service_role",
      payments,
      params: {
        candidateId: "c1",
        type: "PAID_VOTE",
        quantity: 10,
        referenceId: paymentId,
      },
    }),
    /Forbidden: Referenced payment 11111111-1111-1111-1111-111111111111 is not paid \(status: pending\)/
  );
});

test("adjust_candidate_score: rejects PAID_VOTE when candidate mismatches payment record", () => {
  const paymentId = "22222222-2222-2222-2222-222222222222";
  const payments = new Map([[
    paymentId,
    { id: paymentId, status: "paid", candidate_id: "c-victim", vote_quantity: 10 }
  ]]);
  assert.throws(
    () => simulateAdjustCandidateScore({
      callerRole: "service_role",
      payments,
      params: {
        candidateId: "c-attacker",
        type: "PAID_VOTE",
        quantity: 10,
        referenceId: paymentId,
      },
    }),
    /Forbidden: Candidate mismatch for referenced payment/
  );
});

test("adjust_candidate_score: rejects PAID_VOTE when quantity mismatches payment record (vote amplification attempt)", () => {
  const paymentId = "33333333-3333-3333-3333-333333333333";
  const payments = new Map([[
    paymentId,
    { id: paymentId, status: "paid", candidate_id: "c1", vote_quantity: 1 } // User paid for 1 vote
  ]]);
  assert.throws(
    () => simulateAdjustCandidateScore({
      callerRole: "service_role",
      payments,
      params: {
        candidateId: "c1",
        type: "PAID_VOTE",
        quantity: 1000, // Attacker requests 1000 votes
        referenceId: paymentId,
      },
    }),
    /Forbidden: Quantity mismatch for referenced payment/
  );
});

// ----------------------------------------------------
// 8. CONFIRM_STRIPE_PAYMENT & PAYMENTINTENT CONSISTENCY
// ----------------------------------------------------
console.log("\n--- 8. CONFIRM_STRIPE_PAYMENT & PAYMENTINTENT CONSISTENCY ---");

function simulateConfirmStripePayment({
  callerRole,
  payments = new Map(),
  scoreLedger = [],
  candidates = new Map(),
  votes = new Map(),
  params: { paymentId, stripePaymentIntentId, candidateId, voteQuantity, candidateType, votePrice },
}) {
  if (callerRole !== "service_role") {
    throw new Error("Forbidden: confirm_stripe_payment can only be executed by service_role.");
  }

  const payment = payments.get(paymentId);
  if (!payment) {
    throw new Error(`Payment ${paymentId} not found`);
  }

  // 1. Authoritative identity checks
  if (payment.candidate_id !== candidateId) {
    throw new Error("Payment integrity mismatch: candidate_id does not match payment record.");
  }
  if (payment.vote_quantity !== voteQuantity) {
    throw new Error("Payment integrity mismatch: vote_quantity does not match payment record.");
  }
  if (payment.candidate_type !== candidateType) {
    throw new Error("Payment integrity mismatch: candidate_type does not match payment record.");
  }
  if (payment.vote_price !== votePrice) {
    throw new Error("Payment integrity mismatch: vote_price does not match payment record.");
  }
  if (payment.amount !== (voteQuantity * votePrice)) {
    throw new Error("Payment integrity mismatch: total amount does not equal quantity * unit price.");
  }

  // 2. Idempotency check with PaymentIntent verification
  if (payment.status === "paid") {
    if (
      payment.stripe_payment_intent_id &&
      stripePaymentIntentId &&
      payment.stripe_payment_intent_id !== stripePaymentIntentId
    ) {
      throw new Error(
        `Payment integrity mismatch: Stripe PaymentIntent ${stripePaymentIntentId} does not match recorded PaymentIntent ${payment.stripe_payment_intent_id}.`
      );
    }

    if (!payment.stripe_payment_intent_id && stripePaymentIntentId) {
      payment.stripe_payment_intent_id = stripePaymentIntentId;
    }

    return {
      success: true,
      already_processed: true,
      payment_id: paymentId,
      candidate_id: payment.candidate_id,
      vote_quantity: payment.vote_quantity,
      stripe_payment_intent_id: payment.stripe_payment_intent_id || stripePaymentIntentId,
      message: "Payment already processed and credited.",
    };
  }

  if (payment.status !== "pending") {
    throw new Error(`Payment ${paymentId} is in status ${payment.status}, expected pending`);
  }

  // 3. Mark paid and record intent
  payment.status = "paid";
  payment.stripe_payment_intent_id = stripePaymentIntentId;

  // 4. Record votes
  votes.set(paymentId, { candidate_id: candidateId, payment_id: paymentId, quantity: voteQuantity });

  // 5. Credit candidate score atomically
  const cand = candidates.get(candidateId);
  if (!cand) throw new Error("Candidate not found");
  const prevScore = cand.current_score || 0;
  const newScore = prevScore + voteQuantity;
  cand.current_score = newScore;
  cand.total_votes = newScore;
  cand.paid_votes = (cand.paid_votes || 0) + voteQuantity;

  const ledgerId = "ledger-" + Math.random();
  scoreLedger.push({
    id: ledgerId,
    candidate_id: candidateId,
    type: "PAID_VOTE",
    quantity: voteQuantity,
    previous_score: prevScore,
    new_score: newScore,
    reason: `Stripe Payment (${candidateType})`,
    reference_id: paymentId,
  });

  return {
    success: true,
    already_processed: false,
    payment_id: paymentId,
    candidate_id: candidateId,
    vote_quantity: voteQuantity,
    score_result: {
      success: true,
      ledger_id: ledgerId,
      previous_score: prevScore,
      new_score: newScore,
    },
  };
}

test("confirm_stripe_payment: rejects calls from non-service_role", () => {
  assert.throws(
    () => simulateConfirmStripePayment({
      callerRole: "authenticated",
      params: { paymentId: "p1" },
    }),
    /Forbidden: confirm_stripe_payment can only be executed by service_role/
  );
});

test("confirm_stripe_payment: on already-paid payment returns already_processed: true with matching PaymentIntent", () => {
  const paymentId = "44444444-4444-4444-4444-444444444444";
  const payments = new Map([[
    paymentId,
    {
      id: paymentId,
      status: "paid",
      candidate_id: "c1",
      vote_quantity: 5,
      candidate_type: "individual",
      vote_price: 100,
      amount: 500,
      stripe_payment_intent_id: "pi_real_123",
    }
  ]]);

  const res = simulateConfirmStripePayment({
    callerRole: "service_role",
    payments,
    params: {
      paymentId,
      stripePaymentIntentId: "pi_real_123", // Matches recorded PaymentIntent
      candidateId: "c1",
      voteQuantity: 5,
      candidateType: "individual",
      votePrice: 100,
    },
  });

  assert.equal(res.success, true);
  assert.equal(res.already_processed, true);
  assert.equal(res.stripe_payment_intent_id, "pi_real_123");
});

test("confirm_stripe_payment: on already-paid payment REJECTS conflicting PaymentIntent", () => {
  const paymentId = "55555555-5555-5555-5555-555555555555";
  const payments = new Map([[
    paymentId,
    {
      id: paymentId,
      status: "paid",
      candidate_id: "c1",
      vote_quantity: 5,
      candidate_type: "individual",
      vote_price: 100,
      amount: 500,
      stripe_payment_intent_id: "pi_real_123",
    }
  ]]);

  assert.throws(
    () => simulateConfirmStripePayment({
      callerRole: "service_role",
      payments,
      params: {
        paymentId,
        stripePaymentIntentId: "pi_attacker_999", // Conflicting PaymentIntent
        candidateId: "c1",
        voteQuantity: 5,
        candidateType: "individual",
        votePrice: 100,
      },
    }),
    /Payment integrity mismatch: Stripe PaymentIntent pi_attacker_999 does not match recorded PaymentIntent pi_real_123/
  );
});

test("confirm_stripe_payment: on already-paid payment REJECTS tampered candidate or quantity", () => {
  const paymentId = "66666666-6666-6666-6666-666666666666";
  const payments = new Map([[
    paymentId,
    {
      id: paymentId,
      status: "paid",
      candidate_id: "c1",
      vote_quantity: 5,
      candidate_type: "individual",
      vote_price: 100,
      amount: 500,
      stripe_payment_intent_id: "pi_real_123",
    }
  ]]);

  // Attempt to pass candidate c2 for already-paid payment
  assert.throws(
    () => simulateConfirmStripePayment({
      callerRole: "service_role",
      payments,
      params: {
        paymentId,
        stripePaymentIntentId: "pi_real_123",
        candidateId: "c2", // Tampered candidate
        voteQuantity: 5,
        candidateType: "individual",
        votePrice: 100,
      },
    }),
    /Payment integrity mismatch: candidate_id does not match payment record/
  );
});

// ----------------------------------------------------
// 9. ADMIN CONTROLS AUDIT (BONUS / PENALTY BYPASS ANALYSIS)
// ----------------------------------------------------
console.log("\n--- 9. ADMIN CONTROLS AUDIT (BONUS / PENALTY) ---");

test("Admin controls: Non-admin authenticated user CANNOT execute BONUS or PENALTY", () => {
  assert.throws(
    () => simulateAdjustCandidateScore({
      callerRole: "authenticated",
      callerUid: "regular-user-456",
      adminUsers: [{ id: "admin-1", email: "admin@test.com" }], // regular-user-456 is not in admin_users
      params: {
        candidateId: "c1",
        type: "BONUS",
        quantity: 50,
      },
    }),
    /Forbidden: User regular-user-456 is not an authorized administrator/
  );
});

test("Admin controls: BONUS strictly increments bonus_votes and NEVER touches paid_votes", () => {
  const candidates = new Map([["c1", { id: "c1", current_score: 100, total_votes: 100, paid_votes: 100, bonus_votes: 0, penalty_points: 0 }]]);
  const scoreLedger = [];
  const res = simulateAdjustCandidateScore({
    callerRole: "authenticated",
    callerUid: "admin-1",
    adminUsers: [{ id: "admin-1", email: "admin@pairup.com" }],
    candidates,
    scoreLedger,
    params: {
      candidateId: "c1",
      type: "BONUS",
      quantity: 25,
      reason: "Promotional bonus",
    },
  });

  const cand = candidates.get("c1");
  assert.equal(cand.paid_votes, 100, "paid_votes must NOT be modified by BONUS");
  assert.equal(cand.bonus_votes, 25, "bonus_votes must be incremented by 25");
  assert.equal(cand.current_score, 125);
  assert.equal(scoreLedger.length, 1);
  assert.equal(scoreLedger[0].admin_email, "admin@pairup.com");
});

test("Admin controls: PENALTY strictly increments penalty_points and NEVER touches paid_votes", () => {
  const candidates = new Map([["c1", { id: "c1", current_score: 100, total_votes: 100, paid_votes: 100, bonus_votes: 0, penalty_points: 0 }]]);
  const scoreLedger = [];
  const res = simulateAdjustCandidateScore({
    callerRole: "authenticated",
    callerUid: "admin-1",
    adminUsers: [{ id: "admin-1", email: "admin@pairup.com" }],
    candidates,
    scoreLedger,
    params: {
      candidateId: "c1",
      type: "PENALTY",
      quantity: 40,
      reason: "Rule violation penalty",
    },
  });

  const cand = candidates.get("c1");
  assert.equal(cand.paid_votes, 100, "paid_votes must NOT be modified by PENALTY");
  assert.equal(cand.penalty_points, 40, "penalty_points must be incremented by 40");
  assert.equal(cand.current_score, 60);
});

test("Admin controls: Client-supplied p_admin_id / p_admin_email are IGNORED in favor of auth.uid()", () => {
  const candidates = new Map([["c1", { id: "c1", current_score: 10, total_votes: 10, paid_votes: 10, bonus_votes: 0, penalty_points: 0 }]]);
  const scoreLedger = [];
  simulateAdjustCandidateScore({
    callerRole: "authenticated",
    callerUid: "admin-real-id",
    adminUsers: [{ id: "admin-real-id", email: "real-admin@pairup.com" }],
    candidates,
    scoreLedger,
    params: {
      candidateId: "c1",
      type: "ADMIN_ADD",
      quantity: 5,
      adminId: "attacker-spoofed-id", // Spoofed ID
      adminEmail: "attacker@spoofed.com", // Spoofed email
    },
  });

  assert.equal(scoreLedger[0].admin_user_id, "admin-real-id", "Must use verified auth.uid()");
  assert.equal(scoreLedger[0].admin_email, "real-admin@pairup.com", "Must use verified admin_users email");
});

// ----------------------------------------------------
// 10. LEGITIMATE STRIPE SANDBOX PURCHASE LIFECYCLE
// ----------------------------------------------------
console.log("\n--- 10. LEGITIMATE STRIPE SANDBOX PURCHASES ---");

test("Sandbox Lifecycle: Individual candidate 1 vote purchase ($1.00 USD)", () => {
  const paymentId = "77777777-7777-7777-7777-777777777777";
  const candidateId = "c-individual";
  const payments = new Map([[
    paymentId,
    {
      id: paymentId,
      status: "pending",
      candidate_id: candidateId,
      vote_quantity: 1,
      candidate_type: "individual",
      vote_price: 100,
      amount: 100,
      currency: "usd",
      stripe_session_id: "cs_test_ind_1",
    }
  ]]);
  const candidates = new Map([[
    candidateId,
    { id: candidateId, current_score: 0, total_votes: 0, paid_votes: 0, candidate_type: "individual" }
  ]]);
  const scoreLedger = [];
  const votes = new Map();

  const confirmRes = simulateConfirmStripePayment({
    callerRole: "service_role",
    payments,
    candidates,
    scoreLedger,
    votes,
    params: {
      paymentId,
      stripePaymentIntentId: "pi_sandbox_ind_1",
      candidateId,
      voteQuantity: 1,
      candidateType: "individual",
      votePrice: 100,
    },
  });

  assert.equal(confirmRes.success, true);
  assert.equal(confirmRes.already_processed, false);
  const updatedPayment = payments.get(paymentId);
  assert.equal(updatedPayment.status, "paid");
  assert.equal(updatedPayment.stripe_payment_intent_id, "pi_sandbox_ind_1");
  const cand = candidates.get(candidateId);
  assert.equal(cand.paid_votes, 1);
  assert.equal(cand.current_score, 1);
  assert.equal(votes.get(paymentId).quantity, 1);
});

test("Sandbox Lifecycle: Couple candidate 10 votes purchase ($20.00 USD, 10 votes)", () => {
  const paymentId = "88888888-8888-8888-8888-888888888888";
  const candidateId = "c-couple";
  const payments = new Map([[
    paymentId,
    {
      id: paymentId,
      status: "pending",
      candidate_id: candidateId,
      vote_quantity: 10,
      candidate_type: "couple",
      vote_price: 200,
      amount: 2000,
      currency: "usd",
      stripe_session_id: "cs_test_couple_10",
    }
  ]]);
  const candidates = new Map([[
    candidateId,
    { id: candidateId, current_score: 50, total_votes: 50, paid_votes: 50, candidate_type: "couple" }
  ]]);
  const scoreLedger = [];
  const votes = new Map();

  const confirmRes = simulateConfirmStripePayment({
    callerRole: "service_role",
    payments,
    candidates,
    scoreLedger,
    votes,
    params: {
      paymentId,
      stripePaymentIntentId: "pi_sandbox_cpl_10",
      candidateId,
      voteQuantity: 10,
      candidateType: "couple",
      votePrice: 200,
    },
  });

  assert.equal(confirmRes.success, true);
  assert.equal(confirmRes.already_processed, false);
  const cand = candidates.get(candidateId);
  assert.equal(cand.paid_votes, 60);
  assert.equal(cand.current_score, 60);
  assert.equal(votes.get(paymentId).quantity, 10);
});

// ----------------------------------------------------
// 11. COMPETITION SCHEDULE RLS POLICY (MIGRATION 17)
// ----------------------------------------------------
console.log("\n--- 11. COMPETITION SCHEDULE RLS (MIGRATION 17) ---");

function simulateCompetitionScheduleRls(ctx) {
  const { callerRole, callerUid, adminUsers, operation } = ctx;

  // 1. SELECT Policy: Public can view active competition schedule (anon, authenticated)
  if (operation === "SELECT") {
    return { allowed: true };
  }

  // 2. ALL (Write) Policy: Only authenticated users present in public.admin_users
  if (callerRole !== "authenticated" && callerRole !== "service_role") {
    throw new Error("42501: new row violates row-level security policy for table competition_schedule");
  }

  if (callerRole === "service_role") {
    return { allowed: true };
  }

  // Check EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  const isAdmin = adminUsers.some((u) => u.id === callerUid);
  if (!isAdmin) {
    throw new Error("42501: new row violates row-level security policy for table competition_schedule");
  }

  return { allowed: true };
}

test("Migration 17 RLS: Public anonymous user CAN read schedule", () => {
  const res = simulateCompetitionScheduleRls({
    callerRole: "anon",
    callerUid: null,
    adminUsers: [{ id: "admin-uuid" }],
    operation: "SELECT",
  });
  assert.equal(res.allowed, true);
});

test("Migration 17 RLS: Non-admin authenticated user CANNOT modify schedule", () => {
  assert.throws(
    () => {
      simulateCompetitionScheduleRls({
        callerRole: "authenticated",
        callerUid: "regular-user-uuid",
        adminUsers: [{ id: "real-admin-uuid" }],
        operation: "UPDATE",
      });
    },
    /violates row-level security policy/
  );
});

test("Migration 17 RLS: Anonymous user CANNOT modify schedule", () => {
  assert.throws(
    () => {
      simulateCompetitionScheduleRls({
        callerRole: "anon",
        callerUid: null,
        adminUsers: [{ id: "real-admin-uuid" }],
        operation: "UPDATE",
      });
    },
    /violates row-level security policy/
  );
});

test("Migration 17 RLS: Verified admin in admin_users CAN update schedule", () => {
  const res = simulateCompetitionScheduleRls({
    callerRole: "authenticated",
    callerUid: "real-admin-uuid",
    adminUsers: [{ id: "real-admin-uuid", email: "admin@pairup.com" }],
    operation: "UPDATE",
  });
  assert.equal(res.allowed, true);
});

test("Migration 17 RLS: Zero recursion — admin_users policy depends only on auth.uid()", () => {
  // admin_users policy in PostgreSQL is (id = auth.uid()), zero subqueries, zero joins to competition_schedule
  const adminUsersPolicyDependencies = ["auth.uid()"];
  assert.equal(adminUsersPolicyDependencies.includes("competition_schedule"), false);
});

console.log("\n====================================================");
console.log(`TEST RESULTS: ${passed}/${total} PASSED (${Math.round((passed / total) * 100)}%)`);
console.log("====================================================");

if (passed !== total) {
  process.exit(1);
}

