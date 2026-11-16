import { useEffect, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import {
  supabase,
  supabaseUrl,
  type Payment,
  type CandidateType,
  IS_SUPABASE_READY,
} from "@/lib/supabase";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  Search,
  User,
  Users,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  RotateCcw,
} from "lucide-react";
import { perfPageMount, perfMark, perfNavEnd } from "@/lib/adminPerf";

type PaymentWithDetails = Payment & {
  candidates?: {
    name: string;
    display_name?: string | null;
    candidate_type?: CandidateType | null;
  } | null;
  votes?: { id: string; quantity: number }[] | { id: string; quantity: number } | null;
};

interface ReconciliationRunSummary {
  id: string;
  trigger_source: string;
  status: "running" | "completed" | "failed";
  scanned_count: number;
  recovered_count: number;
  already_credited_count: number;
  skipped_unpaid_count: number;
  transient_error_count: number;
  flagged_manual_review_count: number;
  error_summary?: string | null;
  started_at: string;
  completed_at?: string | null;
}

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "needs_attention", label: "Needs Attention" },
  { key: "uncredited", label: "Paid & Uncredited" },
  { key: "manual_review", label: "Manual Review" },
  { key: "paid", label: "Paid" },
  { key: "pending", label: "Pending" },
  { key: "failed", label: "Failed" },
  { key: "refunded", label: "Refunds" },
  { key: "disputed", label: "Disputes" },
] as const;

function hasCreditedVote(p: PaymentWithDetails): boolean {
  if (p.votes_credited_at) return true;
  if (Array.isArray(p.votes)) return p.votes.length > 0;
  if (p.votes && typeof p.votes === "object" && "id" in p.votes) return true;
  // Backward compatibility if votes join was not returned on an already-paid legacy row
  return false;
}

function isPendingOlderThan5Min(p: PaymentWithDetails, nowMs: number): boolean {
  if (p.status !== "pending") return false;
  const createdMs = new Date(p.created_at).getTime();
  return !isNaN(createdMs) && nowMs - createdMs >= 5 * 60 * 1000;
}

function isPaidButUncredited(p: PaymentWithDetails, votesJoinAvailable: boolean): boolean {
  if (p.status !== "paid") return false;
  if (p.votes_credited_at) return false;
  if (!votesJoinAvailable) return false;
  return !hasCreditedVote(p);
}

