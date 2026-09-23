import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/**
 * True only when both env vars are present AND are not any of the known
 * placeholder/template strings shipped in .env.example / .env.local.
 * This guard prevents the Supabase client from firing real HTTP requests
 * against invalid endpoints (which hang for ~7 seconds before timing out).
 */
function isRealSupabaseConfig(url: string, key: string): boolean {
  if (!url || !key) return false;
  const PLACEHOLDER_PATTERNS = [
    "placeholder",
    "your-project",
    "your-supabase",
    "example.supabase.co",
    "<",   // catches <YOUR_PROJECT_ID> style templates
    "INSERT",
    "REPLACE",
  ];
  const lower = (url + key).toLowerCase();
  return !PLACEHOLDER_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

export const IS_SUPABASE_READY = isRealSupabaseConfig(supabaseUrl, supabaseAnonKey);

if (!IS_SUPABASE_READY) {
  console.warn(
    "[Supabase] Not configured — using demo data fallback. " +
    "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local to connect."
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-key"
);

export type CandidateType = "individual" | "couple";
export type ScoreAdjustmentType = "PAID_VOTE" | "BONUS" | "PENALTY" | "CORRECTION";

export function getVotePriceDollars(type?: CandidateType | string | null): number {
  return type === "couple" ? 2 : 1;
}

export function getVotePriceCents(type?: CandidateType | string | null): number {
  return type === "couple" ? 200 : 100;
}

export function getCandidateScore(c?: Partial<Candidate> | null): number {
  if (!c) return 0;
  if (typeof c.current_score === "number") return c.current_score;
  if (typeof c.total_votes === "number") return c.total_votes;
  return 0;
}

export type Database = {
  public: {
    Tables: {
      candidates: {
        Row: {
          id: string;
          name: string;
          slug: string;
          category: string;
          position: string;
          description: string | null;
          biography: string | null;
          vision: string | null;
          photo_url: string | null;
          status: "active" | "paused";
          total_votes: number; // Synchronized with current_score for backward compatibility
          paid_votes: number;
          bonus_votes: number;
          penalty_points: number;
          current_score: number;
          candidate_type: CandidateType;
          person_one_name: string | null;
          person_two_name: string | null;
          person_one_photo_url: string | null;
          person_two_photo_url: string | null;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["candidates"]["Row"],
          "id" | "created_at" | "updated_at" | "total_votes" | "paid_votes" | "bonus_votes" | "penalty_points" | "current_score"
        > &
          Partial<
            Pick<
              Database["public"]["Tables"]["candidates"]["Row"],
              "total_votes" | "paid_votes" | "bonus_votes" | "penalty_points" | "current_score" | "candidate_type"
            >
          >;
        Update: Partial<Database["public"]["Tables"]["candidates"]["Insert"]>;
      };
      payments: {
        Row: {
          id: string;
          stripe_session_id: string;
          stripe_payment_intent_id: string | null;
          candidate_id: string;
          candidate_type?: string;
          vote_price?: number;
          vote_quantity: number;
          amount: number;
          currency: string;
          status: "pending" | "paid" | "failed" | "refunded";
          created_at: string;
        };
      };
      votes: {
        Row: {
          id: string;
          candidate_id: string;
          payment_id: string;
          quantity: number;
          created_at: string;
        };
      };
      score_ledger: {
        Row: {
          id: string;
          candidate_id: string;
          type: ScoreAdjustmentType;
          quantity: number;
          previous_score: number;
          new_score: number;
          reason: string;
          admin_user_id: string | null;
          admin_email: string | null;
          reference_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["score_ledger"]["Row"], "id" | "created_at">;
      };
      admin_users: {
        Row: {
          id: string;
          email: string;
          role: string;
          created_at: string;
        };
      };
    };
  };
};

export type Candidate = Database["public"]["Tables"]["candidates"]["Row"];
export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type Vote = Database["public"]["Tables"]["votes"]["Row"];
export type ScoreLedgerEntry = Database["public"]["Tables"]["score_ledger"]["Row"] & {
  candidate?: Pick<Candidate, "id" | "name" | "display_name" | "candidate_type" | "photo_url"> | null;
};

// ====================================================
// 5 Fictional Demo Candidates (Individual & Couple Showcase)
// With consistent: paid_votes + bonus_votes - penalty_points = current_score
// ====================================================
export const DEMO_CANDIDATES: Candidate[] = [
  {
    id: "cand-michael-anderson",
    name: "Michael & Sarah Anderson",
    slug: "michael-anderson",
    candidate_type: "couple",
    person_one_name: "Michael Anderson",
    person_two_name: "Sarah Anderson",
    person_one_photo_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80",
    person_two_photo_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80",
    display_name: "Michael & Sarah Anderson",
    photo_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80",
    category: "Community Welfare",
    position: "Community Welfare Partners",
    description: "Dedicated to enhancing community mental health resources, wellness programs, and comprehensive family support systems.",
    biography: "Michael & Sarah have served for years on public wellness and community advisory boards. Together they spearheaded peer-support initiatives and continue to advocate for accessible wellness services across all community departments.",
    vision: "Our vision is a supportive environment where no participant faces emotional or financial hardship alone. Every voice matters in building a stronger community.",
    status: "active",
    paid_votes: 2400,
    bonus_votes: 100,
    penalty_points: 50,
    current_score: 2450, // 2400 + 100 - 50 = 2450
    total_votes: 2450,
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "cand-daniel-williams",
    name: "Daniel Williams",
    slug: "daniel-williams",
    candidate_type: "individual",
    person_one_name: null,
    person_two_name: null,
    person_one_photo_url: null,
    person_two_photo_url: null,
    display_name: null,
    category: "Public Affairs",
    position: "Public Affairs Director",
    description: "Championing transparent administration, civic advocacy, and equitable funding for community initiatives.",
    biography: "Daniel has led major community delegations and coordinated policy revisions to empower local associations and organizations. With a background in public policy, he brings proven executive leadership.",
    vision: "I believe in open communication between leadership and the community. We will streamline project approvals and guarantee fair resource allocation.",
    photo_url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80",
    status: "active",
    paid_votes: 1980,
    bonus_votes: 50,
    penalty_points: 50,
    current_score: 1980, // 1980 + 50 - 50 = 1980
    total_votes: 1980,
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "cand-christopher-johnson",
    name: "Christopher Johnson",
    slug: "christopher-johnson",
    candidate_type: "individual",
    person_one_name: null,
    person_two_name: null,
    person_one_photo_url: null,
    person_two_photo_url: null,
    display_name: null,
    category: "Community Development",
    position: "Community Outreach Coordinator",
    description: "Strengthening community partnerships, social equity, and volunteer programs across regional neighborhoods.",
    biography: "Christopher has organized 40+ local community drives and partnered with regional non-profits to create youth mentorship programs and environmental restoration projects.",
    vision: "Our organization should be an active pillar of positive civic impact. We will build lasting partnerships that create real opportunities for everyone.",
    photo_url: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=600&q=80",
    status: "active",
    paid_votes: 1600,
    bonus_votes: 50,
    penalty_points: 0,
    current_score: 1650, // 1600 + 50 - 0 = 1650
    total_votes: 1650,
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "cand-marcus-thompson",
    name: "Marcus Thompson",
    slug: "marcus-thompson",
    candidate_type: "individual",
    person_one_name: null,
    person_two_name: null,
    person_one_photo_url: null,
    person_two_photo_url: null,
    display_name: null,
    category: "Professional Support",
    position: "Career & Leadership Support Lead",
    description: "Focused on career readiness, professional mentorship access, skills workshops, and modern leadership development.",
    biography: "Marcus founded the innovation incubator and successfully secured corporate mentorship grants for over 150 participants across technological and business domains.",
    vision: "Professional empowerment should directly translate into career success and personal growth. I will expand networking programs and career development centers.",
    photo_url: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=600&q=80",
    status: "active",
    paid_votes: 1320,
    bonus_votes: 0,
    penalty_points: 0,
    current_score: 1320,
    total_votes: 1320,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "cand-anthony-davis",
    name: "Anthony Davis",
    slug: "anthony-davis",
    candidate_type: "individual",
    person_one_name: null,
    person_two_name: null,
    person_one_photo_url: null,
    person_two_photo_url: null,
    display_name: null,
    category: "Cultural Leadership",
    position: "Cultural Events & Activities Chair",
    description: "Energizing cultural traditions, diverse community festivals, athletic celebrations, and creative arts.",
    biography: "Anthony has planned some of the most attended cultural festivals and civic rallies in recent history. His energy and commitment to community engagement have revitalized local participation.",
    vision: "Community life should be vibrant, welcoming, and memorable for every single member. Together we will make this season unforgettable.",
    photo_url: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&q=80",
    status: "active",
    paid_votes: 980,
    bonus_votes: 0,
    penalty_points: 0,
    current_score: 980,
    total_votes: 980,
    created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// Baseline demo ledger entries
export const INITIAL_DEMO_LEDGER: ScoreLedgerEntry[] = [
  {
    id: "ledger-entry-1",
    candidate_id: "cand-michael-anderson",
    type: "PAID_VOTE",
    quantity: 2400,
    previous_score: 0,
    new_score: 2400,
    reason: "Stripe Verified Votes ($2/couple)",
    admin_user_id: null,
    admin_email: null,
    reference_id: "pay-stripe-init-1",
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
  },
  {
    id: "ledger-entry-2",
    candidate_id: "cand-michael-anderson",
    type: "BONUS",
    quantity: 100,
    previous_score: 2400,
    new_score: 2500,
    reason: "Promotional Launch Partner Bonus",
    admin_user_id: "admin-super",
    admin_email: "superadmin@pairuporleave.com",
    reference_id: null,
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: "ledger-entry-3",
    candidate_id: "cand-michael-anderson",
    type: "PENALTY",
    quantity: -50,
    previous_score: 2500,
    new_score: 2450,
    reason: "Campaigning in restricted zone penalty",
    admin_user_id: "admin-super",
    admin_email: "superadmin@pairuporleave.com",
    reference_id: null,
    created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
  {
    id: "ledger-entry-4",
    candidate_id: "cand-daniel-williams",
    type: "PAID_VOTE",
    quantity: 1980,
    previous_score: 0,
    new_score: 1980,
    reason: "Stripe Verified Votes ($1/individual)",
    admin_user_id: null,
    admin_email: null,
    reference_id: "pay-stripe-init-2",
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: "ledger-entry-5",
    candidate_id: "cand-daniel-williams",
    type: "BONUS",
    quantity: 50,
    previous_score: 1980,
    new_score: 2030,
    reason: "Community Forum Participation Bonus",
    admin_user_id: "admin-super",
    admin_email: "admin@pairuporleave.com",
    reference_id: null,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "ledger-entry-6",
    candidate_id: "cand-daniel-williams",
    type: "PENALTY",
    quantity: -50,
    previous_score: 2030,
    new_score: 1980,
    reason: "Late submission of debate materials",
    admin_user_id: "admin-super",
    admin_email: "admin@pairuporleave.com",
    reference_id: null,
    created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
  {
    id: "ledger-entry-7",
    candidate_id: "cand-christopher-johnson",
    type: "PAID_VOTE",
    quantity: 1600,
    previous_score: 0,
    new_score: 1600,
    reason: "Stripe Verified Votes ($1/individual)",
    admin_user_id: null,
    admin_email: null,
    reference_id: "pay-stripe-init-3",
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "ledger-entry-8",
    candidate_id: "cand-christopher-johnson",
    type: "BONUS",
    quantity: 50,
    previous_score: 1600,
    new_score: 1650,
    reason: "Social Impact Showcase Bonus",
    admin_user_id: "admin-super",
    admin_email: "superadmin@pairuporleave.com",
    reference_id: null,
    created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
];

// Helper to access demo candidates from localStorage for local persistence
function getDemoCandidates(): Candidate[] {
  try {
    const raw = localStorage.getItem("vote_demo_candidates");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  return [...DEMO_CANDIDATES];
}

function saveDemoCandidates(list: Candidate[]): void {
  try {
    localStorage.setItem("vote_demo_candidates", JSON.stringify(list));
  } catch {
    // ignore
  }
}

function getDemoLedger(): ScoreLedgerEntry[] {
  try {
    const raw = localStorage.getItem("vote_demo_ledger");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [...INITIAL_DEMO_LEDGER];
}

function saveDemoLedger(ledger: ScoreLedgerEntry[]): void {
  try {
    localStorage.setItem("vote_demo_ledger", JSON.stringify(ledger));
  } catch {
    // ignore
  }
}

export async function fetchCandidatesSafe(limit?: number): Promise<Candidate[]> {
  if (IS_SUPABASE_READY) {
    try {
      let query = supabase
        .from("candidates")
        .select("*")
        .eq("status", "active")
        .order("current_score", { ascending: false });

      if (limit) query = query.limit(limit);

      const { data, error } = await query;
      if (!error && data) {
        return data.map((c) => ({
          ...c,
          candidate_type: (c.candidate_type === "couple" ? "couple" : "individual") as CandidateType,
          current_score: c.current_score ?? c.total_votes ?? 0,
          paid_votes: c.paid_votes ?? c.total_votes ?? 0,
          bonus_votes: c.bonus_votes ?? 0,
          penalty_points: c.penalty_points ?? 0,
        }));
      }
      if (error) {
        console.error("Supabase candidates fetch error:", error);
      }
    } catch (err) {
      console.error("Supabase candidates query failed:", err);
    }
  }

  // Development fallback for offline/preview testing
  if (import.meta.env.DEV) {
    const list = getDemoCandidates().sort(
      (a, b) => getCandidateScore(b) - getCandidateScore(a)
    );
    return limit ? list.slice(0, limit) : list;
  }

  return [];
}

export async function fetchCandidateByIdSafe(id?: string | null): Promise<Candidate | null> {
  if (!id) return null;

  if (IS_SUPABASE_READY) {
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      let query = supabase.from("candidates").select("*");
      if (isUuid) {
        query = query.or(`id.eq.${id},slug.eq.${id}`);
      } else {
        query = query.eq("slug", id);
      }
      const { data, error } = await query.maybeSingle();

      if (!error && data) {
        return {
          ...data,
          candidate_type: (data.candidate_type === "couple" ? "couple" : "individual") as CandidateType,
          current_score: data.current_score ?? data.total_votes ?? 0,
          paid_votes: data.paid_votes ?? data.total_votes ?? 0,
          bonus_votes: data.bonus_votes ?? 0,
          penalty_points: data.penalty_points ?? 0,
        };
      }
    } catch (err) {
      console.error("Supabase candidate by id failed:", err);
    }
  }

  if (import.meta.env.DEV) {
    const found = getDemoCandidates().find(
      (c) => c.id === id || c.slug === id
    );
    return found ?? null;
  }

  return null;
}

/**
 * Fetch score ledger entries (optionally filtered by candidateId)
 */
export async function fetchCandidateLedgerSafe(candidateId?: string): Promise<ScoreLedgerEntry[]> {
  if (IS_SUPABASE_READY) {
    try {
      let query = supabase
        .from("score_ledger")
        .select("*, candidates(id, name, display_name, candidate_type, photo_url)")
        .order("created_at", { ascending: false });

      if (candidateId) {
        query = query.eq("candidate_id", candidateId);
      }

      const { data, error } = await query;
      if (!error && data) {
        return data.map((d: any) => ({
          ...d,
          candidate: d.candidates ? {
            ...d.candidates,
            candidate_type: d.candidates.candidate_type || "individual",
          } : null,
        }));
      }
    } catch (err) {
      console.error("Supabase score_ledger query failed:", err);
    }
  }

  if (import.meta.env.DEV) {
    const allLedger = getDemoLedger();
    const demoCands = getDemoCandidates();
    const matched = (candidateId ? allLedger.filter((e) => e.candidate_id === candidateId) : allLedger).map((entry) => {
      const cand = demoCands.find((c) => c.id === entry.candidate_id);
      return {
        ...entry,
        candidate: cand ? {
          id: cand.id,
          name: cand.name,
          display_name: cand.display_name,
          candidate_type: cand.candidate_type || "individual",
          photo_url: cand.photo_url,
        } : null,
      };
    });

    return matched.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  return [];
}

/**
 * Atomically adjust candidate score via backend Edge Function or RPC,
 * with complete demo fallback handling for local offline dev.
 */
export async function adjustCandidateScore({
  candidateId,
  type,
  quantity,
  reason,
  referenceId,
  adminEmail,
}: {
  candidateId: string;
  type: ScoreAdjustmentType;
  quantity: number;
  reason: string;
  referenceId?: string | null;
  adminEmail?: string;
}): Promise<{
  success: boolean;
  ledgerId?: string;
  previousScore?: number;
  newScore?: number;
  cappedAtZero?: boolean;
  error?: string;
}> {
  // Input validation
  if (!candidateId) return { success: false, error: "Candidate ID is required." };
  if (!reason || reason.trim().length < 3) {
    return { success: false, error: "Reason must be at least 3 characters long." };
  }
  if (type !== "CORRECTION" && (!quantity || quantity <= 0)) {
    return { success: false, error: "Quantity must be a positive integer." };
  }
  if (quantity === 0) {
    return { success: false, error: "Quantity cannot be zero." };
  }

  // Attempt backend invocation first if Supabase is active
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (token && supabaseUrl && !supabaseUrl.includes("placeholder")) {
      const response = await fetch(`${supabaseUrl}/functions/v1/adjust-candidate-score`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          candidate_id: candidateId,
          adjustment_type: type,
          quantity,
          reason: reason.trim(),
          reference_id: referenceId ?? null,
        }),
      });

      if (response.ok) {
        const json = await response.json();
        return {
          success: true,
          ledgerId: json.data?.ledger_id,
          previousScore: json.data?.previous_score,
          newScore: json.data?.new_score,
          cappedAtZero: json.data?.capped_at_zero,
        };
      }
    }
  } catch (err) {
    console.warn("Backend adjust-candidate-score call failed, checking demo fallback:", err);
  }

  // Demo Fallback: atomic local calculation and persistence
  const candidates = getDemoCandidates();
  const candIndex = candidates.findIndex((c) => c.id === candidateId);
  if (candIndex === -1) {
    return { success: false, error: "Candidate not found." };
  }

  const cand = candidates[candIndex];
  const prevScore = getCandidateScore(cand);

  let signedQty = quantity;
  let delta = quantity;

  if (type === "PENALTY") {
    signedQty = -Math.abs(quantity);
    delta = -Math.abs(quantity);
  } else if (type === "BONUS" || type === "PAID_VOTE") {
    signedQty = Math.abs(quantity);
    delta = Math.abs(quantity);
  }

  const rawScore = prevScore + delta;
  const newScore = Math.max(0, rawScore);
  const cappedAtZero = rawScore < 0;

  // Update candidate metrics
  const updatedCand: Candidate = {
    ...cand,
    current_score: newScore,
    total_votes: newScore,
    paid_votes: (cand.paid_votes ?? cand.total_votes ?? 0) + (type === "PAID_VOTE" ? quantity : 0),
    bonus_votes: (cand.bonus_votes ?? 0) + (type === "BONUS" ? quantity : (type === "CORRECTION" && quantity > 0 ? quantity : 0)),
    penalty_points: (cand.penalty_points ?? 0) + (type === "PENALTY" ? Math.abs(quantity) : (type === "CORRECTION" && quantity < 0 ? Math.abs(quantity) : 0)),
    updated_at: new Date().toISOString(),
  };

  candidates[candIndex] = updatedCand;
  saveDemoCandidates(candidates);

  // Append new ledger transaction
  const ledger = getDemoLedger();
  const ledgerId = `ledger-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const newEntry: ScoreLedgerEntry = {
    id: ledgerId,
    candidate_id: candidateId,
    type,
    quantity: signedQty,
    previous_score: prevScore,
    new_score: newScore,
    reason: reason.trim(),
    admin_user_id: "admin-current",
    admin_email: adminEmail || "admin@pairuporleave.com",
    reference_id: referenceId ?? null,
    created_at: new Date().toISOString(),
  };

  ledger.unshift(newEntry);
  saveDemoLedger(ledger);

  return {
    success: true,
    ledgerId,
    previousScore: prevScore,
    newScore,
    cappedAtZero,
  };
}
