import { createClient } from "npm:@supabase/supabase-js@^2";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") as string,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AdjustRequestBody {
  candidate_id?: string;
  adjustment_type?: "BONUS" | "PENALTY" | "CORRECTION";
  quantity?: number;
  reason?: string;
  reference_id?: string;
}

Deno.serve(async (req) => {
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

    if (!candidate_id || typeof candidate_id !== "string") {
      return new Response(JSON.stringify({ error: "candidate_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!adjustment_type || !["BONUS", "PENALTY", "CORRECTION"].includes(adjustment_type)) {
      return new Response(
        JSON.stringify({ error: "adjustment_type must be BONUS, PENALTY, or CORRECTION" }),
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

    if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: "A valid reason of at least 3 characters is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Execute atomic stored procedure adjust_candidate_score
    const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc("adjust_candidate_score", {
      p_candidate_id: candidate_id,
      p_type: adjustment_type,
      p_quantity: quantity,
      p_reason: reason.trim(),
      p_admin_id: user.id,
      p_admin_email: adminRecord.email || user.email,
      p_reference_id: reference_id || null,
    });

    if (rpcErr) {
      console.error("RPC adjust_candidate_score error:", rpcErr);
      return new Response(
        JSON.stringify({ error: rpcErr.message || "Failed to adjust candidate score" }),
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
    console.error("adjust-candidate-score error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
