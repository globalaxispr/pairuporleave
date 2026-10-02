import { createClient } from "@supabase/supabase-js";

/**
 * Normalizes and sanitizes the Supabase URL.
 * Automatically strips trailing slashes and accidental API subpaths
 * like /rest/v1, /auth/v1, or /graphql/v1 which cause PostgREST PGRST125 "Invalid path" routing errors.
 */
function sanitizeSupabaseUrl(rawUrl?: string): string {
  if (!rawUrl) return "";
  let url = rawUrl.trim();
  url = url.replace(/\/+$/, "");
  url = url.replace(/\/(rest|auth|graphql)\/v1\/?$/i, "");
  url = url.replace(/\/+$/, "");
  return url;
}

const rawSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "";
export const supabaseUrl = sanitizeSupabaseUrl(rawSupabaseUrl);

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

// Safe diagnostic logging — development only
if (import.meta.env.DEV) {
  try {
    let hostname = "none";
    if (supabaseUrl && supabaseUrl.startsWith("http")) {
      hostname = new URL(supabaseUrl).hostname;
    }
    console.log("[Supabase Config]", {
      hostname,
      urlNormalized: rawSupabaseUrl !== supabaseUrl ? "auto-corrected" : "clean",
      hasAnonKey: !!supabaseAnonKey,
      isSupabaseReady: IS_SUPABASE_READY,
    });
  } catch {
    // Silent fallback
  }
}

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
export type ScoreAdjustmentType = "PAID_VOTE" | "BONUS" | "PENALTY" | "CORRECTION" | "ADMIN_ADD" | "ADMIN_REMOVE";

export function getVotePriceDollars(type?: CandidateType | string | null): number {
  return type === "couple" ? 2 : 1;
}

export function getVotePriceCents(type?: CandidateType | string | null): number {
  return type === "couple" ? 200 : 100;
}

/**
 * PublicCandidate is the ONLY candidate shape ever sent to public pages/components.
 * It MUST NOT include: paid_votes, bonus_votes, penalty_points, total_votes,
 * or any other internal/admin field.
 * This type is enforced at compile-time so accidental additions are caught.
 */
