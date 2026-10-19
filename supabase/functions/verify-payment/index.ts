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

// Rate limiting: 60 queries per IP per minute
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;
const ipRequestHistory = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  if (ip === "unknown") return false;
  const now = Date.now();
  const timestamps = ipRequestHistory.get(ip) || [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }

  recent.push(now);
  ipRequestHistory.set(ip, recent);

  if (ipRequestHistory.size > 1000) {
    for (const [k, v] of ipRequestHistory.entries()) {
      const active = v.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
      if (active.length === 0) ipRequestHistory.delete(k);
      else ipRequestHistory.set(k, active);
    }
  }

  return false;
}

Deno.serve(async (req) => {
  const requestOrigin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const clientIp =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  if (isRateLimited(clientIp)) {
    return new Response(
      JSON.stringify({ error: "Too many verification requests. Please wait a minute and try again." }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      }
    );
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
