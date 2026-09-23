import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase, type Payment, type CandidateType, IS_SUPABASE_READY } from "@/lib/supabase";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Search, User, Users } from "lucide-react";
import { perfPageMount, perfMark, perfNavEnd } from "@/lib/adminPerf";

type PaymentWithCandidate = Payment & {
  candidates?: {
    name: string;
    display_name?: string | null;
    candidate_type?: CandidateType | null;
  } | null;
};

const STATUS_FILTERS = ["all", "paid", "pending", "failed", "refunded"] as const;

export function AdminPaymentsPage() {
  perfPageMount("AdminPaymentsPage");
  const [payments, setPayments] = useState<PaymentWithCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      perfMark("Supabase payments query START");
      let data: PaymentWithCandidate[] | null = null;
      if (IS_SUPABASE_READY) {
        const result = await supabase
          .from("payments")
          .select("*, candidates(name, display_name, candidate_type)")
          .order("created_at", { ascending: false });
        data = result.data as PaymentWithCandidate[];
      }
      perfMark("Supabase payments query END");
      setPayments(data ?? []);
      setLoading(false);
      perfNavEnd("Payments total");
    }
    void load();
  }, []);

  const filtered = payments.filter((p) => {
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    const candidateName = p.candidates?.display_name || p.candidates?.name || "";
    const matchSearch =
      !search ||
      p.stripe_session_id.toLowerCase().includes(search.toLowerCase()) ||
      candidateName.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const statusColors: Record<string, string> = {
    paid: "badge-green",
    pending: "badge-gray",
    failed: "badge-red",
    refunded: "badge-gray",
  };

  return (
    <AdminLayout>
      <Helmet><title>Payments — Pair Up or Leave Admin</title></Helmet>

      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#24131A", margin: "0 0 0.25rem", letterSpacing: "-0.02em" }}>Payments</h1>
        <p style={{ fontSize: "0.9375rem", color: "#6B6870", margin: 0 }}>All transactions processed through Stripe.</p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={15} color="#9CA3AF" style={{ position: "absolute", left: "0.875rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            type="search"
            placeholder="Search by candidate or Stripe ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field"
            style={{ paddingLeft: "2.5rem" }}
          />
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: "0.375rem 0.875rem",
                borderRadius: 8,
                border: `1.5px solid ${statusFilter === s ? "#7A0C2E" : "#F0DCE2"}`,
                background: statusFilter === s ? "#FFE1E8" : "#FFFFFF",
                color: statusFilter === s ? "#7A0C2E" : "#6B6870",
                fontWeight: 600,
                fontSize: "0.8125rem",
                cursor: "pointer",
                textTransform: "capitalize",
                minHeight: 36,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 12 }} />)}
        </div>
      ) : (
        <div style={{ background: "#ffffff", border: "1px solid #F0DCE2", borderRadius: 16, overflow: "hidden" }} className="card-shadow">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
              <thead>
                <tr style={{ background: "#FFF8FA", borderBottom: "1px solid #F0DCE2" }}>
                  {["Date", "Candidate", "Type", "Votes", "Price/Vote", "Total Paid", "Status", "Stripe Session ID"].map((h) => (
                    <th key={h} style={{ padding: "0.875rem 1rem", textAlign: "left", fontSize: "0.8125rem", fontWeight: 600, color: "#6B6870", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: "center", padding: "3rem", color: "#9CA3AF" }}>No payments found.</td></tr>
                ) : (
                  filtered.map((p, i) => {
                    const candType = p.candidate_type || p.candidates?.candidate_type || "individual";
                    const isCouple = candType === "couple";
                    const votePrice = p.vote_price ?? (isCouple ? 2 : 1);
                    const candidateName = p.candidates?.display_name || p.candidates?.name || "—";

                    return (
                      <tr key={p.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid #FDF2F4" : "none" }}>
                        <td style={{ padding: "0.875rem 1rem", fontSize: "0.875rem", color: "#6B6870", whiteSpace: "nowrap" }}>{formatDate(p.created_at)}</td>
                        <td style={{ padding: "0.875rem 1rem", fontSize: "0.9375rem", fontWeight: 600, color: "#24131A" }}>{candidateName}</td>
                        <td style={{ padding: "0.875rem 1rem" }}>
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
                        <td style={{ padding: "0.875rem 1rem", fontWeight: 700, color: "#E51B3E" }}>{p.vote_quantity}</td>
                        <td style={{ padding: "0.875rem 1rem", fontSize: "0.875rem", fontWeight: 600, color: "#24131A" }}>${votePrice}/vote</td>
                        <td style={{ padding: "0.875rem 1rem", fontWeight: 700, color: "#24131A" }}>{formatCurrency(p.amount)}</td>
                        <td style={{ padding: "0.875rem 1rem" }}><span className={`badge ${statusColors[p.status] ?? "badge-gray"}`} style={{ textTransform: "capitalize" }}>{p.status}</span></td>
                        <td style={{ padding: "0.875rem 1rem" }}>
                          <code style={{ fontSize: "0.75rem", color: "#6B6870", background: "#FFF3F5", padding: "0.2rem 0.4rem", borderRadius: 4 }}>
                            {p.stripe_session_id.substring(0, 26)}…
                          </code>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
