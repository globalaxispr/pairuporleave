import { createClient } from "npm:@supabase/supabase-js@^2";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") as string,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: "session_id parameter is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up payment by Stripe session ID
    const { data: payment, error } = await supabaseAdmin
      .from("payments")
      .select(`
        id,
        status,
        vote_quantity,
        amount,
        currency,
        candidate_id,
        candidates (
          name,
          category,
          position
        )
      `)
      .eq("stripe_session_id", sessionId)
      .single();

    if (error || !payment) {
      return new Response(
        JSON.stringify({ error: "Payment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only expose safe fields — no Stripe keys, no sensitive data
    const candidate = (payment as { candidates?: { name: string; category: string; position: string } | null }).candidates;

    return new Response(
      JSON.stringify({
        status: payment.status,
        vote_quantity: payment.vote_quantity,
        amount: payment.amount,
        currency: payment.currency,
        candidate_name: candidate?.name ?? "Unknown",
        candidate_category: candidate?.category ?? "",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("verify-payment error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
