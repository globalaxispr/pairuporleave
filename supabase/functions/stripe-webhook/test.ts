// Deno test harness for stripe-webhook handlers (DI version + Safe Reconciliation)
import { assertEquals, assert, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type Stripe from "npm:stripe@^17";
import { createHandlers } from "../stripe-webhook/handlers.ts";
import type { StripeSessionVerifier } from "../stripe-webhook/handlers.ts";

// ---------------------------------------------------------------------------
// Mock Stripe Server-Side Client – simulates stripe.checkout.sessions.retrieve
// ---------------------------------------------------------------------------
class MockStripe implements StripeSessionVerifier {
  public retrieveCalls: { id: string; params?: { expand?: string[] } }[] = [];
  private sessionFactory: (id: string) => Stripe.Checkout.Session;

  constructor(
    sessionOrFactory:
      | Stripe.Checkout.Session
      | ((id: string) => Stripe.Checkout.Session)
  ) {
    this.sessionFactory =
      typeof sessionOrFactory === "function"
        ? sessionOrFactory
        : () => sessionOrFactory;
  }

  public checkout = {
    sessions: {
      retrieve: async (
        id: string,
        params?: { expand?: string[] }
      ): Promise<Stripe.Checkout.Session> => {
        this.retrieveCalls.push({ id, params });
        return this.sessionFactory(id);
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Mock Supabase admin client – tracks calls, updates, votes, and errors.
// ---------------------------------------------------------------------------
class MockSupabase {
  public paymentRecord: any;
  public candidateRecord: any;
  public voteRecord: any;
  public rpcCalls: Record<string, { count: number; args: any[] }> = {};
  public forceRpcError: boolean = false;
  public simulateMissingRecord: boolean = false;
  public simulateMissingCandidate: boolean = false;

  private currentTable: string | null = null;
  private filters: Record<string, any> = {};

  constructor(record: any, candidate?: any, initialVote?: any) {
    this.paymentRecord = {
      stripe_session_id: "cs_test_123",
      ...record,
    };
    this.candidateRecord = candidate
      ? { ...candidate }
      : {
          id: record.candidate_id,
          status: "active",
          candidate_type: record.candidate_type ?? "individual",
        };
    if (initialVote !== undefined) {
      this.voteRecord = initialVote;
    } else if (record.status === "paid") {
      this.voteRecord = {
        id: `vote_${record.id}`,
        payment_id: record.id,
        candidate_id: record.candidate_id,
        quantity: record.vote_quantity,
      };
    } else {
      this.voteRecord = null;
    }
  }

  from(table: string) {
    this.currentTable = table;
    this.filters = {};
    return this;
  }
  select(_cols: string) { return this; }
  eq(col: string, val: any) {
    this.filters[col] = val;
    return this;
  }

  maybeSingle() {
    if (this.currentTable === "competition_schedule") {
      return { data: null, error: null };
    }
    if (this.currentTable === "votes") {
      if (this.voteRecord && this.filters["payment_id"] === this.voteRecord.payment_id) {
        return { data: { ...this.voteRecord }, error: null };
      }
      return { data: null, error: null };
    }
    if (this.simulateMissingRecord) {
      return { data: null, error: null };
    }
    if (
      this.currentTable === "payments" &&
      this.paymentRecord.stripe_session_id &&
      this.filters["stripe_session_id"] &&
      this.filters["stripe_session_id"] !== this.paymentRecord.stripe_session_id
    ) {
      return { data: null, error: null };
    }
    return { data: { ...this.paymentRecord }, error: null };
  }

  single() {
    if (this.currentTable === "candidates") {
      if (!this.simulateMissingCandidate && this.filters["id"] === this.candidateRecord.id) {
        return { data: { ...this.candidateRecord }, error: null };
      }
      return {
        data: null,
        error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
      };
    }
    return {
      data: null,
      error: { message: `MockSupabase.single() not implemented for table '${this.currentTable}'` },
    };
  }

  update(updates: any) {
    Object.assign(this.paymentRecord, updates);
    return this;
  }

  rpc(name: string, args: any) {
    if (!this.rpcCalls[name]) this.rpcCalls[name] = { count: 0, args: [] };
    this.rpcCalls[name].count++;
    this.rpcCalls[name].args.push(args);
    if (this.forceRpcError) {
      return { data: null, error: new Error("Simulated RPC failure") };
    }
    if (name !== "confirm_stripe_payment") {
      return { data: null, error: new Error(`MockSupabase.rpc() not implemented for '${name}'`) };
    }
    return this.confirmStripePaymentHardened(args);
  }

  // Simulates hardened public.confirm_stripe_payment (payment_intent_hardening_patch.sql)
  private confirmStripePaymentHardened(args: any) {
    const payment = this.paymentRecord;
    const cleanPi = typeof args.p_stripe_payment_intent_id === "string"
      ? args.p_stripe_payment_intent_id.trim()
      : "";

    if (!cleanPi || !/^pi_[A-Za-z0-9_]+$/.test(cleanPi)) {
      return {
        data: null,
        error: new Error(
          `Payment integrity mismatch: valid Stripe PaymentIntent ID (pi_...) is required for payment ${args.p_payment_id}.`
        ),
      };
    }

    if (payment.id !== args.p_payment_id) {
      return { data: null, error: new Error(`Payment ${args.p_payment_id} not found`) };
    }

    if (payment.candidate_id !== args.p_candidate_id) {
      return {
        data: null,
        error: new Error(
          `Payment integrity mismatch: candidate_id ${args.p_candidate_id} does not match payment record ${payment.candidate_id}.`
        ),
      };
    }

    if (payment.vote_quantity !== args.p_vote_quantity) {
      return {
        data: null,
        error: new Error(
          `Payment integrity mismatch: vote_quantity ${args.p_vote_quantity} does not match payment record ${payment.vote_quantity}.`
        ),
      };
    }

    if (payment.candidate_type !== args.p_candidate_type) {
      return {
        data: null,
        error: new Error(
          `Payment integrity mismatch: candidate_type ${args.p_candidate_type} does not match payment record ${payment.candidate_type}.`
        ),
      };
    }

    if (payment.vote_price !== args.p_vote_price) {
      return {
        data: null,
        error: new Error(
          `Payment integrity mismatch: vote_price ${args.p_vote_price} does not match payment record ${payment.vote_price}.`
        ),
      };
    }

    const subtotal =
      typeof payment.subtotal_amount === "number"
        ? payment.subtotal_amount
        : payment.vote_quantity * payment.vote_price;
    const serviceFee =
      typeof payment.service_fee_amount === "number" ? payment.service_fee_amount : 0;
    const tax = typeof payment.tax_amount === "number" ? payment.tax_amount : 0;

    if (subtotal !== payment.vote_quantity * payment.vote_price) {
      return {
        data: null,
        error: new Error(
          `Payment integrity mismatch: stored subtotal_amount ${subtotal} does not equal vote_quantity * vote_price.`
        ),
      };
    }

    if (serviceFee < 0 || tax < 0 || payment.amount !== subtotal + serviceFee + tax) {
      return {
        data: null,
        error: new Error(
          `Payment integrity mismatch: stored total amount ${payment.amount} does not equal subtotal_amount (${subtotal}) + service_fee_amount (${serviceFee}) + tax_amount (${tax}).`
        ),
      };
    }

    if (payment.stripe_payment_intent_id && payment.stripe_payment_intent_id !== cleanPi) {
      return {
        data: null,
        error: new Error(
          `Payment integrity mismatch (manual review required): Stripe PaymentIntent ${cleanPi} does not match recorded PaymentIntent ${payment.stripe_payment_intent_id}.`
        ),
      };
    }

    if (this.voteRecord) {
      if (payment.status !== "paid") {
        return {
          data: null,
          error: new Error(
            `Reconciliation conflict requiring manual review: payment ${payment.id} has status ${payment.status} but already has credited vote and ledger records.`
          ),
        };
      }
      if (!payment.stripe_payment_intent_id) {
        payment.stripe_payment_intent_id = cleanPi;
      }
      return {
        data: {
          success: true,
          already_processed: true,
          recovered: false,
          previous_status: payment.status,
          payment_id: args.p_payment_id,
          candidate_id: payment.candidate_id,
          vote_quantity: payment.vote_quantity,
          stripe_payment_intent_id: payment.stripe_payment_intent_id,
          message: "Payment already processed and credited.",
        },
        error: null,
      };
    }

    if (!["pending", "failed", "paid"].includes(payment.status)) {
      return {
        data: null,
        error: new Error(`Payment ${payment.id} is in non-recoverable status ${payment.status}, manual review required`),
      };
    }

    const previousStatus = payment.status;
    const isRecovery = previousStatus !== "pending";

    payment.status = "paid";
    payment.stripe_payment_intent_id = payment.stripe_payment_intent_id ?? cleanPi;
    this.voteRecord = {
      id: `vote_${payment.id}`,
      payment_id: payment.id,
      candidate_id: payment.candidate_id,
      quantity: payment.vote_quantity,
    };

    return {
      data: {
        success: true,
        already_processed: false,
        recovered: isRecovery,
        previous_status: previousStatus,
        payment_id: payment.id,
        candidate_id: payment.candidate_id,
        vote_quantity: payment.vote_quantity,
        stripe_payment_intent_id: payment.stripe_payment_intent_id,
      },
      error: null,
    };
  }
}

function makeSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: "cs_test_123",
    payment_status: "paid",
    currency: "usd",
    amount_total: 500,
    payment_intent: "pi_123",
    created: Math.floor(Date.now() / 1000),
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

// ---------------------------------------------------------------------------
// 1. Valid paid Checkout Session
// ---------------------------------------------------------------------------
Deno.test("1. valid paid checkout session transitions pending -> paid", async () => {
  const payment = {
    id: "pay_valid",
    status: "pending",
    amount: 500,
    currency: "usd",
    candidate_id: "cand_1",
    vote_quantity: 5,
    candidate_type: "individual",
    vote_price: 100,
    stripe_payment_intent_id: null,
    created_at: new Date().toISOString(),
  };
  const mock = new MockSupabase(payment);
  const { handleCheckoutCompleted } = createHandlers({ supabaseAdmin: mock as any });
  const session = makeSession();
  await handleCheckoutCompleted(session);
  assertEquals(mock.paymentRecord.status, "paid");
  assertEquals(mock.paymentRecord.stripe_payment_intent_id, "pi_123");
  assertEquals(mock.rpcCalls["confirm_stripe_payment"].count, 1);
});

// ---------------------------------------------------------------------------
// 2. Duplicate webhook delivery (idempotency)
// ---------------------------------------------------------------------------
Deno.test("2. duplicate webhook delivery is idempotent", async () => {
  const payment = {
    id: "pay_dup",
    status: "pending",
    amount: 500,
    currency: "usd",
    candidate_id: "cand_2",
    vote_quantity: 5,
    candidate_type: "individual",
    vote_price: 100,
    stripe_payment_intent_id: null,
    created_at: new Date().toISOString(),
  };
  const mock = new MockSupabase(payment);
  const { handleCheckoutCompleted } = createHandlers({ supabaseAdmin: mock as any });
  const session = makeSession();
  await handleCheckoutCompleted(session);
  await handleCheckoutCompleted(session);
  assertEquals(mock.paymentRecord.status, "paid");
  assertEquals(mock.rpcCalls["confirm_stripe_payment"].count, 1);
});

// ---------------------------------------------------------------------------
// 3. Amount mismatch – should fail and not call RPC
// ---------------------------------------------------------------------------
Deno.test("3. amount mismatch aborts processing", async () => {
  const payment = {
    id: "pay_amount_mismatch",
    status: "pending",
    amount: 500,
    currency: "usd",
    candidate_id: "cand_3",
    vote_quantity: 5,
    candidate_type: "individual",
    vote_price: 100,
    stripe_payment_intent_id: null,
    created_at: new Date().toISOString(),
  };
  const mock = new MockSupabase(payment);
  const { handleCheckoutCompleted } = createHandlers({ supabaseAdmin: mock as any });
  const session = makeSession({ amount_total: 600 });
  await handleCheckoutCompleted(session);
  assertEquals(mock.paymentRecord.status, "failed");
  assertEquals(mock.rpcCalls["confirm_stripe_payment"]?.count ?? 0, 0);
});

// ---------------------------------------------------------------------------
// 4. Currency mismatch – should fail and not call RPC
// ---------------------------------------------------------------------------
Deno.test("4. currency mismatch aborts processing", async () => {
  const payment = {
    id: "pay_currency_mismatch",
    status: "pending",
    amount: 500,
    currency: "usd",
    candidate_id: "cand_4",
    vote_quantity: 5,
    candidate_type: "individual",
    vote_price: 100,
    stripe_payment_intent_id: null,
    created_at: new Date().toISOString(),
  };
  const mock = new MockSupabase(payment);
  const { handleCheckoutCompleted } = createHandlers({ supabaseAdmin: mock as any });
  const session = makeSession({ currency: "eur" });
  await handleCheckoutCompleted(session);
  assertEquals(mock.paymentRecord.status, "failed");
  assertEquals(mock.rpcCalls["confirm_stripe_payment"]?.count ?? 0, 0);
});

// ---------------------------------------------------------------------------
// 5. PaymentIntent mismatch – rejected without overwriting stored PI or marking failed
// ---------------------------------------------------------------------------
Deno.test("5. paymentIntent mismatch on pending payment is rejected and preserves stored PaymentIntent", async () => {
  const payment = {
    id: "pay_pi_mismatch",
    status: "pending",
    amount: 500,
    currency: "usd",
    candidate_id: "cand_5",
    vote_quantity: 5,
    candidate_type: "individual",
    vote_price: 100,
    stripe_payment_intent_id: "pi_other",
    created_at: new Date().toISOString(),
  };
  const mock = new MockSupabase(payment);
  const { handleCheckoutCompleted } = createHandlers({ supabaseAdmin: mock as any });
  const session = makeSession({ payment_intent: "pi_123" });
  await assertRejects(
    async () => {
      await handleCheckoutCompleted(session);
    },
    Error,
    "Payment integrity mismatch: Stripe PaymentIntent",
  );
  assertEquals(mock.paymentRecord.status, "pending");
  assertEquals(mock.paymentRecord.stripe_payment_intent_id, "pi_other");
  assertEquals(mock.rpcCalls["confirm_stripe_payment"]?.count ?? 0, 0);
});

// ---------------------------------------------------------------------------
// 6. RPC failure – handler should throw an error and leave payment pending
// ---------------------------------------------------------------------------
Deno.test("6. rpc failure propagates error and leaves payment pending", async () => {
  const payment = {
    id: "pay_rpc_fail",
    status: "pending",
    amount: 500,
    currency: "usd",
    candidate_id: "cand_6",
    vote_quantity: 5,
    candidate_type: "individual",
    vote_price: 100,
    stripe_payment_intent_id: null,
    created_at: new Date().toISOString(),
  };
  const mock = new MockSupabase(payment);
  mock.forceRpcError = true;
  const { handleCheckoutCompleted } = createHandlers({ supabaseAdmin: mock as any });
  const session = makeSession();
  await assertRejects(
    async () => {
      await handleCheckoutCompleted(session);
    },
    Error,
    "Payment processing failed at database level",
  );
  assertEquals(mock.paymentRecord.status, "pending");
});

// ---------------------------------------------------------------------------
// 7. Expired / async_payment_failed session handling
// ---------------------------------------------------------------------------
Deno.test("7. checkout.session.expired marks pending payment as failed", async () => {
  const payment = {
    id: "pay_expired",
    stripe_session_id: "cs_expired",
    status: "pending",
    amount: 500,
    currency: "usd",
    candidate_id: "cand_7",
    vote_quantity: 5,
    candidate_type: "individual",
    vote_price: 100,
    stripe_payment_intent_id: null,
    created_at: new Date().toISOString(),
  };
  const mock = new MockSupabase(payment);
  const { handleCheckoutFailed } = createHandlers({ supabaseAdmin: mock as any });
  const session = makeSession({ id: "cs_expired", payment_intent: "pi_123" });
  await handleCheckoutFailed(session, "checkout.session.expired");
  assertEquals(mock.paymentRecord.status, "failed");
  assertEquals(mock.paymentRecord.stripe_payment_intent_id, "pi_123");
});

// ---------------------------------------------------------------------------
// 8. Missing payment record – handler should throw
// ---------------------------------------------------------------------------
Deno.test("8. missing payment record throws", async () => {
  const payment = {
    id: "does_not_matter",
    status: "pending",
    amount: 500,
    currency: "usd",
    candidate_id: "cand_8",
    vote_quantity: 5,
    candidate_type: "individual",
    vote_price: 100,
    stripe_payment_intent_id: null,
    created_at: new Date().toISOString(),
  };
  const mock = new MockSupabase(payment);
  mock.simulateMissingRecord = true;
  const { handleCheckoutCompleted } = createHandlers({ supabaseAdmin: mock as any });
  const session = makeSession();
  await assertRejects(
    async () => {
      await handleCheckoutCompleted(session);
    },
    Error,
    "Payment record not found for session",
  );
});

// ---------------------------------------------------------------------------
// 9. Missing or malformed PaymentIntent on paid session – rejected without marking failed
// ---------------------------------------------------------------------------
Deno.test("9. missing PaymentIntent on paid session throws and leaves payment pending", async () => {
  const payment = {
    id: "pay_missing_pi",
    status: "pending",
    amount: 500,
    currency: "usd",
    candidate_id: "cand_9",
    vote_quantity: 5,
    candidate_type: "individual",
    vote_price: 100,
    stripe_payment_intent_id: null,
    created_at: new Date().toISOString(),
  };
  const mock = new MockSupabase(payment);
  const { handleCheckoutCompleted } = createHandlers({ supabaseAdmin: mock as any });
  const session = makeSession({ payment_intent: null as any });
  await assertRejects(
    async () => {
      await handleCheckoutCompleted(session);
    },
    Error,
    "Missing or invalid Stripe PaymentIntent",
  );
  assertEquals(mock.paymentRecord.status, "pending");
  assertEquals(mock.paymentRecord.stripe_payment_intent_id, null);
  assertEquals(mock.rpcCalls["confirm_stripe_payment"]?.count ?? 0, 0);
});

// ---------------------------------------------------------------------------
// 10. Existing paid payment with repeated webhook (matching vs conflicting PI)
// ---------------------------------------------------------------------------
Deno.test("10. existing paid payment accepts repeated webhook with matching PI and rejects conflicting PI", async () => {
  const payment = {
    id: "pay_already_paid",
    status: "paid",
    amount: 500,
    currency: "usd",
    candidate_id: "cand_10",
    vote_quantity: 5,
    candidate_type: "individual",
    vote_price: 100,
    stripe_payment_intent_id: "pi_123",
    created_at: new Date().toISOString(),
  };
  const mock = new MockSupabase(payment);
  const { handleCheckoutCompleted } = createHandlers({ supabaseAdmin: mock as any });

  await handleCheckoutCompleted(makeSession({ payment_intent: "pi_123" }));
  assertEquals(mock.paymentRecord.status, "paid");
  assertEquals(mock.paymentRecord.stripe_payment_intent_id, "pi_123");
  assertEquals(mock.rpcCalls["confirm_stripe_payment"]?.count ?? 0, 0);

  await assertRejects(
    async () => {
      await handleCheckoutCompleted(makeSession({ payment_intent: "pi_attacker_999" }));
    },
    Error,
    "Payment integrity mismatch: Stripe PaymentIntent",
  );
  assertEquals(mock.paymentRecord.status, "paid");
  assertEquals(mock.paymentRecord.stripe_payment_intent_id, "pi_123");
});

// ---------------------------------------------------------------------------
// 11. Incorrect candidate or vote quantity (DB bounds + metadata cross-check)
// ---------------------------------------------------------------------------
Deno.test("11. incorrect candidate or vote quantity is rejected", async () => {
  const badQtyPayment = {
    id: "pay_bad_qty",
    status: "pending",
    amount: 500,
    currency: "usd",
    candidate_id: "cand_11",
    vote_quantity: 0,
    candidate_type: "individual",
    vote_price: 100,
    stripe_payment_intent_id: null,
    created_at: new Date().toISOString(),
  };
  const mockA = new MockSupabase(badQtyPayment);
  const handlersA = createHandlers({ supabaseAdmin: mockA as any });
  await handlersA.handleCheckoutCompleted(makeSession());
  assertEquals(mockA.paymentRecord.status, "failed");
  assertEquals(mockA.rpcCalls["confirm_stripe_payment"]?.count ?? 0, 0);

  const validPayment = {
    id: "pay_meta_mismatch",
    status: "pending",
    amount: 500,
    currency: "usd",
    candidate_id: "cand_11",
    vote_quantity: 5,
    candidate_type: "individual",
    vote_price: 100,
    stripe_payment_intent_id: null,
    created_at: new Date().toISOString(),
  };
  const mockB = new MockSupabase(validPayment);
  const handlersB = createHandlers({ supabaseAdmin: mockB as any });

  await assertRejects(
    async () => {
      await handlersB.handleCheckoutCompleted(
        makeSession({ metadata: { candidate_id: "cand_other", vote_quantity: "5" } as any })
      );
    },
    Error,
    "session metadata candidate_id",
  );
  assertEquals(mockB.paymentRecord.status, "pending");

  await assertRejects(
    async () => {
      await handlersB.handleCheckoutCompleted(
        makeSession({ metadata: { candidate_id: "cand_11", vote_quantity: "99" } as any })
      );
    },
    Error,
    "session metadata vote_quantity",
  );
  assertEquals(mockB.paymentRecord.status, "pending");
  assertEquals(mockB.rpcCalls["confirm_stripe_payment"]?.count ?? 0, 0);
});

// ---------------------------------------------------------------------------
// 12. Paid Stripe payment with local status 'failed' is safely reconciled after server-side Stripe verification
// ---------------------------------------------------------------------------
Deno.test("12. paid Stripe payment with local status 'failed' is verified against Stripe API and reconciled exactly once", async () => {
  const payment = {
    id: "pay_failed_but_paid",
    stripe_session_id: "cs_reconcile_1",
    status: "failed",
    amount: 600,
    currency: "usd",
    candidate_id: "cand_reconcile_1",
    vote_quantity: 3,
    candidate_type: "couple",
    vote_price: 200,
    stripe_payment_intent_id: "pi_reconcile_1",
    created_at: new Date().toISOString(),
  };
  const mockDb = new MockSupabase(payment);
  const mockStripe = new MockStripe(
    makeSession({
      id: "cs_reconcile_1",
      payment_status: "paid",
      amount_total: 600,
      currency: "usd",
      payment_intent: {
        id: "pi_reconcile_1",
        status: "succeeded",
        amount_received: 600,
        currency: "usd",
      } as any,
      metadata: {
        payment_id: "pay_failed_but_paid",
        candidate_id: "cand_reconcile_1",
        vote_quantity: "3",
      } as any,
    })
  );

  const { handleCheckoutCompleted } = createHandlers({
    supabaseAdmin: mockDb as any,
    stripe: mockStripe,
  });

  await handleCheckoutCompleted(
    makeSession({
      id: "cs_reconcile_1",
      payment_status: "paid",
      amount_total: 600,
      currency: "usd",
      payment_intent: "pi_reconcile_1",
    })
  );

  assertEquals(mockStripe.retrieveCalls.length, 1, "Must query Stripe server-side API to verify failed payment");
  assertEquals(mockDb.paymentRecord.status, "paid", "Status must transition failed -> paid");
  assertEquals(mockDb.paymentRecord.stripe_payment_intent_id, "pi_reconcile_1");
  assertEquals(mockDb.rpcCalls["confirm_stripe_payment"].count, 1, "RPC must be called once");
  assert(mockDb.voteRecord !== null, "Vote record must be created");
});

// ---------------------------------------------------------------------------
// 13. Out-of-order: Expired or failed event followed by verified successful payment recovers cleanly;
//     expired after paid does NOT downgrade paid payment
// ---------------------------------------------------------------------------
Deno.test("13. expired or failed event followed by verified successful payment reconciles once; expired after paid does not downgrade", async () => {
  const payment = {
    id: "pay_ooo_recover",
    stripe_session_id: "cs_ooo_recover",
    status: "pending",
    amount: 500,
    currency: "usd",
    candidate_id: "cand_13",
    vote_quantity: 5,
    candidate_type: "individual",
    vote_price: 100,
    stripe_payment_intent_id: null,
    created_at: new Date().toISOString(),
  };
  const mockDb = new MockSupabase(payment);
  const mockStripe = new MockStripe(
    makeSession({
      id: "cs_ooo_recover",
      payment_status: "paid",
      amount_total: 500,
      currency: "usd",
      payment_intent: {
        id: "pi_ooo_recover",
        status: "succeeded",
        amount_received: 500,
        currency: "usd",
      } as any,
    })
  );

  const handlers = createHandlers({
    supabaseAdmin: mockDb as any,
    stripe: mockStripe,
  });

  // Step 1: expired event arrives first -> marks pending payment as failed
  await handlers.handleCheckoutFailed(
    makeSession({ id: "cs_ooo_recover", payment_intent: "pi_ooo_recover" }),
    "checkout.session.expired"
  );
  assertEquals(mockDb.paymentRecord.status, "failed");

  // Step 2: verified paid event arrives later -> server-side Stripe check confirms paid -> recovers to paid & credits once
  await handlers.handleCheckoutCompleted(
    makeSession({
      id: "cs_ooo_recover",
      payment_intent: "pi_ooo_recover",
      payment_status: "paid",
      amount_total: 500,
      currency: "usd",
    })
  );
  assertEquals(mockStripe.retrieveCalls.length, 1);
  assertEquals(mockDb.paymentRecord.status, "paid");
  assertEquals(mockDb.rpcCalls["confirm_stripe_payment"].count, 1);

  // Step 3: late async_payment_failed arrives after paid -> does NOT downgrade paid status
  await handlers.handleCheckoutFailed(
    makeSession({ id: "cs_ooo_recover", payment_intent: "pi_ooo_recover" }),
    "checkout.session.async_payment_failed"
  );
  assertEquals(mockDb.paymentRecord.status, "paid");
});

// ---------------------------------------------------------------------------
// 14. Duplicate recovery attempts credit votes exactly once
// ---------------------------------------------------------------------------
Deno.test("14. duplicate recovery attempts credit votes only once", async () => {
  const payment = {
    id: "pay_dup_recovery",
    stripe_session_id: "cs_dup_recovery",
    status: "failed",
    amount: 400,
    currency: "usd",
    candidate_id: "cand_14",
    vote_quantity: 2,
    candidate_type: "couple",
    vote_price: 200,
    stripe_payment_intent_id: "pi_dup_rec",
    created_at: new Date().toISOString(),
  };
  const mockDb = new MockSupabase(payment);
  const mockStripe = new MockStripe(
    makeSession({
      id: "cs_dup_recovery",
      payment_status: "paid",
      amount_total: 400,
      currency: "usd",
      payment_intent: {
        id: "pi_dup_rec",
        status: "succeeded",
        amount_received: 400,
        currency: "usd",
      } as any,
    })
  );

  const { handleCheckoutCompleted, reconcilePaymentSession } = createHandlers({
    supabaseAdmin: mockDb as any,
    stripe: mockStripe,
  });

  // First recovery via reconcilePaymentSession
  await reconcilePaymentSession("cs_dup_recovery");
  assertEquals(mockDb.paymentRecord.status, "paid");
  assertEquals(mockDb.rpcCalls["confirm_stripe_payment"].count, 1);

  // Second recovery attempt via reconcilePaymentSession AND webhook replay -> idempotent skip, 0 extra RPC calls
  await reconcilePaymentSession("cs_dup_recovery");
  await handleCheckoutCompleted(
    makeSession({
      id: "cs_dup_recovery",
      payment_status: "paid",
      amount_total: 400,
      currency: "usd",
      payment_intent: "pi_dup_rec",
    })
  );
  assertEquals(mockDb.rpcCalls["confirm_stripe_payment"].count, 1, "Must never credit a second time");
});

// ---------------------------------------------------------------------------
// 15. Never blindly converts failed payment to paid when Stripe server says unpaid/failed
// ---------------------------------------------------------------------------
Deno.test("15. failed payment is NOT converted to paid when server-side Stripe check shows unpaid or non-succeeded PaymentIntent", async () => {
  const payment = {
    id: "pay_genuinely_failed",
    stripe_session_id: "cs_genuinely_failed",
    status: "failed",
    amount: 500,
    currency: "usd",
    candidate_id: "cand_15",
    vote_quantity: 5,
    candidate_type: "individual",
    vote_price: 100,
    stripe_payment_intent_id: "pi_failed_15",
    created_at: new Date().toISOString(),
  };
  const mockDb = new MockSupabase(payment);

  // Case A: Stripe server says payment_status = 'unpaid'
  const mockStripeUnpaid = new MockStripe(
    makeSession({
      id: "cs_genuinely_failed",
      payment_status: "unpaid",
      amount_total: 500,
      currency: "usd",
      payment_intent: "pi_failed_15",
    })
  );
  const handlersA = createHandlers({
    supabaseAdmin: mockDb as any,
    stripe: mockStripeUnpaid,
  });

  await assertRejects(
    async () => {
      await handlersA.handleCheckoutCompleted(
        makeSession({
          id: "cs_genuinely_failed",
          payment_status: "paid", // spoofed or stale event claiming paid
          amount_total: 500,
          currency: "usd",
          payment_intent: "pi_failed_15",
        })
      );
    },
    Error,
    "Reconciliation rejected: server-side Stripe session cs_genuinely_failed has payment_status 'unpaid'",
  );
  assertEquals(mockDb.paymentRecord.status, "failed");
  assertEquals(mockDb.rpcCalls["confirm_stripe_payment"]?.count ?? 0, 0);

  // Case B: Stripe server says payment_intent.status = 'canceled'
  const mockStripeCanceledPi = new MockStripe(
    makeSession({
      id: "cs_genuinely_failed",
      payment_status: "paid",
      amount_total: 500,
      currency: "usd",
      payment_intent: {
        id: "pi_failed_15",
        status: "canceled",
        amount_received: 0,
        currency: "usd",
      } as any,
    })
  );
  const handlersB = createHandlers({
    supabaseAdmin: mockDb as any,
    stripe: mockStripeCanceledPi,
  });

  await assertRejects(
    async () => {
      await handlersB.handleCheckoutCompleted(
        makeSession({
          id: "cs_genuinely_failed",
          payment_status: "paid",
          amount_total: 500,
          currency: "usd",
          payment_intent: "pi_failed_15",
        })
      );
    },
    Error,
    "Reconciliation rejected: server-side PaymentIntent pi_failed_15 has status 'canceled'",
  );
  assertEquals(mockDb.paymentRecord.status, "failed");
  assertEquals(mockDb.rpcCalls["confirm_stripe_payment"]?.count ?? 0, 0);
});

// ---------------------------------------------------------------------------
// 16. Conflicting PaymentIntent or Checkout Session / payment_id is rejected and reported
// ---------------------------------------------------------------------------
Deno.test("16. conflicting PaymentIntent or Checkout Session / metadata.payment_id is rejected during reconciliation", async () => {
  const payment = {
    id: "pay_conflict_16",
    stripe_session_id: "cs_conflict_16",
    status: "failed",
    amount: 500,
    currency: "usd",
    candidate_id: "cand_16",
    vote_quantity: 5,
    candidate_type: "individual",
    vote_price: 100,
    stripe_payment_intent_id: "pi_recorded_16",
    created_at: new Date().toISOString(),
  };
  const mockDb = new MockSupabase(payment);

  // Case A: Conflicting PaymentIntent on failed row
  const mockStripeWrongPi = new MockStripe(
    makeSession({
      id: "cs_conflict_16",
      payment_status: "paid",
      amount_total: 500,
      currency: "usd",
      payment_intent: "pi_different_16",
    })
  );
  const handlersA = createHandlers({
    supabaseAdmin: mockDb as any,
    stripe: mockStripeWrongPi,
  });

  await assertRejects(
    async () => {
      await handlersA.handleCheckoutCompleted(
        makeSession({
          id: "cs_conflict_16",
          payment_status: "paid",
          amount_total: 500,
          currency: "usd",
          payment_intent: "pi_different_16",
        })
      );
    },
    Error,
    "Payment integrity mismatch: Stripe PaymentIntent 'pi_different_16' does not match recorded PaymentIntent 'pi_recorded_16'",
  );
  assertEquals(mockDb.paymentRecord.status, "failed");
  assertEquals(mockDb.paymentRecord.stripe_payment_intent_id, "pi_recorded_16");

  // Case B: Conflicting metadata.payment_id (attempting to substitute another payment row)
  await assertRejects(
    async () => {
      await handlersA.handleCheckoutCompleted(
        makeSession({
          id: "cs_conflict_16",
          payment_status: "paid",
          amount_total: 500,
          currency: "usd",
          payment_intent: "pi_recorded_16",
          metadata: { payment_id: "pay_other_row" } as any,
        })
      );
    },
    Error,
    "session metadata payment_id 'pay_other_row' does not match recorded payment 'pay_conflict_16'",
  );
  assertEquals(mockDb.paymentRecord.status, "failed");
  assertEquals(mockDb.rpcCalls["confirm_stripe_payment"]?.count ?? 0, 0);
});

// ---------------------------------------------------------------------------
// 17. Fee-bearing checkout session validates subtotal + service_fee = amount and credits ONLY vote_quantity
// ---------------------------------------------------------------------------
Deno.test("17. fee-bearing paid checkout session validates subtotal + service_fee = amount and credits ONLY vote_quantity", async () => {
  const payment = {
    id: "pay_fee_17",
    stripe_session_id: "cs_fee_17",
    status: "pending",
    subtotal_amount: 1000,
    service_fee_amount: 61,
    tax_amount: 0,
    amount: 1061,
    currency: "usd",
    candidate_id: "cand_17",
    vote_quantity: 10,
    candidate_type: "individual",
    vote_price: 100,
    stripe_payment_intent_id: null,
    created_at: new Date().toISOString(),
  };
  const mockDb = new MockSupabase(payment);
  const { handleCheckoutCompleted } = createHandlers({ supabaseAdmin: mockDb as any });

  await handleCheckoutCompleted(
    makeSession({
      id: "cs_fee_17",
      payment_status: "paid",
      amount_total: 1061,
      currency: "usd",
      payment_intent: "pi_fee_17",
      metadata: {
        candidate_id: "cand_17",
        vote_quantity: "10",
      } as any,
    })
  );

  assertEquals(mockDb.paymentRecord.status, "paid");
  assertEquals(mockDb.rpcCalls["confirm_stripe_payment"].count, 1);
  assertEquals(mockDb.rpcCalls["confirm_stripe_payment"].args[0].p_vote_quantity, 10, "Must credit strictly 10 votes, never derived from 1061 total");
  assertEquals(mockDb.rpcCalls["confirm_stripe_payment"].args[0].p_vote_price, 100);
});

// ---------------------------------------------------------------------------
// 18. Legacy pending checkout session (service_fee_amount = 0) created before fee activation confirms cleanly
// ---------------------------------------------------------------------------
Deno.test("18. legacy pending checkout session (service_fee_amount = 0) confirms cleanly", async () => {
  const payment = {
    id: "pay_legacy_pending_18",
    stripe_session_id: "cs_legacy_pending_18",
    status: "pending",
    subtotal_amount: 200,
    service_fee_amount: 0,
    tax_amount: 0,
    amount: 200,
    currency: "usd",
    candidate_id: "cand_18",
    vote_quantity: 1,
    candidate_type: "couple",
    vote_price: 200,
    stripe_payment_intent_id: null,
    created_at: new Date().toISOString(),
  };
  const mockDb = new MockSupabase(payment);
  const { handleCheckoutCompleted } = createHandlers({ supabaseAdmin: mockDb as any });

  await handleCheckoutCompleted(
    makeSession({
      id: "cs_legacy_pending_18",
      payment_status: "paid",
      amount_total: 200,
      currency: "usd",
      payment_intent: "pi_legacy_18",
    })
  );

  assertEquals(mockDb.paymentRecord.status, "paid");
  assertEquals(mockDb.rpcCalls["confirm_stripe_payment"].count, 1);
  assertEquals(mockDb.rpcCalls["confirm_stripe_payment"].args[0].p_vote_quantity, 1);
});

// ---------------------------------------------------------------------------
// 19. Payment accounting invariant mismatch (amount != subtotal + service_fee + tax) marks failed and refuses credit
// ---------------------------------------------------------------------------
Deno.test("19. payment accounting invariant mismatch marks payment failed and refuses vote credit", async () => {
  const payment = {
    id: "pay_bad_invariant_19",
    stripe_session_id: "cs_bad_invariant_19",
    status: "pending",
    subtotal_amount: 500,
    service_fee_amount: 40,
    tax_amount: 0,
    amount: 600, // 600 != 500 + 40 + 0
    currency: "usd",
    candidate_id: "cand_19",
    vote_quantity: 5,
    candidate_type: "individual",
    vote_price: 100,
    stripe_payment_intent_id: null,
    created_at: new Date().toISOString(),
  };
  const mockDb = new MockSupabase(payment);
  const { handleCheckoutCompleted } = createHandlers({ supabaseAdmin: mockDb as any });

  await handleCheckoutCompleted(
    makeSession({
      id: "cs_bad_invariant_19",
      payment_status: "paid",
      amount_total: 600,
      currency: "usd",
      payment_intent: "pi_bad_19",
    })
  );

  assertEquals(mockDb.paymentRecord.status, "failed");
  assertEquals(mockDb.rpcCalls["confirm_stripe_payment"]?.count ?? 0, 0);
});
