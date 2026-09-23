import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@^2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") as string, {
  apiVersion: "2024-06-20",
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") as string,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json() as { candidate_id?: string; vote_quantity?: number };
    const { candidate_id, vote_quantity } = body;

    // Validate inputs
    if (!candidate_id || typeof candidate_id !== "string") {
      return new Response(
        JSON.stringify({ error: "candidate_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!vote_quantity || !Number.isInteger(vote_quantity) || vote_quantity < 1) {
      return new Response(
        JSON.stringify({ error: "vote_quantity must be a positive integer" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch and validate candidate first to determine pricing server-side
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

    // Determine candidate type & server-side vote price (source of truth)
    // Individual: 1 vote = $1 (100 cents)
    // Couple: 1 vote = $2 (200 cents)
    const candidateType = (candidate.candidate_type as string) === "couple" ? "couple" : "individual";
    const unitPriceCents = candidateType === "couple" ? 200 : 100;
    const amountCents = vote_quantity * unitPriceCents;
    const candidateDisplayName = candidate.display_name || candidate.name;

    const origin = req.headers.get("origin") ?? "http://localhost:5173";

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${vote_quantity} Vote${vote_quantity > 1 ? "s" : ""} for ${candidateDisplayName}`,
              description: `${candidate.category} · ${candidateType === "couple" ? "Couple Candidate ($2/vote)" : "Individual Candidate ($1/vote)"} · VotePulse`,
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
      },
    });

    // Insert pending payment record with pricing details
    await supabaseAdmin.from("payments").insert({
      stripe_session_id: session.id,
      candidate_id: candidate.id,
      candidate_type: candidateType,
      vote_price: unitPriceCents,
      vote_quantity,
      amount: amountCents,
      currency: "usd",
      status: "pending",
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("create-checkout-session error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
