import { createClient } from "npm:@supabase/supabase-js@^2";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") as string,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string
);

const ALLOWED_ORIGIN = Deno.env.get("SITE_URL") ?? "";

function getCorsHeaders(requestOrigin: string | null): HeadersInit {
  const allowedOrigin = ALLOWED_ORIGIN || requestOrigin || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const requestOrigin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(requestOrigin);

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

    // Basic sanity check on session_id format (Stripe session IDs: cs_test_... or cs_live_...)
    if (sessionId.length > 256 || !/^cs_[a-zA-Z0-9_]+$/.test(sessionId)) {
      return new Response(
        JSON.stringify({ error: "Invalid session_id format" }),
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
    console.error("verify-payment error:", (err as Error).message);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
