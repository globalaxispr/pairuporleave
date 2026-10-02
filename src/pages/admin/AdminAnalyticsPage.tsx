import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import { supabase, type Candidate, fetchAdminCandidates, IS_SUPABASE_READY } from "@/lib/supabase";
import { formatNumber, formatCurrency } from "@/lib/utils";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Users, User, DollarSign, Vote as VoteIcon } from "lucide-react";
import { perfPageMount, perfMark, perfNavEnd } from "@/lib/adminPerf";

const DATE_FILTERS = [
  { label: "Today", days: 0 },
  { label: "7 Days", days: 7 },
  { label: "30 Days", days: 30 },
  { label: "All Time", days: -1 },
];

const COLORS = ["#E51B3E", "#7A0C2E", "#FF5475", "#4A061C", "#A82046", "#F43F5E"];
const TYPE_COLORS = ["#7A0C2E", "#E51B3E"];

interface PaymentRecord {
  created_at: string;
  amount: number;
  vote_quantity: number;
  candidate_id: string;
  candidate_type?: "individual" | "couple" | null;
}

export function AdminAnalyticsPage() {
  perfPageMount("AdminAnalyticsPage");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [_dateFilter, setDateFilter] = useState(30);
  const [activeFilter, setActiveFilter] = useState("30 Days");

  useEffect(() => {
    async function load() {
      perfMark("Supabase analytics queries START");

      let c: Candidate[] | null = null;
      let p: PaymentRecord[] | null = null;

      if (IS_SUPABASE_READY) {
        const results = await Promise.all([
          supabase.from("candidates").select("*").order("current_score", { ascending: false }),
          supabase.from("payments").select("created_at, amount, vote_quantity, candidate_id, candidate_type").eq("status", "paid").order("created_at"),
        ]);
        c = results[0].data;
        p = results[1].data;
      }

      perfMark("Supabase analytics queries END");

      let cands = c;
      if (!cands || cands.length === 0) {
        cands = await fetchAdminCandidates();
      }

      setCandidates(cands ?? []);
      setPayments(p ?? []);
      setLoading(false);
      perfNavEnd("Analytics total");
    }
    void load();
  }, []);

  // Score & Vote Breakdown calculations
  const totalScore = candidates.reduce((sum, c) => sum + (c.current_score ?? c.total_votes ?? 0), 0);
  const totalPaidVotes = candidates.reduce((sum, c) => sum + (c.paid_votes ?? c.total_votes ?? 0), 0);
  const totalBonusVotes = candidates.reduce((sum, c) => sum + (c.bonus_votes ?? 0), 0);
  const totalPenaltyPoints = candidates.reduce((sum, c) => sum + (c.penalty_points ?? 0), 0);

  const individualPaidVotes = candidates
    .filter((c) => c.candidate_type !== "couple")
    .reduce((sum, c) => sum + (c.paid_votes ?? c.total_votes ?? 0), 0);
  const couplePaidVotes = candidates
    .filter((c) => c.candidate_type === "couple")
    .reduce((sum, c) => sum + (c.paid_votes ?? c.total_votes ?? 0), 0);

  // Revenue is strictly from PAID VOTES ($1 individual, $2 couple)
  const individualRevenueCents = individualPaidVotes * 100;
  const coupleRevenueCents = couplePaidVotes * 200;
  const totalRevenueCents = individualRevenueCents + coupleRevenueCents;

  // Score & Revenue by candidate (bar chart data)
  const votesByCandidate = candidates.slice(0, 10).map((c) => {
    const isCouple = c.candidate_type === "couple";
    const displayName = isCouple ? (c.display_name || c.name) : c.name;
    const paid = c.paid_votes ?? c.total_votes ?? 0;
    const score = c.current_score ?? c.total_votes ?? 0;
    return {
      name: displayName.split(" ").slice(0, 2).join(" "),
      votes: score,
      revenue: (paid * (isCouple ? 2 : 1)),
    };
  });

  // Type Distribution for pie chart (based on paid revenue)
  const typeDistributionData = [
    { name: "Individual ($1/vote)", value: individualRevenueCents / 100, votes: individualPaidVotes },
    { name: "Couple ($2/vote)", value: coupleRevenueCents / 100, votes: couplePaidVotes },
  ].filter((d) => d.value > 0);

  // Votes over time (line chart)
  const votesByDay = payments.reduce<Record<string, number>>((acc, p) => {
    const day = p.created_at.substring(0, 10);
    acc[day] = (acc[day] ?? 0) + p.vote_quantity;
    return acc;
  }, {});

  const votesOverTime = Object.entries(votesByDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, votes]) => ({ date, votes }));

  // Revenue over time
  const revenueByDay = payments.reduce<Record<string, number>>((acc, p) => {
    const day = p.created_at.substring(0, 10);
    acc[day] = (acc[day] ?? 0) + p.amount / 100;
    return acc;
  }, {});
  const revenueOverTime = Object.entries(revenueByDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date, revenue }));

  // Pie chart (score distribution)
  const pieData = candidates.slice(0, 6).map((c, i) => ({
    name: (c.candidate_type === "couple" ? (c.display_name || c.name) : c.name).split(" ")[0],
    value: c.current_score ?? c.total_votes ?? 0,
    color: COLORS[i % COLORS.length],
  }));

  return (
    <AdminLayout>
      <Helmet><title>Analytics — Pair Up or Leave Admin</title></Helmet>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#24131A", margin: "0 0 0.25rem", letterSpacing: "-0.02em" }}>Analytics</h1>
          <p style={{ fontSize: "0.9375rem", color: "#6B6870", margin: 0 }}>Votes and revenue broken down by candidate and type.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {DATE_FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => { setDateFilter(f.days); setActiveFilter(f.label); }}
              style={{
                padding: "0.375rem 0.875rem",
                borderRadius: 8,
                border: `1.5px solid ${activeFilter === f.label ? "#7A0C2E" : "#F0DCE2"}`,
                background: activeFilter === f.label ? "#FFE1E8" : "#FFFFFF",
                color: activeFilter === f.label ? "#7A0C2E" : "#6B6870",
                fontWeight: 600,
                fontSize: "0.8125rem",
                cursor: "pointer",
                minHeight: 36,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 280, borderRadius: 16 }} />)}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Summary Breakdown Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
            {/* Total Revenue */}
            <div style={{ background: "#ffffff", borderRadius: 16, border: "1px solid #F0DCE2", padding: "1.25rem", boxShadow: "0 2px 8px rgba(74,6,28,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#6B6870", textTransform: "uppercase" }}>Total Revenue</span>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "#ECFDF5", display: "flex", alignItems: "center", justifyContent: "center", color: "#059669" }}>
                  <DollarSign size={18} />
                </div>
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#24131A", marginBottom: "0.5rem" }}>
                {formatCurrency(totalRevenueCents)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.75rem", color: "#6B6870", borderTop: "1px solid #FDF2F4", paddingTop: "0.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Individual ($1/vote):</span>
                  <span style={{ fontWeight: 700, color: "#7A0C2E" }}>{formatCurrency(individualRevenueCents)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Couple ($2/vote):</span>
                  <span style={{ fontWeight: 700, color: "#E51B3E" }}>{formatCurrency(coupleRevenueCents)}</span>
                </div>
              </div>
            </div>

            {/* Current Score */}
            <div style={{ background: "#ffffff", borderRadius: 16, border: "1px solid #F0DCE2", padding: "1.25rem", boxShadow: "0 2px 8px rgba(74,6,28,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#6B6870", textTransform: "uppercase" }}>Current Score</span>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "#FFF3F5", display: "flex", alignItems: "center", justifyContent: "center", color: "#E51B3E" }}>
                  <VoteIcon size={18} />
                </div>
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#E51B3E", marginBottom: "0.5rem" }}>
                {formatNumber(totalScore)} <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#7A0C2E" }}>pts</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.75rem", color: "#6B6870", borderTop: "1px solid #FDF2F4", paddingTop: "0.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Paid Base:</span>
                  <span style={{ fontWeight: 700, color: "#24131A" }}>{formatNumber(totalPaidVotes)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Net Adjustment:</span>
                  <span style={{ fontWeight: 700, color: totalBonusVotes >= totalPenaltyPoints ? "#059669" : "#DC2626" }}>
                    {totalBonusVotes >= totalPenaltyPoints ? `+${formatNumber(totalBonusVotes - totalPenaltyPoints)}` : formatNumber(totalBonusVotes - totalPenaltyPoints)}
                  </span>
                </div>
              </div>
            </div>

            {/* Paid Votes */}
            <div style={{ background: "#ffffff", borderRadius: 16, border: "1px solid #F0DCE2", padding: "1.25rem", boxShadow: "0 2px 8px rgba(74,6,28,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#6B6870", textTransform: "uppercase" }}>Paid Votes</span>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "#FFE1E8", display: "flex", alignItems: "center", justifyContent: "center", color: "#7A0C2E" }}>
                  <Users size={18} />
                </div>
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#24131A", marginBottom: "0.5rem" }}>
                {formatNumber(totalPaidVotes)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.75rem", color: "#6B6870", borderTop: "1px solid #FDF2F4", paddingTop: "0.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Individual:</span>
                  <span style={{ fontWeight: 700, color: "#7A0C2E" }}>{formatNumber(individualPaidVotes)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Couple:</span>
                  <span style={{ fontWeight: 700, color: "#E51B3E" }}>{formatNumber(couplePaidVotes)}</span>
                </div>
              </div>
            </div>

            {/* Score Adjustments */}
            <div style={{ background: "#ffffff", borderRadius: 16, border: "1px solid #F0DCE2", padding: "1.25rem", boxShadow: "0 2px 8px rgba(74,6,28,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#6B6870", textTransform: "uppercase" }}>Score Adjustments</span>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "#FFF8FA", display: "flex", alignItems: "center", justifyContent: "center", color: "#7A0C2E" }}>
                  <VoteIcon size={18} />
                </div>
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "#24131A", marginBottom: "0.5rem" }}>
                <span style={{ color: "#059669" }}>+{formatNumber(totalBonusVotes)}</span>
                <span style={{ fontSize: "1.25rem", color: "#6B6870", margin: "0 0.25rem" }}>/</span>
                <span style={{ color: "#DC2626" }}>-{formatNumber(totalPenaltyPoints)}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.75rem", color: "#6B6870", borderTop: "1px solid #FDF2F4", paddingTop: "0.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Bonus Votes:</span>
                  <span style={{ fontWeight: 700, color: "#059669" }}>+{formatNumber(totalBonusVotes)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Penalty Points:</span>
                  <span style={{ fontWeight: 700, color: "#DC2626" }}>-{formatNumber(totalPenaltyPoints)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Charts row 1 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "1.5rem" }}>
            {/* Votes by candidate */}
            <div className="chart-card card-shadow" style={{ border: "1px solid #F0DCE2" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#24131A", marginBottom: "1.25rem" }}>Votes by Candidate</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={votesByCandidate} margin={{ bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#FDF2F4" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [formatNumber(Number(v) || 0), "Votes"]} />
                  <Bar dataKey="votes" fill="#E51B3E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Revenue by Type pie */}
            <div className="chart-card card-shadow" style={{ border: "1px solid #F0DCE2" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#24131A", marginBottom: "1.25rem" }}>Revenue by Candidate Type</h3>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={typeDistributionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                    {typeDistributionData.map((_entry, i) => (
                      <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip formatter={(v: any) => [`$${Number(v || 0).toFixed(2)}`, "Revenue"]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Charts row 2 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "1.5rem" }}>
            {/* Votes over time */}
            <div className="chart-card card-shadow" style={{ border: "1px solid #F0DCE2" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#24131A", marginBottom: "1.25rem" }}>Votes Over Time</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={votesOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#FDF2F4" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [formatNumber(Number(v) || 0), "Votes"]} />
                  <Line type="monotone" dataKey="votes" stroke="#7A0C2E" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Revenue over time */}
            <div className="chart-card card-shadow" style={{ border: "1px solid #F0DCE2" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#24131A", marginBottom: "1.25rem" }}>Revenue Over Time ($)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={revenueOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#FDF2F4" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [`$${Number(v || 0).toFixed(2)}`, "Revenue"]} />
                  <Line type="monotone" dataKey="revenue" stroke="#E51B3E" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Rankings table */}
          <div className="chart-card card-shadow" style={{ border: "1px solid #F0DCE2" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#24131A", marginBottom: "1.25rem" }}>Candidate Revenue &amp; Score Ledger</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #F0DCE2" }}>
                    {["Rank", "Candidate", "Type", "Score", "Paid", "Bonus", "Penalty", "Price/Vote", "Paid Revenue"].map((h) => (
                      <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", fontSize: "0.8125rem", fontWeight: 600, color: "#6B6870", textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c, i) => {
                    const isCouple = c.candidate_type === "couple";
                    const pricePerVote = isCouple ? 2 : 1;
                    const paid = c.paid_votes ?? c.total_votes ?? 0;
                    const bonus = c.bonus_votes ?? 0;
                    const penalty = c.penalty_points ?? 0;
                    const score = c.current_score ?? c.total_votes ?? 0;
                    const revenueCents = paid * pricePerVote * 100;

                    return (
                      <tr key={c.id} style={{ borderBottom: i < candidates.length - 1 ? "1px solid #FDF2F4" : "none" }}>
                        <td style={{ padding: "0.75rem 1rem", fontWeight: 800, color: i < 3 ? "#7A0C2E" : "#6B6870" }}>#{i + 1}</td>
                        <td style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "#24131A" }}>
                          {c.display_name || c.name}
                        </td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          {isCouple ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", background: "#FFE1E8", color: "#7A0C2E", border: "1px solid #F0DCE2", padding: "0.2rem 0.5rem", borderRadius: 99, fontSize: "0.6875rem", fontWeight: 700 }}>
                              <Users size={11} /> Couple
                            </span>
                          ) : (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", background: "#F3F4F6", color: "#374151", border: "1px solid #E5E7EB", padding: "0.2rem 0.5rem", borderRadius: 99, fontSize: "0.6875rem", fontWeight: 700 }}>
                              <User size={11} /> Individual
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", fontWeight: 900, color: "#E51B3E" }}>{formatNumber(score)} pts</td>
                        <td style={{ padding: "0.75rem 1rem", fontWeight: 700, color: "#24131A" }}>{formatNumber(paid)}</td>
                        <td style={{ padding: "0.75rem 1rem", fontWeight: 700, color: "#059669" }}>+{formatNumber(bonus)}</td>
                        <td style={{ padding: "0.75rem 1rem", fontWeight: 700, color: "#DC2626" }}>-{formatNumber(penalty)}</td>
                        <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem", color: "#6B6870", fontWeight: 600 }}>${pricePerVote}/vote</td>
                        <td style={{ padding: "0.75rem 1rem", fontWeight: 700, color: "#16A34A" }}>{formatCurrency(revenueCents)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