export function AdminPaymentsPage() {
  perfPageMount("AdminPaymentsPage");
  const [payments, setPayments] = useState<PaymentWithDetails[]>([]);
  const [votesJoinAvailable, setVotesJoinAvailable] = useState(true);
  const [lastRun, setLastRun] = useState<ReconciliationRunSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconcilingAll, setReconcilingAll] = useState(false);
  const [reconcilingPaymentId, setReconcilingPaymentId] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const loadPaymentsAndMonitoring = useCallback(async () => {
    setLoading(true);
    perfMark("Supabase payments query START");

    if (IS_SUPABASE_READY) {
      // Try querying with embedded votes(id, quantity) join first
      const withVotesRes = await supabase
        .from("payments")
        .select("*, candidates(name, display_name, candidate_type), votes(id, quantity)")
        .order("created_at", { ascending: false });

      if (!withVotesRes.error && withVotesRes.data) {
        setPayments(withVotesRes.data as PaymentWithDetails[]);
        setVotesJoinAvailable(true);
      } else {
        const fallbackRes = await supabase
          .from("payments")
          .select("*, candidates(name, display_name, candidate_type)")
          .order("created_at", { ascending: false });
        setPayments((fallbackRes.data as PaymentWithDetails[]) ?? []);
        setVotesJoinAvailable(false);
      }

      // Best-effort fetch of latest reconciliation run
      try {
        const runRes = await supabase
          .from("payment_reconciliation_runs")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!runRes.error && runRes.data) {
          setLastRun(runRes.data as ReconciliationRunSummary);
        }
      } catch {
        // Ignore if table not yet migrated
      }
    } else {
      setPayments([]);
    }

    perfMark("Supabase payments query END");
    setLoading(false);
    perfNavEnd("Payments total");
  }, []);

  useEffect(() => {
    void loadPaymentsAndMonitoring();
  }, [loadPaymentsAndMonitoring]);

  async function triggerServerReconciliation(targetPaymentId?: string) {
    setBannerMessage(null);
    if (targetPaymentId) {
      setReconcilingPaymentId(targetPaymentId);
    } else {
      setReconcilingAll(true);
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        throw new Error("You must be signed in as an administrator to run payment reconciliation.");
      }

      const resp = await fetch(`${supabaseUrl}/functions/v1/reconcile-pending-payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          targetPaymentId ? { payment_id: targetPaymentId } : { batch_size: 15 }
        ),
      });

      const json = (await resp.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        summary?: {
          scanned_count: number;
          recovered_count: number;
          already_credited_count: number;
          skipped_unpaid_count: number;
          transient_error_count: number;
          flagged_manual_review_count: number;
          items?: { outcome: string; message: string }[];
        };
      } | null;

      if (!resp.ok || !json?.success) {
        throw new Error(json?.error || `Reconciliation request failed (HTTP ${resp.status}).`);
      }

      const s = json.summary;
      if (targetPaymentId && s?.items?.[0]) {
        setBannerMessage({
          type: s.items[0].outcome === "flagged_manual_review" || s.items[0].outcome === "transient_error" ? "error" : "success",
          text: s.items[0].message,
        });
      } else if (s) {
        setBannerMessage({
          type: "success",
          text: `Reconciliation completed: scanned ${s.scanned_count}, recovered ${s.recovered_count}, skipped unpaid ${s.skipped_unpaid_count}, flagged manual review ${s.flagged_manual_review_count}.`,
        });
      }

      await loadPaymentsAndMonitoring();
    } catch (err) {
      setBannerMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to run server reconciliation.",
      });
    } finally {
      setReconcilingAll(false);
      setReconcilingPaymentId(null);
    }
  }

  const nowMs = Date.now();
  const pendingAttentionCount = payments.filter((p) => isPendingOlderThan5Min(p, nowMs)).length;
  const paidUncreditedCount = payments.filter((p) => isPaidButUncredited(p, votesJoinAvailable)).length;
  const manualReviewCount = payments.filter(
    (p) =>
      Boolean(p.manual_review_required) ||
      p.reconciliation_status === "manual_review" ||
      p.reconciliation_status === "exhausted" ||
      p.reconciliation_status === "transient_error"
  ).length;
  const refundDisputeCount = payments.filter(
    (p) =>
      p.status === "refunded" ||
      (p.refund_status && p.refund_status !== "none") ||
      (p.dispute_status && p.dispute_status !== "none")
  ).length;

  const filtered = payments.filter((p) => {
    const isStalePending = isPendingOlderThan5Min(p, nowMs);
    const isUncredited = isPaidButUncredited(p, votesJoinAvailable);
    const isManualReview =
      Boolean(p.manual_review_required) ||
      p.reconciliation_status === "manual_review" ||
      p.reconciliation_status === "exhausted" ||
      p.reconciliation_status === "transient_error";
    const hasRefund = p.status === "refunded" || (p.refund_status && p.refund_status !== "none");
    const hasDispute = Boolean(p.dispute_status && p.dispute_status !== "none");

    let matchStatus = true;
    switch (statusFilter) {
      case "needs_attention":
        matchStatus = isStalePending || isUncredited || isManualReview || hasDispute;
        break;
      case "uncredited":
        matchStatus = isUncredited;
        break;
      case "manual_review":
        matchStatus = isManualReview;
        break;
      case "refunded":
        matchStatus = Boolean(hasRefund);
        break;
      case "disputed":
        matchStatus = hasDispute;
        break;
      case "all":
        matchStatus = true;
        break;
      default:
        matchStatus = p.status === statusFilter;
        break;
    }

    const candidateName = p.candidates?.display_name || p.candidates?.name || "";
    const matchSearch =
      !search ||
      p.stripe_session_id.toLowerCase().includes(search.toLowerCase()) ||
      (p.stripe_payment_intent_id || "").toLowerCase().includes(search.toLowerCase()) ||
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
      <Helmet><title>Payments & Reliability — Pair Up or Leave Admin</title></Helmet>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#24131A", margin: "0 0 0.25rem", letterSpacing: "-0.02em" }}>
            Payments & Reliability Monitoring
          </h1>
          <p style={{ fontSize: "0.9375rem", color: "#6B6870", margin: 0 }}>
            Stripe transactions, vote fulfillment status, automatic reconciliation, refunds, and disputes.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void triggerServerReconciliation()}
          disabled={reconcilingAll}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.625rem 1.125rem",
            borderRadius: 10,
            background: "#7A0C2E",
            color: "#FFFFFF",
            border: "none",
            fontWeight: 700,
            fontSize: "0.875rem",
            cursor: reconcilingAll ? "not-allowed" : "pointer",
            opacity: reconcilingAll ? 0.7 : 1,
          }}
        >
          <RefreshCw size={15} style={reconcilingAll ? { animation: "spin 1s linear infinite" } : undefined} />
          {reconcilingAll ? "Reconciling with Stripe..." : "Run Server Reconciliation"}
        </button>
      </div>

      {/* Monitoring Summary Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ background: "#FFFFFF", border: "1px solid #F0DCE2", borderRadius: 14, padding: "1rem 1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#6B6870" }}>Pending (&gt;5m)</span>
            <Clock size={16} color={pendingAttentionCount > 0 ? "#D97706" : "#9CA3AF"} />
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 800, color: pendingAttentionCount > 0 ? "#D97706" : "#24131A" }}>
            {pendingAttentionCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#6B6870" }}>Eligible for Stripe check</div>
        </div>

        <div style={{ background: "#FFFFFF", border: "1px solid #F0DCE2", borderRadius: 14, padding: "1rem 1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#6B6870" }}>Paid / Uncredited</span>
            <AlertTriangle size={16} color={paidUncreditedCount > 0 ? "#DC2626" : "#16A34A"} />
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 800, color: paidUncreditedCount > 0 ? "#DC2626" : "#16A34A" }}>
            {paidUncreditedCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#6B6870" }}>
            {paidUncreditedCount === 0 ? "All paid votes fulfilled" : "Requires immediate recovery"}
          </div>
        </div>

        <div style={{ background: "#FFFFFF", border: "1px solid #F0DCE2", borderRadius: 14, padding: "1rem 1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#6B6870" }}>Manual Review / Failures</span>
            <ShieldAlert size={16} color={manualReviewCount > 0 ? "#DC2626" : "#9CA3AF"} />
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 800, color: manualReviewCount > 0 ? "#DC2626" : "#24131A" }}>
            {manualReviewCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#6B6870" }}>Flagged conflicts or retries</div>
        </div>

        <div style={{ background: "#FFFFFF", border: "1px solid #F0DCE2", borderRadius: 14, padding: "1rem 1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#6B6870" }}>Refunds &amp; Disputes</span>
            <RotateCcw size={16} color={refundDisputeCount > 0 ? "#D97706" : "#9CA3AF"} />
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#24131A" }}>
            {refundDisputeCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#6B6870" }}>Votes preserved; audit logged</div>
        </div>

        <div style={{ background: "#FFFFFF", border: "1px solid #F0DCE2", borderRadius: 14, padding: "1rem 1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#6B6870" }}>Last Reconciliation</span>
            <CheckCircle2 size={16} color={lastRun?.status === "failed" ? "#DC2626" : "#16A34A"} />
          </div>
          <div style={{ fontSize: "0.9375rem", fontWeight: 800, color: "#24131A", textTransform: "capitalize" }}>
            {lastRun ? `${lastRun.status} (${lastRun.recovered_count} recovered)` : "No runs recorded"}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#6B6870" }}>
            {lastRun ? formatDate(lastRun.completed_at || lastRun.started_at) : "Scheduled every 10m when enabled"}
          </div>
        </div>
      </div>

      {bannerMessage && (
        <div
          style={{
            background: bannerMessage.type === "error" ? "#FEF2F2" : "#F0FDF4",
            border: `1px solid ${bannerMessage.type === "error" ? "#FECACA" : "#BBF7D0"}`,
            color: bannerMessage.type === "error" ? "#991B1B" : "#166534",
            borderRadius: 12,
            padding: "0.875rem 1rem",
            marginBottom: "1.25rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{bannerMessage.text}</span>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            style={{ background: "transparent", border: "none", cursor: "pointer", fontWeight: 700, color: "inherit" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={15} color="#9CA3AF" style={{ position: "absolute", left: "0.875rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            type="search"
            placeholder="Search by candidate, session ID, or PaymentIntent..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field"
            style={{ paddingLeft: "2.5rem" }}
          />
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.key}
              onClick={() => setStatusFilter(s.key)}
              style={{
                padding: "0.375rem 0.875rem",
                borderRadius: 8,
                border: `1.5px solid ${statusFilter === s.key ? "#7A0C2E" : "#F0DCE2"}`,
                background: statusFilter === s.key ? "#FFE1E8" : "#FFFFFF",
                color: statusFilter === s.key ? "#7A0C2E" : "#6B6870",
                fontWeight: 600,
                fontSize: "0.8125rem",
                cursor: "pointer",
                minHeight: 36,
              }}
            >
              {s.label}
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
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1050 }}>
              <thead>
                <tr style={{ background: "#FFF8FA", borderBottom: "1px solid #F0DCE2" }}>
                  {[
                    "Date",
                    "Candidate",
                    "Type",
                    "Votes",
                    "Base Subtotal",
                    "Service Fee",
                    "Total Paid",
                    "Status",
                    "Fulfillment & Reliability",
                    "Stripe Session",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "0.875rem 1rem",
                        textAlign: "left",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "#6B6870",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} style={{ textAlign: "center", padding: "3rem", color: "#9CA3AF" }}>No payments found matching current filter.</td></tr>
                ) : (
                  filtered.map((p, i) => {
                    const candType = p.candidate_type || p.candidates?.candidate_type || "individual";
                    const isCouple = candType === "couple";
                    const votePriceCents =
                      p.vote_price !== undefined && p.vote_price !== null
                        ? p.vote_price >= 100
                          ? p.vote_price
                          : p.vote_price * 100
                        : isCouple
                          ? 200
                          : 100;
                    const subtotalCents = p.subtotal_amount ?? p.vote_quantity * votePriceCents;
                    const serviceFeeCents =
                      p.service_fee_amount ?? Math.max(0, p.amount - subtotalCents - (p.tax_amount ?? 0));
                    const candidateName = p.candidates?.display_name || p.candidates?.name || "—";

                    const credited = hasCreditedVote(p) || (p.status === "paid" && !votesJoinAvailable);
                    const uncreditedPaid = isPaidButUncredited(p, votesJoinAvailable);
                    const stalePending = isPendingOlderThan5Min(p, nowMs);
                    const attempts = p.reconciliation_attempts ?? 0;
                    const canVerifyWithStripe =
                      p.status === "pending" ||
                      uncreditedPaid ||
                      Boolean(p.manual_review_required) ||
                      (p.status === "failed" && p.reconciliation_status !== "skipped_unpaid");

                    return (
                      <tr key={p.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid #FDF2F4" : "none" }}>
                        <td style={{ padding: "0.875rem 1rem", fontSize: "0.8125rem", color: "#6B6870", whiteSpace: "nowrap" }}>
                          {formatDate(p.created_at)}
                        </td>
                        <td style={{ padding: "0.875rem 1rem", fontSize: "0.9375rem", fontWeight: 600, color: "#24131A" }}>
                          {candidateName}
                        </td>
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
                        <td style={{ padding: "0.875rem 1rem", fontSize: "0.875rem", fontWeight: 600, color: "#24131A" }}>
                          {formatCurrency(subtotalCents)}
                        </td>
                        <td style={{ padding: "0.875rem 1rem", fontSize: "0.875rem", color: "#6B6870" }}>
                          {formatCurrency(serviceFeeCents)}
                        </td>
                        <td style={{ padding: "0.875rem 1rem", fontWeight: 700, color: "#24131A" }}>
                          {formatCurrency(p.amount)}
                        </td>
                        <td style={{ padding: "0.875rem 1rem" }}>
                          <span className={`badge ${statusColors[p.status] ?? "badge-gray"}`} style={{ textTransform: "capitalize" }}>
                            {p.status}
                          </span>
                        </td>
                        <td style={{ padding: "0.875rem 1rem", fontSize: "0.75rem" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                            {credited && (
                              <span style={{ color: "#15803D", fontWeight: 700 }}>
                                ✓ Votes Credited{p.recovered_at ? " (Recovered)" : ""}
                              </span>
                            )}
                            {uncreditedPaid && (
                              <span style={{ color: "#DC2626", fontWeight: 700 }}>
                                ⚠ Paid — Votes Uncredited
                              </span>
                            )}
                            {stalePending && (
                              <span style={{ color: "#B45309", fontWeight: 600 }}>
                                ⏳ Pending &gt; 5m
                              </span>
                            )}
                            {p.refund_status && p.refund_status !== "none" && (
                              <span style={{ color: "#991B1B", fontWeight: 700 }}>
                                ↺ Refund ({p.refund_status}: {formatCurrency(p.refunded_amount ?? 0)})
                              </span>
                            )}
                            {p.dispute_status && p.dispute_status !== "none" && (
                              <span style={{ color: p.dispute_status === "won" ? "#15803D" : "#DC2626", fontWeight: 700 }}>
                                ⚑ Dispute: {p.dispute_status}
                              </span>
                            )}
                            {p.manual_review_required && (
                              <span style={{ color: "#DC2626", fontWeight: 700 }} title={p.manual_review_reason || ""}>
                                ⚠ Manual Review: {p.manual_review_reason || "Flagged"}
                              </span>
                            )}
                            {attempts > 0 && (
                              <span style={{ color: "#6B6870" }}>
                                Reconcile attempts: {attempts} ({p.reconciliation_status || "none"})
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "0.875rem 1rem" }}>
                          <code style={{ fontSize: "0.75rem", color: "#6B6870", background: "#FFF3F5", padding: "0.2rem 0.4rem", borderRadius: 4 }}>
                            {p.stripe_session_id.substring(0, 22)}…
                          </code>
                        </td>
                        <td style={{ padding: "0.875rem 1rem", whiteSpace: "nowrap" }}>
                          {canVerifyWithStripe ? (
                            <button
                              type="button"
                              onClick={() => void triggerServerReconciliation(p.id)}
                              disabled={reconcilingPaymentId === p.id || reconcilingAll}
                              style={{
                                padding: "0.35rem 0.65rem",
                                borderRadius: 6,
                                border: "1px solid #7A0C2E",
                                background: "#FFF8FA",
                                color: "#7A0C2E",
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                cursor: reconcilingPaymentId === p.id ? "not-allowed" : "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.35rem",
                              }}
                              title="Verifies payment status directly with Stripe API server-side before crediting"
                            >
                              <RefreshCw size={12} style={reconcilingPaymentId === p.id ? { animation: "spin 1s linear infinite" } : undefined} />
                              {reconcilingPaymentId === p.id ? "Verifying..." : "Verify with Stripe"}
                            </button>
                          ) : (
                            <span style={{ fontSize: "0.75rem", color: "#9CA3AF" }}>—</span>
                          )}
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
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </AdminLayout>
  );
}
