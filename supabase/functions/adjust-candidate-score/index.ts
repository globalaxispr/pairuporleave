import { createClient } from "npm:@supabase/supabase-js@^2";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") as string,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string
);

// Restrict CORS to production domain — admin functions must not accept cross-origin from arbitrary origins
const ALLOWED_ORIGIN = Deno.env.get("SITE_URL") ?? "";

function getCorsHeaders(requestOrigin: string | null): HeadersInit {
  const allowedOrigin = ALLOWED_ORIGIN || requestOrigin || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Maximum absolute value of a single score adjustment (prevents integer overflow abuse)
const MAX_ADJUSTMENT_QUANTITY = 10000;

// UUID v4 format validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface AdjustRequestBody {
  candidate_id?: string;
  adjustment_type?: "BONUS" | "PENALTY" | "CORRECTION" | "ADMIN_ADD" | "ADMIN_REMOVE";
  quantity?: number;
  reason?: string;
  reference_id?: string;
}

Deno.serve(async (req) => {
  const requestOrigin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(requestOrigin);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Verify Authorization Bearer token (Admin check)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);

    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired authorization token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Verify caller is authorized in admin_users
    const { data: adminRecord, error: adminErr } = await supabaseAdmin
      .from("admin_users")
      .select("id, email, role")
      .eq("id", user.id)
      .maybeSingle();

    if (adminErr || !adminRecord) {
      return new Response(JSON.stringify({ error: "Forbidden: User is not an authorized administrator" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Parse and validate request body
    const body = (await req.json()) as AdjustRequestBody;
    const { candidate_id, adjustment_type, quantity, reason, reference_id } = body;

    if (!candidate_id || typeof candidate_id !== "string" || !UUID_REGEX.test(candidate_id)) {
      return new Response(JSON.stringify({ error: "candidate_id must be a valid UUID" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!adjustment_type || !["BONUS", "PENALTY", "CORRECTION", "ADMIN_ADD", "ADMIN_REMOVE"].includes(adjustment_type)) {
      return new Response(
        JSON.stringify({ error: "adjustment_type must be BONUS, PENALTY, CORRECTION, ADMIN_ADD, or ADMIN_REMOVE" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof quantity !== "number" || !Number.isInteger(quantity)) {
      return new Response(JSON.stringify({ error: "quantity must be an integer" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (adjustment_type !== "CORRECTION" && quantity <= 0) {
      return new Response(JSON.stringify({ error: "quantity must be a positive integer" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (quantity === 0) {
      return new Response(JSON.stringify({ error: "quantity cannot be zero" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (Math.abs(quantity) > MAX_ADJUSTMENT_QUANTITY) {
      return new Response(
        JSON.stringify({ error: `quantity cannot exceed ${MAX_ADJUSTMENT_QUANTITY} in absolute value per adjustment` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Reason is optional: if omitted or blank, pass null
    const sanitizedReason = (typeof reason === "string" && reason.trim().length > 0)
      ? reason.trim()
      : null;

    // 4. Execute atomic stored procedure adjust_candidate_score
    const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc("adjust_candidate_score", {
      p_candidate_id: candidate_id,
      p_type: adjustment_type,
      p_quantity: quantity,
      p_reason: sanitizedReason,
      p_admin_id: user.id,
      p_admin_email: adminRecord.email || user.email,
      p_reference_id: reference_id || null,
    });

    if (rpcErr) {
      console.error("RPC adjust_candidate_score error:", rpcErr.message);
      // Return a generic error to client — do not expose DB internals
      return new Response(
        JSON.stringify({ error: "Failed to adjust candidate score. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: rpcResult,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("adjust-candidate-score error:", (err as Error).message);
    // Never expose internal error details to the client
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