export type PublicCandidate = {
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
  /** The single public score — computed by the DB, contains paid + bonus - penalty. */
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

/**
 * The set of columns fetched for public pages.
 * Must match PublicCandidate exactly — no internal fields.
 */
const PUBLIC_CANDIDATE_COLUMNS =
  "id,name,slug,category,position,description,biography,vision," +
  "photo_url,status,current_score,candidate_type," +
  "person_one_name,person_two_name,person_one_photo_url,person_two_photo_url," +
  "display_name,created_at,updated_at";

/**
 * Strips any internal/admin columns from a raw DB row before it is placed
 * into public React state or returned from a public function.
 * This is the last-resort guard against accidental field leakage
 * (e.g. from realtime payloads that may still carry extra columns).
 */
export function pickPublicFields(raw: Record<string, unknown>): PublicCandidate {
  return {
    id: raw.id as string,
    name: raw.name as string,
    slug: raw.slug as string,
    category: raw.category as string,
    position: raw.position as string,
    description: (raw.description as string | null) ?? null,
    biography: (raw.biography as string | null) ?? null,
    vision: (raw.vision as string | null) ?? null,
    photo_url: (raw.photo_url as string | null) ?? null,
    status: (raw.status as "active" | "paused") ?? "active",
    current_score: typeof raw.current_score === "number" ? raw.current_score : 0,
    candidate_type: (raw.candidate_type === "couple" ? "couple" : "individual") as CandidateType,
    person_one_name: (raw.person_one_name as string | null) ?? null,
    person_two_name: (raw.person_two_name as string | null) ?? null,
    person_one_photo_url: (raw.person_one_photo_url as string | null) ?? null,
    person_two_photo_url: (raw.person_two_photo_url as string | null) ?? null,
    display_name: (raw.display_name as string | null) ?? null,
    created_at: raw.created_at as string,
    updated_at: raw.updated_at as string,
  };
}

export function getCandidateScore(c?: (Partial<PublicCandidate> & Partial<Candidate>) | null): number {
  if (!c) return 0;
  if (typeof c.current_score === "number") return Math.max(0, c.current_score);
  if (typeof c.total_votes === "number") return Math.max(0, c.total_votes);
  const paid = c.paid_votes ?? 0;
  const added = c.bonus_votes ?? 0;
  const removed = c.penalty_points ?? 0;
  return Math.max(0, paid + added - removed);
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
    Views: {
      public_candidates: {
        Row: PublicCandidate;
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

// ---------------------------------------------------------------------------
// DEMO CANDIDATES — public shape only (NO internal/admin fields)
// ---------------------------------------------------------------------------

// 5 Fictional Demo Candidates — PUBLIC SHAPE ONLY
// IMPORTANT: These contain current_score (the single public vote count).
// They do NOT contain paid_votes, bonus_votes, penalty_points, or total_votes.
export const DEMO_CANDIDATES: PublicCandidate[] = [
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
    current_score: 2450,
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
    current_score: 1980,
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
    current_score: 1650,
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
    current_score: 1320,
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
    current_score: 980,
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

// Helper to access demo candidates from localStorage for local persistence.
// localStorage stores only the PUBLIC shape — no internal fields.
function getDemoCandidates(): PublicCandidate[] {
  try {
    const raw = localStorage.getItem("vote_demo_candidates");
    if (raw) {
      const parsed: unknown[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Strip any internal fields that may have been saved by an older version
        return (parsed as Record<string, unknown>[]).map(pickPublicFields);
      }
    }
  } catch {
    // ignore
  }
  return [...DEMO_CANDIDATES];
}

function saveDemoCandidates(list: PublicCandidate[]): void {
  try {
    // Persist only the public shape to localStorage
    const safe = list.map(pickPublicFields);
    localStorage.setItem("vote_demo_candidates", JSON.stringify(safe));
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

/**
 * Public-safe candidate fetch.
 * Selects ONLY the public columns — never paid_votes, bonus_votes,
 * penalty_points, or any other internal/admin field.
 * Returns PublicCandidate[] so callers cannot accidentally expose
 * internal data through TypeScript.
 */
export async function fetchCandidatesSafe(limit?: number): Promise<PublicCandidate[]> {
  if (IS_SUPABASE_READY) {
    try {
      // 1. Primary: query public_candidates view (protected at the database level)
      let viewQuery = (supabase.from("public_candidates" as any) as any)
        .select(PUBLIC_CANDIDATE_COLUMNS)
        .order("current_score", { ascending: false });

      if (limit) viewQuery = viewQuery.limit(limit);

      const viewRes = await viewQuery;
      if (!viewRes.error && viewRes.data && viewRes.data.length > 0) {
        return (viewRes.data as unknown as Record<string, unknown>[]).map(pickPublicFields);
      }

      // 2. Rollout fallback: query base candidates table if view does not exist yet (pre-migration)
      let query = supabase
        .from("candidates")
        .select(PUBLIC_CANDIDATE_COLUMNS)
        .eq("status", "active")
        .order("current_score", { ascending: false });

      if (limit) query = query.limit(limit);

      const { data, error } = await query;
      if (!error && data) {
        return (data as unknown as Record<string, unknown>[]).map(pickPublicFields);
      }
      if (error && error.code !== "PGRST205") {
        if (import.meta.env.DEV) {
          console.warn("[Supabase] candidates fetch notice:", error.code);
        }
      }
    } catch {
      // Silent: do not expose stack traces or internal errors
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

/**
 * Public-safe single-candidate fetch.
 * Selects ONLY the public columns — never internal/admin fields.
 */
export async function fetchCandidateByIdSafe(id?: string | null): Promise<PublicCandidate | null> {
  if (!id) return null;

  if (IS_SUPABASE_READY) {
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

      // 1. Primary: query public_candidates view
      let viewQuery = (supabase.from("public_candidates" as any) as any).select(PUBLIC_CANDIDATE_COLUMNS);
      if (isUuid) {
        viewQuery = viewQuery.or(`id.eq.${id},slug.eq.${id}`);
      } else {
        viewQuery = viewQuery.eq("slug", id);
      }
      const viewRes = await viewQuery.maybeSingle();
      if (!viewRes.error && viewRes.data) {
        return pickPublicFields(viewRes.data as unknown as Record<string, unknown>);
      }

      // 2. Rollout fallback: base candidates table
      let query = supabase.from("candidates").select(PUBLIC_CANDIDATE_COLUMNS);
      if (isUuid) {
        query = query.or(`id.eq.${id},slug.eq.${id}`);
      } else {
        query = query.eq("slug", id);
      }
      const { data, error } = await query.maybeSingle();

      if (!error && data) {
        return pickPublicFields(data as unknown as Record<string, unknown>);
      }
    } catch {
      // Silent: do not expose internal errors
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
 * Admin-only candidate fetch.
 * Returns the full Candidate object including internal fields (paid_votes, bonus_votes, etc.)
 * Only to be used in authenticated Admin pages.
 */
export async function fetchAdminCandidates(): Promise<Candidate[]> {
  if (IS_SUPABASE_READY) {
    try {
      const { data, error } = await supabase
        .from("candidates")
        .select("*")
        .order("current_score", { ascending: false });

      if (!error && data) {
        return data as Candidate[];
      }
    } catch {
      // Fall through to demo
    }
  }

  return DEMO_CANDIDATES.map((c) => ({
    ...c,
    total_votes: c.current_score,
    paid_votes: c.current_score,
    bonus_votes: 0,
    penalty_points: 0,
  })) as Candidate[];
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
  reason?: string | null;
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
  // 1. Client-side input validation
  if (!candidateId) return { success: false, error: "Candidate ID is required." };
  if (typeof quantity !== "number" || isNaN(quantity)) {
    return { success: false, error: "Quantity must be a valid number." };
  }
  if (!Number.isInteger(quantity)) {
    return { success: false, error: "Quantity must be a whole number (no decimals)." };
  }
  if (quantity === 0) {
    return { success: false, error: "Quantity cannot be zero." };
  }
  if (type !== "CORRECTION" && quantity <= 0) {
    return { success: false, error: "Quantity must be a positive integer." };
  }
  if (Math.abs(quantity) > 10000) {
    return { success: false, error: "Quantity cannot exceed 10,000 points per adjustment." };
  }

  // Reason is optional
  const cleanReason = (reason && reason.trim().length > 0) ? reason.trim() : null;

  // Canonical ledger types: new administrative additions use ADMIN_ADD, deductions use ADMIN_REMOVE
  const targetType =
    (type === "BONUS" || type === "ADMIN_ADD") ? "ADMIN_ADD" :
    (type === "PENALTY" || type === "ADMIN_REMOVE") ? "ADMIN_REMOVE" :
    type;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateId);

  // 2. Database path (when targeting real Supabase candidate UUID)
  if (IS_SUPABASE_READY && isUuid) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const callerId = sessionData.session?.user?.id;
      const callerEmail = adminEmail || sessionData.session?.user?.email;

      // Verify the candidate exists in the database
      const { data: cand, error: candErr } = await supabase
        .from("candidates")
        .select("id, name, display_name, current_score, total_votes, paid_votes, bonus_votes, penalty_points")
        .eq("id", candidateId)
        .maybeSingle();

      if (candErr) {
        if (candErr.code === "42501" || candErr.message.includes("permission denied")) {
          return { success: false, error: "Unauthorized: You must be signed in as an administrator." };
        }
      }

      if (!cand && !candErr) {
        return { success: false, error: "Candidate not found." };
      }

      // Attempt A: Invoke Edge Function if token is present
      if (token && supabaseUrl && !supabaseUrl.includes("placeholder")) {
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/adjust-candidate-score`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              candidate_id: candidateId,
              adjustment_type: targetType,
              quantity,
              reason: cleanReason,
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

          // If function returned an explicit business/auth error, report it directly
          if (response.status !== 404) {
            const errJson = await response.json().catch(() => null);
            if (errJson?.error) {
              return { success: false, error: errJson.error };
            }
          }
        } catch {
          // If Edge Function network fails or is 404, fall through to direct RPC
        }
      }

      // Attempt B: Direct stored procedure invocation (RPC adjust_candidate_score)
      const { data: rpcData, error: rpcErr } = await supabase.rpc("adjust_candidate_score", {
        p_candidate_id: candidateId,
        p_type: targetType,
        p_quantity: quantity,
        p_reason: cleanReason,
        p_admin_id: callerId ?? null,
        p_admin_email: callerEmail ?? null,
        p_reference_id: referenceId ?? null,
      });

      if (!rpcErr && rpcData && (rpcData as any).success) {
        return {
          success: true,
          ledgerId: (rpcData as any).ledger_id,
          previousScore: (rpcData as any).previous_score,
          newScore: (rpcData as any).new_score,
          cappedAtZero: (rpcData as any).capped_at_zero,
        };
      }

      if (rpcErr) {
        if (rpcErr.message.includes("Candidate not found")) {
          return { success: false, error: "Candidate not found." };
        }
        if (rpcErr.message.includes("Forbidden") || rpcErr.code === "42501") {
          return { success: false, error: "Forbidden: You are not authorized to adjust candidate scores." };
        }
      }

      // Attempt C: Direct authenticated table transaction (fallback when RPC is ungranted/pending migration)
      if (cand) {
        const prevScore = getCandidateScore(cand);
        let delta = quantity;
        if (targetType === "ADMIN_REMOVE") delta = -Math.abs(quantity);
        else if (targetType === "ADMIN_ADD" || targetType === "PAID_VOTE") delta = Math.abs(quantity);
        const rawScore = prevScore + delta;
        const newScore = Math.max(0, rawScore);
        const cappedAtZero = rawScore < 0;

        const updatePayload: Record<string, any> = {
          current_score: newScore,
          total_votes: newScore,
          updated_at: new Date().toISOString(),
        };
        if (targetType === "ADMIN_ADD") {
          updatePayload.bonus_votes = (cand.bonus_votes ?? 0) + Math.abs(quantity);
        } else if (targetType === "ADMIN_REMOVE") {
          updatePayload.penalty_points = (cand.penalty_points ?? 0) + Math.abs(quantity);
        }

        const { error: updateErr } = await supabase
          .from("candidates")
          .update(updatePayload)
          .eq("id", candidateId);

        if (!updateErr) {
          let ledgerId: string | undefined;
          const { data: ledgerRes } = await supabase
            .from("score_ledger")
            .insert({
              candidate_id: candidateId,
              type: targetType,
              quantity: delta,
              previous_score: prevScore,
              new_score: newScore,
              reason: cleanReason || "",
              admin_user_id: callerId ?? null,
              admin_email: callerEmail ?? null,
              reference_id: referenceId ?? null,
            })
            .select("id")
            .maybeSingle();

          ledgerId = ledgerRes?.id;

          return {
            success: true,
            ledgerId,
            previousScore: prevScore,
            newScore,
            cappedAtZero,
          };
        }
      }

      return {
        success: false,
        error: "Unable to update candidate score. Please verify your administrative permissions.",
      };
    } catch (dbErr) {
      return {
        success: false,
        error: dbErr instanceof Error ? dbErr.message : "Database error while updating score.",
      };
    }
  }

  // 3. Demo Fallback: local development and offline mock mode
  const candidates = getDemoCandidates();
  let candIndex = candidates.findIndex((c) => c.id === candidateId || c.slug === candidateId);

  // Check baseline demo candidates if not yet in localStorage
  if (candIndex === -1) {
    const baseIndex = DEMO_CANDIDATES.findIndex((c) => c.id === candidateId || c.slug === candidateId);
    if (baseIndex !== -1) {
      candidates.push({ ...DEMO_CANDIDATES[baseIndex] });
      candIndex = candidates.length - 1;
    }
  }

  if (candIndex === -1) {
    return { success: false, error: "Candidate not found." };
  }

  const cand = candidates[candIndex];
  const prevScore = getCandidateScore(cand);

  let delta = quantity;
  if (targetType === "ADMIN_REMOVE") {
    delta = -Math.abs(quantity);
  } else if (targetType === "ADMIN_ADD" || targetType === "PAID_VOTE") {
    delta = Math.abs(quantity);
  }

  const rawScore = prevScore + delta;
  const newScore = Math.max(0, rawScore);
  const cappedAtZero = rawScore < 0;

  const updatedCand: PublicCandidate = {
    ...cand,
    current_score: newScore,
    updated_at: new Date().toISOString(),
  };

  candidates[candIndex] = updatedCand;
  saveDemoCandidates(candidates);

  // Append new ledger transaction in demo storage
  const ledger = getDemoLedger();
  const ledgerId = `ledger-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const newEntry: ScoreLedgerEntry = {
    id: ledgerId,
    candidate_id: candidateId,
    type: targetType,
    quantity: delta,
    previous_score: prevScore,
    new_score: newScore,
    reason: cleanReason || "",
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
