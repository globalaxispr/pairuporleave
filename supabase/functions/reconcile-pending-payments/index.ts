import Stripe from "npm:stripe@^17";
import { createClient } from "npm:@supabase/supabase-js@^2";
import {
  createReconciler,
  timingSafeEqualStrings,
  DEFAULT_RECONCILE_BATCH_SIZE,
  MAX_RECONCILE_BATCH_SIZE,
} from "./reconciler.ts";

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

const RECONCILIATION_CRON_SECRET = Deno.env.get("RECONCILIATION_CRON_SECRET") ?? "";
const ALLOWED_ORIGIN = Deno.env.get("SITE_URL") ?? "https://pairuporleave.com";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isOriginAuthorized(requestOrigin: string | null): boolean {
  if (!requestOrigin || typeof requestOrigin !== "string" || requestOrigin.trim() === "") {
    return false;
  }
  try {
    const reqUrl = new URL(requestOrigin);
    const trustedUrl = new URL(ALLOWED_ORIGIN || "https://pairuporleave.com");
    const reqHost = reqUrl.hostname.replace(/^www\./, "").toLowerCase();
    const trustedHost = trustedUrl.hostname.replace(/^www\./, "").toLowerCase();

    if (reqHost === trustedHost && reqUrl.protocol === "https:") {
      return true;
    }
    if ((reqHost === "localhost" || reqHost === "127.0.0.1") && Deno.env.get("ENVIRONMENT") !== "production") {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function getCorsHeaders(requestOrigin: string | null): HeadersInit {
  const isAuth = isOriginAuthorized(requestOrigin);
  const allowedOrigin = isAuth && requestOrigin ? requestOrigin : (ALLOWED_ORIGIN || "https://pairuporleave.com");
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-reconciliation-secret, x-trigger-source",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Rate limiting:
// - Scheduled server-to-server cron: max 2 runs per minute
// - Authenticated admin manual retry: max 6 requests per minute per actor
const RATE_LIMIT_WINDOW_MS = 60_000;
const actorHistory = new Map<string, number[]>();

function isRateLimited(actorKey: string, maxRequests: number): boolean {
  const now = Date.now();
  const timestamps = actorHistory.get(actorKey) || [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= maxRequests) {
    return true;
  }
  recent.push(now);
  actorHistory.set(actorKey, recent);
  return false;
}

Deno.serve(async (req) => {
  const requestOrigin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (req.method === "OPTIONS") {
    if (!isOriginAuthorized(requestOrigin)) {
      return new Response("Forbidden", { status: 403 });
    }
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!stripe || !supabaseAdmin) {
    console.error("reconcile-pending-payments: Missing STRIPE_SECRET_KEY or Supabase admin credentials");
    return new Response(
      JSON.stringify({ error: "Reconciliation service is not configured" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const cronSecretHeader = req.headers.get("x-reconciliation-secret");
    const secFetchSite = req.headers.get("sec-fetch-site");
    const secFetchMode = req.headers.get("sec-fetch-mode");
    const isBrowserContext = Boolean(requestOrigin || secFetchSite || secFetchMode);

    let triggerSource: "scheduled_cron" | "admin_manual" = "scheduled_cron";
    let triggeredByAdminId: string | null = null;
    let targetPaymentId: string | undefined = undefined;
    let requestedBatchSize = DEFAULT_RECONCILE_BATCH_SIZE;

    // =========================================================================
    // AUTHENTICATION PATH A: SERVER-TO-SERVER SCHEDULED CRON (pg_cron / worker)
    // =========================================================================
    if (cronSecretHeader !== null) {
      // Strictly reject any browser-originated request attempting to use cron header
      if (isBrowserContext) {
        return new Response(
          JSON.stringify({ error: "Forbidden: Server-to-server reconciliation cannot be invoked from a browser context." }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }

      if (
        !RECONCILIATION_CRON_SECRET ||
        RECONCILIATION_CRON_SECRET.length < 32 ||
        !timingSafeEqualStrings(cronSecretHeader.trim(), RECONCILIATION_CRON_SECRET.trim())
      ) {
        return new Response(
          JSON.stringify({ error: "Unauthorized: Invalid server-to-server reconciliation credentials." }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }

      if (isRateLimited("cron:global", 2)) {
        return new Response(
          JSON.stringify({ error: "Too many cron reconciliation runs. Try again in a minute." }),
          { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } }
        );
      }

      triggerSource = "scheduled_cron";
      requestedBatchSize = DEFAULT_RECONCILE_BATCH_SIZE;
    } else {
      // =======================================================================
      // AUTHENTICATION PATH B: VERIFIED ADMINISTRATOR JWT (Admin Dashboard UI)
      // =======================================================================
      if (requestOrigin && !isOriginAuthorized(requestOrigin)) {
        return new Response(
          JSON.stringify({ error: "Forbidden: Unauthorized request origin." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return new Response(
          JSON.stringify({ error: "Unauthorized: Missing administrator Bearer token." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const token = authHeader.replace("Bearer ", "").trim();
      const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
      if (authErr || !authData?.user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized: Invalid or expired administrator token." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: adminRecord, error: adminErr } = await supabaseAdmin
        .from("admin_users")
        .select("id, email, role")
        .eq("id", authData.user.id)
        .maybeSingle();

      if (adminErr || !adminRecord) {
        return new Response(
          JSON.stringify({ error: "Forbidden: User is not an authorized administrator." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (isRateLimited(`admin:${adminRecord.id}`, 6)) {
        return new Response(
          JSON.stringify({ error: "Too many manual reconciliation requests. Please wait a minute." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" } }
        );
      }

      triggerSource = "admin_manual";
      triggeredByAdminId = adminRecord.id;

      // Parse optional body for admin-initiated single payment retry or bounded batch
      const rawText = await req.text();
      if (rawText && rawText.trim().length > 0) {
        const body = JSON.parse(rawText) as Record<string, unknown>;

        // Strictly reject any attempt to pass vote_quantity, amount, candidate_id, or stripe_session_id
        if (
          body.vote_quantity !== undefined ||
          body.amount !== undefined ||
          body.candidate_id !== undefined ||
          body.stripe_session_id !== undefined
        ) {
          return new Response(
            JSON.stringify({
              error: "Forbidden: Reconciliation does not accept client-supplied session IDs, amounts, candidates, or vote quantities.",
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (body.payment_id !== undefined) {
          if (typeof body.payment_id !== "string" || !UUID_REGEX.test(body.payment_id)) {
            return new Response(
              JSON.stringify({ error: "payment_id must be a valid UUID" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          targetPaymentId = body.payment_id;
        }

        if (typeof body.batch_size === "number" && Number.isInteger(body.batch_size)) {
          requestedBatchSize = Math.min(15, Math.max(1, body.batch_size));
        } else {
          requestedBatchSize = 15;
        }
      } else {
        requestedBatchSize = 15;
      }
    }

    const reconciler = createReconciler({ supabaseAdmin, stripe });
    const summary = await reconciler.runReconciliationBatch({
      paymentId: targetPaymentId,
      batchSize: Math.min(MAX_RECONCILE_BATCH_SIZE, requestedBatchSize),
      triggerSource,
      triggeredByAdminId,
    });

    return new Response(
      JSON.stringify({
        success: true,
        summary,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("reconcile-pending-payments error:", (err as Error).message);
    return new Response(
      JSON.stringify({ error: "Reconciliation execution failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

