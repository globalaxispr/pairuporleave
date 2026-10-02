import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@^2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") as string, {
  apiVersion: "2024-06-20",
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") as string,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string
);

// ====================================================
// SECURITY: Maximum votes allowed per single transaction.
// This does NOT limit total lifetime votes (business rule preserved).
// It prevents absurdly large checkout requests.
// ====================================================
const MAX_VOTES_PER_TRANSACTION = 1000;
const MIN_VOTES_PER_TRANSACTION = 1;

// Restrict CORS to the configured production domain.
// Falls back to permissive wildcard only if not configured (local dev safety).
const ALLOWED_ORIGIN = Deno.env.get("SITE_URL") ?? "";

function getCorsHeaders(requestOrigin: string | null): HeadersInit {
  // If SITE_URL is set, only allow that origin (production hardening).
  // If not set (local dev), allow the request origin as a fallback.
  const allowedOrigin = ALLOWED_ORIGIN || requestOrigin || "*";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Simple UUID v4 format validation to prevent injection via candidate_id
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const requestOrigin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(requestOrigin);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json() as { candidate_id?: string; vote_quantity?: number };
    const { candidate_id, vote_quantity } = body;

    // Validate candidate_id — must be a valid UUID (prevents injection)
    if (!candidate_id || typeof candidate_id !== "string" || !UUID_REGEX.test(candidate_id)) {
      return new Response(
        JSON.stringify({ error: "candidate_id must be a valid UUID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate vote_quantity — server-side enforced bounds
    if (
      !vote_quantity ||
      !Number.isInteger(vote_quantity) ||
      vote_quantity < MIN_VOTES_PER_TRANSACTION ||
      vote_quantity > MAX_VOTES_PER_TRANSACTION
    ) {
      return new Response(
        JSON.stringify({
          error: `vote_quantity must be an integer between ${MIN_VOTES_PER_TRANSACTION} and ${MAX_VOTES_PER_TRANSACTION}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch and validate candidate server-side — all pricing is derived here, never trusted from client
    const { data: candidate, error: candErr } = await supabaseAdmin
      .from("candidates")
      .select("id, name, display_name, candidate_type, status, category")
      .eq("id", candidate_id)
      .single();

    if (candErr || !candidate) {
      return new Response(
        JSON.stringify({ error: "Candidate not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (candidate.status !== "active") {
      return new Response(
        JSON.stringify({ error: "This candidate is not currently accepting votes." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ====================================================
    // SERVER-SIDE PRICING (authoritative — never from client)
    // Individual: 1 vote = $1 (100 cents)
    // Couple:     1 vote = $2 (200 cents)
    // ====================================================
    const candidateType = (candidate.candidate_type as string) === "couple" ? "couple" : "individual";
    const unitPriceCents = candidateType === "couple" ? 200 : 100;
    const amountCents = vote_quantity * unitPriceCents;
    const candidateDisplayName = candidate.display_name || candidate.name;

    const origin = requestOrigin ?? (ALLOWED_ORIGIN || "https://pairuporleave.com");

    // Create Stripe Checkout Session — amount and pricing set entirely server-side
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${vote_quantity} Vote${vote_quantity > 1 ? "s" : ""} for ${candidateDisplayName}`,
              description: `${candidate.category} · ${candidateType === "couple" ? "Couple Candidate ($2/vote)" : "Individual Candidate ($1/vote)"} · Pair Up or Leave`,
            },
            unit_amount: unitPriceCents,
          },
          quantity: vote_quantity,
        },
      ],
      mode: "payment",
      success_url: `${origin}/vote/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/vote/cancel`,
      metadata: {
        candidate_id: candidate.id,
        candidate_type: candidateType,
        vote_quantity: vote_quantity.toString(),
        vote_price: unitPriceCents.toString(),
        // Store expected total for webhook cross-verification
        expected_amount_cents: amountCents.toString(),
      },
    });

    // Insert pending payment record with server-side computed pricing
    const { error: insertErr } = await supabaseAdmin.from("payments").insert({
      stripe_session_id: session.id,
      candidate_id: candidate.id,
      candidate_type: candidateType,
      vote_price: unitPriceCents,
      vote_quantity,
      amount: amountCents,
      currency: "usd",
      status: "pending",
    });

    if (insertErr) {
      console.error("Failed to insert pending payment record:", insertErr.message);
      // Do not expose DB error details to client
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ url: session.url }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("create-checkout-session error:", (err as Error).message);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
