import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@^2";
import { createVerifyPaymentHandler } from "./handler.ts";

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" as Stripe.StripeConfig["apiVersion"] })
  : null;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAdminKey =
  Deno.env.get("SUPABASE_ADMIN_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const supabaseAdmin = (supabaseUrl && supabaseAdminKey)
  ? createClient(supabaseUrl, supabaseAdminKey)
  : null;

const ALLOWED_ORIGIN = Deno.env.get("SITE_URL") ?? "https://pairuporleave.com";

function getCorsHeaders(requestOrigin: string | null): HeadersInit {
  const defaultOrigin = (ALLOWED_ORIGIN || "https://pairuporleave.com").replace(/\/+$/, "");
  let allowedOrigin = defaultOrigin;

  if (requestOrigin) {
    try {
      const reqUrl = new URL(requestOrigin);
      const trustedUrl = new URL(defaultOrigin);
      const reqHost = reqUrl.hostname.replace(/^www\./, "").toLowerCase();
      const trustedHost = trustedUrl.hostname.replace(/^www\./, "").toLowerCase();

      if (reqHost === trustedHost && reqUrl.protocol === "https:") {
        allowedOrigin = `https://${reqUrl.host}`;
      } else if ((reqHost === "localhost" || reqHost === "127.0.0.1") && Deno.env.get("ENVIRONMENT") !== "production") {
        allowedOrigin = `${reqUrl.protocol}//${reqUrl.host}`;
      }
    } catch {
      // Keep defaultOrigin
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

const verifyHandler = supabaseAdmin
  ? createVerifyPaymentHandler({ supabaseAdmin, stripe })
  : null;

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

  if (!supabaseAdmin || !verifyHandler) {
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

    const { httpStatus, body } = await verifyHandler.verifyPaymentSession(sessionId);

    return new Response(JSON.stringify(body), {
      status: httpStatus,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("verify-payment error:", (err as Error).message);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
