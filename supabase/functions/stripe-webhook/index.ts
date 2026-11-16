import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@^2";
import { createHandlers } from "./handlers.ts";

// Use SubtleCryptoProvider for Deno compatibility
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" as Stripe.StripeConfig["apiVersion"] })
  : null;
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAdminKey =
  Deno.env.get("SUPABASE_ADMIN_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const supabaseAdmin = (supabaseUrl && supabaseAdminKey)
  ? createClient(supabaseUrl, supabaseAdminKey)
  : null;

const {
  handleCheckoutCompleted,
  handleCheckoutFailed,
  handleChargeRefunded,
  handleChargeDispute,
} = createHandlers({ supabaseAdmin, stripe });

// IMPORTANT: This function must be deployed with --no-verify-jwt
// because Stripe does not send Supabase JWTs.
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!stripe || !webhookSecret || !supabaseAdmin) {
    console.error("Stripe webhook: Missing STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, or SUPABASE credentials in environment");
    return new Response(
      JSON.stringify({ error: "Webhook endpoint not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

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
      webhookSecret,
      undefined,
      cryptoProvider
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", (err as Error).message);
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 });
  }

  // Route Stripe events
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session, { source: "stripe_webhook" });
        break;
      }

      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutFailed(session, event.type);
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        await handleChargeRefunded(charge, event.id);
        break;
      }

      case "charge.dispute.created":
      case "charge.dispute.closed": {
        const dispute = event.data.object as Stripe.Dispute;
        await handleChargeDispute(dispute, event.type, event.id);
        break;
      }

      default: {
        // Unhandled event type acknowledged safely
        break;
      }
    }
  } catch (err) {
    console.error("Critical error processing Stripe webhook event:", (err as Error).message);
    // Return retryable HTTP 500 error to Stripe so it retries the webhook delivery
    return new Response(
      JSON.stringify({
        error: "Webhook processing failed. Retry requested.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
