import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Users, Vote, DollarSign, TrendingUp, Activity, BarChart3 } from "lucide-react";
import { supabase, DEMO_CANDIDATES, IS_SUPABASE_READY } from "@/lib/supabase";
import { formatNumber, formatCurrency } from "@/lib/utils";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { perfPageMount, perfMark, perfNavEnd } from "@/lib/adminPerf";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  bg: string;
  subtitle?: string;
}

function StatCard({ title, value, icon: Icon, color, bg, subtitle }: StatCardProps) {
  return (
    <div style={{ background: "#ffffff", border: "1px solid #F0DCE2", borderRadius: 16, padding: "1.5rem" }} className="card-shadow">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p style={{ fontSize: "0.875rem", color: "#6B6870", fontWeight: 500, margin: "0 0 0.375rem" }}>{title}</p>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#24131A", lineHeight: 1 }}>{value}</div>
          {subtitle && <p style={{ fontSize: "0.8125rem", color: "#6B6870", margin: "0.375rem 0 0" }}>{subtitle}</p>}
        </div>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={22} color={color} />
        </div>
      </div>
    </div>
  );
}

interface OverviewStats {
  totalCandidates: number;
  activeCandidates: number;
  totalScore: number;
  paidVotes: number;
  bonusVotes: number;
  penaltyPoints: number;
  totalRevenueCents: number;
  todayVotes: number;
  todayRevenueCents: number;
}

export function AdminDashboardPage() {
  perfPageMount("AdminDashboardPage");
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      try {
        perfMark("Supabase queries START");

        let candidateRows: any[] | null = null;
        let allPayments: any[] | null = null;
        let todayPayments: any[] | null = null;
        let totalCandidates: number | null = null;
        let activeCandidates: number | null = null;

        if (IS_SUPABASE_READY) {
          const results = await Promise.all([
            supabase.from("candidates").select("*", { count: "exact", head: true }),
            supabase.from("candidates").select("*", { count: "exact", head: true }).eq("status", "active"),
            supabase.from("candidates").select("current_score, total_votes, paid_votes, bonus_votes, penalty_points, candidate_type"),
            supabase.from("payments").select("amount").eq("status", "paid"),
            supabase.from("payments").select("amount, vote_quantity").eq("status", "paid").gte("created_at", today.toISOString()),
          ]);
          totalCandidates = results[0].count;
          activeCandidates = results[1].count;
          candidateRows = results[2].data;
          allPayments = results[3].data;
          todayPayments = results[4].data;
        }

        perfMark("Supabase queries END");
        let cands = candidateRows;
        if (!cands || cands.length === 0) {
          // Admin fallback: use demo data (full shape with internal fields)
          cands = DEMO_CANDIDATES as unknown as typeof candidateRows;
        }

        const totalScore = (cands ?? []).reduce((s, c) => s + (c.current_score ?? c.total_votes ?? 0), 0);
        const paidVotes = (cands ?? []).reduce((s, c) => s + (c.paid_votes ?? c.total_votes ?? 0), 0);
        const bonusVotes = (cands ?? []).reduce((s, c) => s + (c.bonus_votes ?? 0), 0);
        const penaltyPoints = (cands ?? []).reduce((s, c) => s + (c.penalty_points ?? 0), 0);

        // Revenue is strictly from actual payments (or paid votes: $1/ind, $2/couple)
        let revenueCents = (allPayments ?? []).reduce((s, p) => s + (p.amount ?? 0), 0);
        if (revenueCents === 0 && (cands ?? []).length > 0) {
          revenueCents = (cands ?? []).reduce((s, c) => {
            const isCouple = c.candidate_type === "couple";
            const pVotes = c.paid_votes ?? c.total_votes ?? 0;
            return s + pVotes * (isCouple ? 200 : 100);
          }, 0);
        }

        setStats({
          totalCandidates: totalCandidates ?? (cands?.length ?? 0),
          activeCandidates: activeCandidates ?? (cands?.length ?? 0),
          totalScore,
          paidVotes,
          bonusVotes,
          penaltyPoints,
          totalRevenueCents: revenueCents,
          todayVotes: (todayPayments ?? []).reduce((s, p) => s + (p.vote_quantity ?? 0), 0),
          todayRevenueCents: (todayPayments ?? []).reduce((s, p) => s + (p.amount ?? 0), 0),
        });
      } catch {
        // demo fallback
      } finally {
        setLoading(false);
        perfNavEnd("Dashboard total");
      }
    }
    void load();
  }, []);

  return (
    <AdminLayout>
      <Helmet><title>Admin Overview — Pair Up or Leave</title></Helmet>

      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#24131A", margin: "0 0 0.25rem", letterSpacing: "-0.02em" }}>
          Dashboard Overview
        </h1>
        <p style={{ fontSize: "0.9375rem", color: "#6B6870", margin: 0 }}>
          Platform statistics and score ledger metrics at a glance.
        </p>
      </div>

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.25rem" }}>
          {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="skeleton" style={{ height: 120, borderRadius: 16 }} />)}
        </div>
      ) : stats ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.25rem" }}>
          <StatCard title="Total Candidates" value={formatNumber(stats.totalCandidates)} icon={Users} color="#7A0C2E" bg="#FFE1E8" />
          <StatCard title="Active Candidates" value={formatNumber(stats.activeCandidates)} icon={Activity} color="#16A34A" bg="#F0FDF4" subtitle={`${stats.totalCandidates - stats.activeCandidates} paused`} />
          <StatCard title="Current Platform Score" value={formatNumber(stats.totalScore)} icon={Vote} color="#E51B3E" bg="#FFF3F5" subtitle={`Paid (${formatNumber(stats.paidVotes)}) + Points (${formatNumber(stats.bonusVotes)}) - Pen (${formatNumber(stats.penaltyPoints)})`} />
          <StatCard title="Total Paid Revenue" value={formatCurrency(stats.totalRevenueCents)} icon={DollarSign} color="#16A34A" bg="#F0FDF4" subtitle="From Stripe payments only" />
          <StatCard title="Total Paid Votes" value={formatNumber(stats.paidVotes)} icon={TrendingUp} color="#7A0C2E" bg="#FFE1E8" subtitle={`+${formatNumber(stats.bonusVotes)} points added`} />
          <StatCard title="Total Penalties Applied" value={`-${formatNumber(stats.penaltyPoints)}`} icon={BarChart3} color="#DC2626" bg="#FEF2F2" subtitle="Deducted from candidate scores" />
        </div>
      ) : null}
    </AdminLayout>
  );
}
