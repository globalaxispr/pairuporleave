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

// IMPORTANT: This function must be deployed with --no-verify-jwt
// because Stripe does not send Supabase JWTs.
Deno.serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");

  if (!signature) {
    console.error("Missing Stripe-Signature header");
    return new Response("Missing signature", { status: 400 });
  }

  // Read raw body as text — MUST be raw, not parsed JSON
  const body = await req.text();

  let event: Stripe.Event;

  try {
    // Verify signature using async method (required for Deno)
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get("STRIPE_WEBHOOK_SECRET") as string,
      undefined,
      cryptoProvider
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 });
  }

  // Handle the event
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

  if (!candidateId || !voteQuantity || voteQuantity < 1) {
    console.error("Invalid metadata in session:", stripeSessionId, metadata);
    return;
  }

  // ====================================================
  // IDEMPOTENCY CHECK
  // Only process if payment is still in 'pending' status.
  // If Stripe sends the same webhook twice, the record
  // will already be 'paid' and we skip processing.
  // ====================================================
  const { data: existingPayment, error: fetchErr } = await supabaseAdmin
    .from("payments")
    .select("id, status")
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

  const candidateType = metadata.candidate_type ?? "individual";
  const votePrice = parseInt(metadata.vote_price ?? (candidateType === "couple" ? "200" : "100"), 10);

  const paymentId = existingPayment.id;
  const paymentIntentId = session.payment_intent as string ?? null;

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
    .eq("id", paymentId);

  if (updateErr) {
    console.error("Failed to update payment status:", updateErr);
    return;
  }

  // ====================================================
  // Create vote record
  // The UNIQUE index on payment_id provides an additional
  // database-level guard against duplicate vote records.
  // ====================================================
  const { error: voteErr } = await supabaseAdmin.from("votes").insert({
    candidate_id: candidateId,
    payment_id: paymentId,
    quantity: voteQuantity,
  });

  if (voteErr) {
    if (voteErr.code === "23505") {
      // Unique constraint violation — already processed
      console.log("Vote record already exists for payment:", paymentId);
      return;
    }
    console.error("Failed to create vote record:", voteErr);
    return;
  }

  // ====================================================
  // Atomically update candidate score and append to score_ledger
  // Using the SECURITY DEFINER function which runs as
  // the service role, bypassing RLS.
  // ====================================================
  const { error: scoreErr } = await supabaseAdmin.rpc("adjust_candidate_score", {
    p_candidate_id: candidateId,
    p_type: "PAID_VOTE",
    p_quantity: voteQuantity,
    p_reason: `Stripe Payment (${candidateType})`,
    p_admin_id: null,
    p_admin_email: null,
    p_reference_id: paymentId,
  });

  if (scoreErr) {
    console.error("Failed to record score adjustment, attempting fallback:", scoreErr);
    await supabaseAdmin.rpc("increment_candidate_votes", {
      p_candidate_id: candidateId,
      p_quantity: voteQuantity,
    });
  }

  console.log(
    `Successfully processed ${voteQuantity} votes for candidate ${candidateId} — session: ${stripeSessionId}`
  );
}
