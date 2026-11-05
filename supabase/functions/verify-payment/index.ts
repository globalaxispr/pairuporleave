import { createClient } from "npm:@supabase/supabase-js@^2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdminKey =
  Deno.env.get("SUPABASE_ADMIN_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const supabaseAdmin = (supabaseUrl && supabaseAdminKey)
  ? createClient(supabaseUrl, supabaseAdminKey)
  : null;

const ALLOWED_ORIGIN = Deno.env.get("SITE_URL") ?? "";

function getCorsHeaders(requestOrigin: string | null): HeadersInit {
  let allowedOrigin = ALLOWED_ORIGIN || requestOrigin || "";
  if (requestOrigin && ALLOWED_ORIGIN) {
    try {
      const originHost = new URL(requestOrigin).hostname.replace(/^www\./, "");
      const allowedHost = new URL(ALLOWED_ORIGIN).hostname.replace(/^www\./, "");
      if (originHost === allowedHost) {
        allowedOrigin = requestOrigin;
      }
    } catch {
      // Fall back to configured ALLOWED_ORIGIN
    }
  }
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

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!supabaseAdmin) {
    console.error("verify-payment: Supabase credentials missing in Edge Function environment");
    return new Response(
      JSON.stringify({ error: "Service unavailable" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
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
        vote_price,
        candidate_type,
        subtotal_amount,
        service_fee_amount,
        tax_amount,
        amount,
        currency,
        candidate_id,
        candidates (
          name,
          display_name,
          category,
          position,
          candidate_type
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

    // Safe public fields — never expose internal IDs, ledger, or Stripe keys
    const candidate = (payment as {
      candidates?: {
        name: string;
        display_name?: string | null;
        category: string;
        position: string;
        candidate_type?: string | null;
      } | null;
    }).candidates;

    const candType =
      (payment as { candidate_type?: string | null }).candidate_type ??
      candidate?.candidate_type ??
      "individual";
    const unitPriceCents =
      (payment as { vote_price?: number | null }).vote_price ??
      (candType === "couple" ? 200 : 100);
    const subtotalAmount =
      (payment as { subtotal_amount?: number | null }).subtotal_amount ??
      payment.vote_quantity * unitPriceCents;
    const serviceFeeAmount =
      (payment as { service_fee_amount?: number | null }).service_fee_amount ??
      Math.max(0, payment.amount - subtotalAmount);
    const taxAmount =
      (payment as { tax_amount?: number | null }).tax_amount ?? 0;

    return new Response(
      JSON.stringify({
        status: payment.status,
        vote_quantity: payment.vote_quantity,
        vote_price: unitPriceCents,
        subtotal_amount: subtotalAmount,
        service_fee_amount: serviceFeeAmount,
        tax_amount: taxAmount,
        amount: payment.amount,
        currency: payment.currency,
        candidate_name: candidate?.display_name || candidate?.name || "Unknown",
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
