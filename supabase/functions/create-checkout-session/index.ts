import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@^2";

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" })
  : null;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";


const supabaseAdminKey =
  Deno.env.get("SUPABASE_ADMIN_SECRET_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const supabaseAdmin = (supabaseUrl && supabaseAdminKey)
  ? createClient(supabaseUrl, supabaseAdminKey)
  : null;

// ====================================================
// SECURITY: Maximum votes allowed per single transaction.
// This does NOT limit total lifetime votes (business rule preserved).
// It prevents absurdly large checkout requests.
// ====================================================
const MAX_VOTES_PER_TRANSACTION = 1000;
const MIN_VOTES_PER_TRANSACTION = 1;
const ALL_IN_PRICING_VERSION = "all_in_v1";

export interface VotePriceBreakdownCents {
  unitPriceCents: 100 | 200;
  voteQuantity: number;
  subtotalCents: number;
  serviceFeeCents: number;
  taxCents: number;
  totalAmountCents: number;
}

/**
 * Authoritative integer-cent pricing calculation.
 * Base vote price: Individual = 100 cents ($1.00), Couple = 200 cents ($2.00).
 * Platform Service Fee (when enabled): ceil((subtotalCents + 30) / (1 - 0.029)) - subtotalCents.
 * Fee never increases vote_quantity.
 */
export function calculateVotePricingCents(
  candidateType: "individual" | "couple",
  voteQuantity: number,
  applyServiceFee: boolean,
  taxCents = 0
): VotePriceBreakdownCents {
  const unitPriceCents: 100 | 200 = candidateType === "couple" ? 200 : 100;
  const subtotalCents = voteQuantity * unitPriceCents;
  const totalBeforeTaxCents = applyServiceFee
    ? Math.ceil((subtotalCents + 30) / (1 - 0.029))
    : subtotalCents;
  const serviceFeeCents = totalBeforeTaxCents - subtotalCents;
  const totalAmountCents = subtotalCents + serviceFeeCents + taxCents;

  return {
    unitPriceCents,
    voteQuantity,
    subtotalCents,
    serviceFeeCents,
    taxCents,
    totalAmountCents,
  };
}

// Restrict CORS and redirect origin to the configured production domain.
const ALLOWED_ORIGIN = Deno.env.get("SITE_URL") ?? "https://pairuporleave.com";

function getTrustedOrigin(requestOrigin: string | null): string {
  const defaultOrigin = (ALLOWED_ORIGIN || "https://pairuporleave.com").replace(/\/+$/, "");
  if (!requestOrigin) return defaultOrigin;

  try {
    const reqUrl = new URL(requestOrigin);
    const trustedUrl = new URL(defaultOrigin);
    const reqHost = reqUrl.hostname.replace(/^www\./, "").toLowerCase();
    const trustedHost = trustedUrl.hostname.replace(/^www\./, "").toLowerCase();

    // In production, strictly require HTTPS for official production host
    if (reqHost === trustedHost && reqUrl.protocol === "https:") {
      return `https://${reqUrl.host}`;
    }

    // Allow localhost (HTTP/HTTPS) only in non-production development environments
    if ((reqHost === "localhost" || reqHost === "127.0.0.1") && Deno.env.get("ENVIRONMENT") !== "production") {
      return `${reqUrl.protocol}//${reqUrl.host}`;
    }
  } catch {
    // Ignore URL parse error and fall back to trusted default
  }

  return defaultOrigin;
}

function isOriginAuthorized(requestOrigin: string | null): boolean {
  // Browser checkout requires an explicit, verified Origin header.
  // Missing or empty Origin headers are rejected in browser-facing endpoints to prevent spoofed/unverified requests.
  if (!requestOrigin || typeof requestOrigin !== "string" || requestOrigin.trim() === "") {
    return false;
  }

  try {
    const reqUrl = new URL(requestOrigin);
    const trustedUrl = new URL(ALLOWED_ORIGIN || "https://pairuporleave.com");
    const reqHost = reqUrl.hostname.replace(/^www\./, "").toLowerCase();
    const trustedHost = trustedUrl.hostname.replace(/^www\./, "").toLowerCase();

    // Authorize official production host strictly via HTTPS (pairuporleave.com, www.pairuporleave.com)
    // Plain HTTP is strictly rejected in production to guarantee data transit integrity.
    if (reqHost === trustedHost && reqUrl.protocol === "https:") {
      return true;
    }

    // Authorize local development only in non-production environments
    if ((reqHost === "localhost" || reqHost === "127.0.0.1") && Deno.env.get("ENVIRONMENT") !== "production") {
      return true;
    }
  } catch {
    return false;
  }

  // Reject all unapproved origins (including Vercel Previews *.vercel.app, HTTP, or forged headers)
  return false;
}

function getCorsHeaders(requestOrigin: string | null): HeadersInit {
  const isAuth = isOriginAuthorized(requestOrigin);
  const allowedOrigin = isAuth && requestOrigin ? requestOrigin : (ALLOWED_ORIGIN || "https://pairuporleave.com");
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Simple UUID v4 format validation to prevent injection via candidate_id
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ====================================================
// RATE LIMITING (In-Memory Sliding Window per IP)
// Max 30 checkout sessions created per IP per minute.
// Prevents bot floods, card testing, and denial-of-wallet.
// ====================================================
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
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

  // Periodic pruning of stale entries
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

  // Enforce strict server-side origin boundary: Vercel previews or unauthorized third-party origins
  // cannot initiate LIVE Stripe payments against production Supabase.
  if (!isOriginAuthorized(requestOrigin)) {
    return new Response(
      JSON.stringify({
        error: "Forbidden: Checkout requests from this origin are not authorized. Previews cannot trigger LIVE transactions.",
      }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

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

  if (!stripe || !supabaseAdmin) {
    console.error("create-checkout-session: Missing STRIPE_SECRET_KEY or Supabase credentials in Edge Function environment");
    return new Response(
      JSON.stringify({ error: "Payment service is currently unavailable. Gateway configuration pending." }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Enforce IP rate limiting
  const clientIp =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  if (isRateLimited(clientIp)) {
    return new Response(
      JSON.stringify({ error: "Too many checkout requests. Please wait a minute and try again." }),
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
    const body = (await req.json()) as {
      candidate_id?: string;
      vote_quantity?: number;
      pricing_version?: string;
      client_total_cents?: number;
    };
    const { candidate_id, vote_quantity, pricing_version, client_total_cents } = body;

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
    // SERVER-SIDE COMPETITION DEADLINE ENFORCEMENT
    // Validate that competition is active and currently within voting window.
    // Never trust frontend time or client status.
    // ====================================================
    const { data: rawSchedule } = await supabaseAdmin
      .from("competition_schedule")
      .select("*")
      .eq("id", "active")
      .maybeSingle();

    const schedule = rawSchedule ? {
      name: (rawSchedule as { competition_name?: string; name?: string }).competition_name || (rawSchedule as { competition_name?: string; name?: string }).name || "PAIR UP OR LEAVE",
      is_enabled: (rawSchedule as { is_published?: boolean; is_enabled?: boolean }).is_published ?? (rawSchedule as { is_published?: boolean; is_enabled?: boolean }).is_enabled ?? true,
      start_time: rawSchedule.start_time,
      end_time: rawSchedule.end_time,
      timezone: rawSchedule.timezone,
    } : null;

    if (schedule && schedule.is_enabled) {
      const now = Date.now();
      const startTime = new Date(schedule.start_time).getTime();
      const endTime = new Date(schedule.end_time).getTime();

      if (!isNaN(startTime) && now < startTime) {
        return new Response(
          JSON.stringify({
            error: `Voting has not started yet for ${schedule.name}. Voting opens at ${schedule.start_time}.`,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!isNaN(endTime) && now >= endTime) {
        return new Response(
          JSON.stringify({
            error: `Voting is closed for ${schedule.name}. The deadline has passed.`,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ====================================================
    // SERVER-SIDE PRICING & SAFE FEE ACTIVATION GATE
    // Individual base: 1 vote = $1.00 (100 cents)
    // Couple base:     1 vote = $2.00 (200 cents)
    //
    // SAFETY REQUIREMENT: The backend MUST NOT charge mandatory platform
    // service fees unless:
    //   1. Server flag ENABLE_PLATFORM_SERVICE_FEE is not "false", AND
    //   2. The request originates from the updated frontend that prominently
    //      displays the mandatory all-in price breakdown (pricing_version === "all_in_v1").
    // ====================================================
    const candidateType = (candidate.candidate_type as string) === "couple" ? "couple" : "individual";
    // Default to "false" (disabled) until ENABLE_PLATFORM_SERVICE_FEE="true" is explicitly set in Step 4
    const serverFeeFlagEnabled =
      (Deno.env.get("ENABLE_PLATFORM_SERVICE_FEE") ?? "false").toLowerCase() === "true";
    const clientDisclosedAllInPricing = pricing_version === ALL_IN_PRICING_VERSION;
    const applyServiceFee = serverFeeFlagEnabled && clientDisclosedAllInPricing;

    const pricing = calculateVotePricingCents(candidateType, vote_quantity, applyServiceFee, 0);
    const {
      unitPriceCents,
      subtotalCents,
      serviceFeeCents,
      taxCents,
      totalAmountCents,
    } = pricing;

    if (
      client_total_cents !== undefined &&
      (!Number.isInteger(client_total_cents) || client_total_cents !== totalAmountCents)
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Displayed price does not match current server pricing. Please refresh the page and try again.",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const candidateDisplayName = candidate.display_name || candidate.name;
    const origin = getTrustedOrigin(requestOrigin);

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${vote_quantity} Vote${vote_quantity > 1 ? "s" : ""} for ${candidateDisplayName}`,
            description: `${candidate.category} · ${candidateType === "couple" ? "Couple Candidate ($2.00/vote base)" : "Individual Candidate ($1.00/vote base)"} · Pair Up or Leave`,
          },
          unit_amount: unitPriceCents,
        },
        quantity: vote_quantity,
      },
    ];

    if (serviceFeeCents > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: "Platform Service Fee",
            description:
              "Mandatory platform service fee (does not increase votes credited; not a government tax)",
          },
          unit_amount: serviceFeeCents,
        },
        quantity: 1,
      });
    }

    // Create Stripe Checkout Session — amount and pricing set entirely server-side
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${origin}/vote/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/vote/cancel`,
      metadata: {
        candidate_id: candidate.id,
        candidate_type: candidateType,
        vote_quantity: vote_quantity.toString(),
        vote_price: unitPriceCents.toString(),
        subtotal_cents: subtotalCents.toString(),
        service_fee_cents: serviceFeeCents.toString(),
        tax_cents: taxCents.toString(),
        expected_amount_cents: totalAmountCents.toString(),
        pricing_version: applyServiceFee ? ALL_IN_PRICING_VERSION : "legacy_base_v0",
        competition_name: schedule?.name ?? "PAIR UP OR LEAVE",
        competition_end_time: schedule?.end_time ?? "",
      },
    });

    // Insert pending payment record with server-side computed pricing
    const { error: insertErr } = await supabaseAdmin.from("payments").insert({
      stripe_session_id: session.id,
      candidate_id: candidate.id,
      candidate_type: candidateType,
      vote_price: unitPriceCents,
      vote_quantity,
      subtotal_amount: subtotalCents,
      service_fee_amount: serviceFeeCents,
      tax_amount: taxCents,
      amount: totalAmountCents,
      currency: "usd",
      status: "pending",
    });

    if (insertErr) {
      console.error("Failed to insert pending payment record:", insertErr.message);
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
