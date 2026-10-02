import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@^2";

// Use SubtleCryptoProvider for Deno compatibility
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") as string, {
  apiVersion: "2024-06-20",
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") as string,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string
);

// ====================================================
// SECURITY: Server-side vote quantity guard.
// Even if the metadata were manipulated somehow, the webhook
// refuses to create more votes than this per transaction.
// ====================================================
const MAX_VOTES_PER_TRANSACTION = 1000;

// IMPORTANT: This function must be deployed with --no-verify-jwt
// because Stripe does not send Supabase JWTs.
Deno.serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");

  if (!signature) {
    console.error("Missing Stripe-Signature header");
    return new Response("Missing signature", { status: 400 });
  }

  // Read raw body as text — MUST be raw, not parsed JSON, for signature verification
  const body = await req.text();

  let event: Stripe.Event;

  try {
    // Verify signature using async method (required for Deno SubtleCrypto)
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get("STRIPE_WEBHOOK_SECRET") as string,
      undefined,
      cryptoProvider
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", (err as Error).message);
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 });
  }

  // Handle verified payment completion event
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    await handleCheckoutCompleted(session);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const stripeSessionId = session.id;
  const metadata = session.metadata ?? {};
  const candidateId = metadata.candidate_id;
  const voteQuantity = parseInt(metadata.vote_quantity ?? "0", 10);

  // Validate metadata presence and sanity before any DB operations
  if (!candidateId || !voteQuantity || voteQuantity < 1) {
    console.error("Invalid or missing metadata in session:", stripeSessionId, metadata);
    return;
  }

  // Guard against absurdly large vote quantities (defense in depth)
  if (voteQuantity > MAX_VOTES_PER_TRANSACTION) {
    console.error(
      `Vote quantity ${voteQuantity} exceeds server-side maximum ${MAX_VOTES_PER_TRANSACTION} — session: ${stripeSessionId}`
    );
    return;
  }

  // ====================================================
  // IDEMPOTENCY CHECK
  // Only process if payment record exists and is still 'pending'.
  // Fetches the DB-stored amounts for cross-verification.
  // ====================================================
  const { data: existingPayment, error: fetchErr } = await supabaseAdmin
    .from("payments")
    .select("id, status, amount, vote_quantity, candidate_type, vote_price")
    .eq("stripe_session_id", stripeSessionId)
    .single();

  if (fetchErr || !existingPayment) {
    console.error("Payment record not found for session:", stripeSessionId);
    return;
  }

  if (existingPayment.status !== "pending") {
    console.log("Webhook already processed for session:", stripeSessionId, "status:", existingPayment.status);
    return; // Already handled — idempotent, skip
  }

  // ====================================================
  // PAYMENT AMOUNT CROSS-VERIFICATION
  // Verify that Stripe's reported amount_total matches what
  // the server stored in the payments record at checkout creation time.
  // This prevents metadata tampering from influencing vote allocation.
  // ====================================================
  const stripeAmountTotal = session.amount_total ?? 0;
  const dbStoredAmount = existingPayment.amount;

  if (stripeAmountTotal !== dbStoredAmount) {
    console.error(
      `CRITICAL: Amount mismatch for session ${stripeSessionId}. ` +
      `Stripe reported ${stripeAmountTotal} cents; DB stored ${dbStoredAmount} cents. ` +
      `Refusing to process — possible fraud or configuration error.`
    );
    // Mark payment as failed so admin is alerted via dashboard
    await supabaseAdmin
      .from("payments")
      .update({ status: "failed" })
      .eq("id", existingPayment.id);
    return;
  }

  // Cross-verify vote_quantity from metadata vs. DB record
  const dbVoteQuantity = existingPayment.vote_quantity;
  if (voteQuantity !== dbVoteQuantity) {
    console.error(
      `CRITICAL: Vote quantity mismatch for session ${stripeSessionId}. ` +
      `Metadata says ${voteQuantity}; DB stored ${dbVoteQuantity}. ` +
      `Using authoritative DB value.`
    );
    // Use DB-authoritative quantity, not the metadata value
  }

  // Use authoritative values from DB (not metadata) for vote creation
  const authoritativeVoteQuantity = dbVoteQuantity;
  const candidateType = existingPayment.candidate_type ?? "individual";
  const votePrice = existingPayment.vote_price ?? (candidateType === "couple" ? 200 : 100);

  const paymentId = existingPayment.id;
  const paymentIntentId = (session.payment_intent as string) ?? null;

  // ====================================================
  // Update payment status → paid
  // ====================================================
  const { error: updateErr } = await supabaseAdmin
    .from("payments")
    .update({
      status: "paid",
      stripe_payment_intent_id: paymentIntentId,
      candidate_type: candidateType,
      vote_price: votePrice,
    })
    .eq("id", paymentId)
    .eq("status", "pending"); // Optimistic locking: only update if still pending

  if (updateErr) {
    console.error("Failed to update payment status:", updateErr.message);
    return;
  }

  // ====================================================
  // Create vote record — UNIQUE index on payment_id
  // provides database-level idempotency guard.
  // ====================================================
  const { error: voteErr } = await supabaseAdmin.from("votes").insert({
    candidate_id: candidateId,
    payment_id: paymentId,
    quantity: authoritativeVoteQuantity,
  });

  if (voteErr) {
    if (voteErr.code === "23505") {
      // Unique constraint violation — vote record already exists (duplicate delivery)
      console.log("Vote record already exists for payment:", paymentId);
      return;
    }
    console.error("Failed to create vote record:", voteErr.message);
    return;
  }

  // ====================================================
  // Atomically update candidate score and append to score_ledger
  // Using the SECURITY DEFINER function which runs as the service role.
  // ====================================================
  const { error: scoreErr } = await supabaseAdmin.rpc("adjust_candidate_score", {
    p_candidate_id: candidateId,
    p_type: "PAID_VOTE",
    p_quantity: authoritativeVoteQuantity,
    p_reason: `Stripe Payment (${candidateType})`,
    p_admin_id: null,
    p_admin_email: null,
    p_reference_id: paymentId,
  });

  if (scoreErr) {
    console.error("Failed to record score adjustment via adjust_candidate_score, attempting fallback:", scoreErr.message);
    const { error: fallbackErr } = await supabaseAdmin.rpc("increment_candidate_votes", {
      p_candidate_id: candidateId,
      p_quantity: authoritativeVoteQuantity,
    });
    if (fallbackErr) {
      console.error("Fallback increment_candidate_votes also failed:", fallbackErr.message);
    }
  }

  console.log(
    `Successfully processed ${authoritativeVoteQuantity} votes for candidate ${candidateId} — session: ${stripeSessionId}`
  );
}
