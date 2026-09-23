import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Helmet } from "react-helmet-async";
import {
  FileText, Search, Filter, DollarSign, Gift, ShieldAlert,
  RefreshCw, ArrowRight, PlusCircle, AlertCircle
} from "lucide-react";
import {
  type Candidate, type ScoreLedgerEntry, type ScoreAdjustmentType,
  fetchCandidateLedgerSafe, fetchCandidatesSafe, adjustCandidateScore, getCandidateScore
} from "@/lib/supabase";
import { formatNumber, formatDate } from "@/lib/utils";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import { perfPageMount, perfMark, perfNavEnd } from "@/lib/adminPerf";

export function AdminLedgerPage() {
  perfPageMount("AdminLedgerPage");
  const { user } = useAuth();
  const [entries, setEntries] = useState<ScoreLedgerEntry[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Correction Modal state
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [correctionDirection, setCorrectionDirection] = useState<"+" | "-">("+");
  const [correctionAmount, setCorrectionAmount] = useState<number | "">("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const hasMounted = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    perfMark("Supabase ledger+candidates queries START");
    const [ledgerData, candData] = await Promise.all([
      fetchCandidateLedgerSafe(),
      fetchCandidatesSafe(),
    ]);
    perfMark("Supabase ledger+candidates queries END");
    setEntries(ledgerData);
    setCandidates(candData);
    // Only auto-select the first candidate on the very first load.
    // DO NOT include selectedCandidateId in deps — that causes an infinite re-fetch loop.
    if (!hasMounted.current && candData.length > 0) {
      setSelectedCandidateId(candData[0].id);
      hasMounted.current = true;
    }
    setLoading(false);
    perfNavEnd("Ledger total");
  }, []); // ← stable: no state deps

  useEffect(() => {
    void load();
  }, [load]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (typeFilter !== "ALL" && entry.type !== typeFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const candName = (entry.candidate?.display_name || entry.candidate?.name || "").toLowerCase();
        const reason = entry.reason.toLowerCase();
        const admin = (entry.admin_email || "").toLowerCase();
        return candName.includes(q) || reason.includes(q) || admin.includes(q);
      }
      return true;
    });
  }, [entries, typeFilter, searchQuery]);

  async function handleCreateCorrection(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCandidateId) {
      setFormError("Please select a candidate.");
      return;
    }
    const amt = typeof correctionAmount === "number" ? correctionAmount : 0;
    if (amt <= 0) {
      setFormError("Please enter a positive amount for the correction.");
      return;
    }
    if (!correctionReason.trim() || correctionReason.trim().length < 3) {
      setFormError("Reason must be at least 3 characters.");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const signedQty = correctionDirection === "-" ? -amt : amt;

    try {
      const res = await adjustCandidateScore({
        candidateId: selectedCandidateId,
        type: "CORRECTION" as ScoreAdjustmentType,
        quantity: signedQty,
        reason: `[CORRECTION] ${correctionReason.trim()}`,
        referenceId: referenceId.trim() || undefined,
        adminEmail: user?.email || undefined,
      });

      if (!res.success) {
        throw new Error(res.error || "Failed to submit correction.");
      }

      setCorrectionModalOpen(false);
      setCorrectionAmount("");
      setCorrectionReason("");
      setReferenceId("");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Correction failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function getTypeBadge(type: ScoreLedgerEntry["type"]) {
    switch (type) {
      case "PAID_VOTE":
        return {
          label: "Paid Vote",
          bg: "#ECFDF5",
          color: "#059669",
          border: "#A7F3D0",
          icon: DollarSign,
        };
      case "BONUS":
        return {
          label: "Bonus",
          bg: "#FFF3F5",
          color: "#E51B3E",
          border: "#F0DCE2",
          icon: Gift,
        };
      case "PENALTY":
        return {
          label: "Penalty",
          bg: "#FEF2F2",
          color: "#DC2626",
          border: "#FECACA",
          icon: ShieldAlert,
        };
      case "CORRECTION":
        return {
          label: "Correction",
          bg: "#F5F3FF",
          color: "#7C3AED",
          border: "#DDD6FE",
          icon: RefreshCw,
        };
    }
  }

  const selectedCandidateObj = candidates.find((c) => c.id === selectedCandidateId);
  const currentCandidateScore = selectedCandidateObj ? getCandidateScore(selectedCandidateObj) : 0;
  const numAmt = typeof correctionAmount === "number" ? correctionAmount : 0;
  const correctionDelta = correctionDirection === "-" ? -numAmt : numAmt;
  const projectedScore = Math.max(0, currentCandidateScore + correctionDelta);

  return (
    <AdminLayout>
      <Helmet>
        <title>Score Ledger &amp; Audit Log — Pair Up or Leave Admin</title>
      </Helmet>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "2rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#24131A", margin: 0, letterSpacing: "-0.02em" }}>
              Score Ledger &amp; Audit Log
            </h1>
            <span
              style={{
                background: "#FFE1E8",
                color: "#7A0C2E",
                fontSize: "0.6875rem",
                fontWeight: 800,
                padding: "0.2rem 0.6rem",
                borderRadius: 99,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              Immutable History
            </span>
          </div>
          <p style={{ fontSize: "0.9375rem", color: "#6B6870", margin: "0.25rem 0 0" }}>
            Permanent record of all Paid Votes, Bonus Votes, Penalties, and Score Corrections.
          </p>
        </div>

        <button
          className="btn-primary"
          onClick={() => {
            setFormError(null);
            setCorrectionModalOpen(true);
          }}
          style={{ fontSize: "0.875rem" }}
        >
          <RefreshCw size={15} />
          Record Correction
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #F0DCE2",
          borderRadius: 16,
          padding: "1rem",
          marginBottom: "1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
        className="card-shadow"
      >
        {/* Search */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 260 }}>
          <Search size={18} color="#6B6870" />
          <input
            type="text"
            placeholder="Search by candidate, reason, or admin email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              border: "none",
              outline: "none",
              width: "100%",
              fontSize: "0.875rem",
              color: "#24131A",
              background: "transparent",
            }}
          />
        </div>

        {/* Type Filter Chips */}
        <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#6B6870", display: "flex", alignItems: "center", gap: "0.25rem", marginRight: "0.25rem" }}>
            <Filter size={14} /> Type:
          </span>
          {[
            { key: "ALL", label: "All" },
            { key: "PAID_VOTE", label: "Paid Votes" },
            { key: "BONUS", label: "Bonus" },
            { key: "PENALTY", label: "Penalties" },
            { key: "CORRECTION", label: "Corrections" },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTypeFilter(t.key)}
              style={{
                padding: "0.25rem 0.625rem",
                borderRadius: 8,
                fontSize: "0.75rem",
                fontWeight: 700,
                border: `1px solid ${typeFilter === t.key ? "#7A0C2E" : "#F0DCE2"}`,
                background: typeFilter === t.key ? "#FFE1E8" : "#FFFFFF",
                color: typeFilter === t.key ? "#7A0C2E" : "#6B6870",
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ledger Table */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 68, borderRadius: 12 }} />)}
        </div>
      ) : filteredEntries.length === 0 ? (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #F0DCE2",
            borderRadius: 16,
            padding: "3rem 1rem",
            textAlign: "center",
            color: "#6B6870",
          }}
        >
          <FileText size={36} color="#F0DCE2" style={{ margin: "0 auto 0.75rem", display: "block" }} />
          <div style={{ fontSize: "1rem", fontWeight: 700, color: "#24131A" }}>No transactions found</div>
          <div style={{ fontSize: "0.875rem", marginTop: "0.25rem" }}>Try adjusting your search query or filters.</div>
        </div>
      ) : (
        <div
          style={{ background: "#ffffff", border: "1px solid #F0DCE2", borderRadius: 16, overflow: "hidden" }}
          className="card-shadow"
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
              <thead>
                <tr style={{ background: "#FFF8FA", borderBottom: "1px solid #F0DCE2" }}>
                  {["Date & Time", "Candidate", "Action Type", "Points Delta", "Score Impact", "Reason / Audit Notes", "Logged By"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "0.875rem 1rem",
                        textAlign: "left",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        color: "#6B6870",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry, i) => {
                  const badge = getTypeBadge(entry.type);
                  const isPositive = entry.quantity > 0;
                  const cand = entry.candidate;
                  const candidateName = cand?.display_name || cand?.name || "Candidate";

                  return (
                    <tr key={entry.id} style={{ borderBottom: i < filteredEntries.length - 1 ? "1px solid #FDF2F4" : "none" }}>
                      {/* Date */}
                      <td style={{ padding: "0.875rem 1rem", fontSize: "0.8125rem", color: "#6B6870", whiteSpace: "nowrap" }}>
                        {formatDate(entry.created_at)}
                      </td>

                      {/* Candidate */}
                      <td style={{ padding: "0.875rem 1rem" }}>
                        <div style={{ fontWeight: 700, color: "#24131A", fontSize: "0.875rem" }}>
                          {candidateName}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#6B6870" }}>
                          {cand?.candidate_type === "couple" ? "Couple" : "Individual"}
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td style={{ padding: "0.875rem 1rem" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            background: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`,
                            padding: "0.2rem 0.5rem",
                            borderRadius: 99,
                            fontSize: "0.6875rem",
                            fontWeight: 800,
                            textTransform: "uppercase",
                          }}
                        >
                          <badge.icon size={11} />
                          {badge.label}
                        </span>
                      </td>

                      {/* Quantity */}
                      <td style={{ padding: "0.875rem 1rem", fontWeight: 800, fontSize: "0.9375rem", color: isPositive ? "#059669" : "#DC2626" }}>
                        {isPositive ? `+${formatNumber(entry.quantity)}` : formatNumber(entry.quantity)}
                      </td>

                      {/* Score Impact */}
                      <td style={{ padding: "0.875rem 1rem", fontSize: "0.8125rem", color: "#24131A", whiteSpace: "nowrap" }}>
                        <span style={{ color: "#6B6870" }}>{formatNumber(entry.previous_score)}</span>
                        <span style={{ margin: "0 0.375rem", color: "#7A0C2E" }}>&rarr;</span>
                        <strong>{formatNumber(entry.new_score)}</strong>
                      </td>

                      {/* Reason */}
                      <td style={{ padding: "0.875rem 1rem", fontSize: "0.875rem", color: "#24131A" }}>
                        <div>{entry.reason}</div>
                        {entry.reference_id && (
                          <span style={{ fontSize: "0.6875rem", color: "#6B6870", fontFamily: "monospace" }}>
                            Ref: {entry.reference_id}
                          </span>
                        )}
                      </td>

                      {/* Admin */}
                      <td style={{ padding: "0.875rem 1rem", fontSize: "0.75rem", color: "#6B6870" }}>
                        {entry.admin_email ? (
                          <span style={{ fontWeight: 600, color: "#24131A" }}>{entry.admin_email}</span>
                        ) : (
                          <span style={{ color: "#9CA3AF", fontStyle: "italic" }}>System / Stripe</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Correction Modal */}
      {correctionModalOpen && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1200 }}
          onClick={(e) => e.target === e.currentTarget && setCorrectionModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <RefreshCw size={20} color="#7C3AED" />
                <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#24131A", margin: 0 }}>
                  Record Score Correction
                </h2>
              </div>
              <button
                onClick={() => setCorrectionModalOpen(false)}
                style={{
                  background: "#FFF8FA",
                  border: "1px solid #F0DCE2",
                  borderRadius: 8,
                  cursor: "pointer",
                  padding: "0.375rem",
                  display: "flex",
                }}
              >
                &times;
              </button>
            </div>

            <div
              style={{
                background: "#F5F3FF",
                border: "1px solid #DDD6FE",
                borderRadius: 12,
                padding: "0.75rem 1rem",
                fontSize: "0.8125rem",
                color: "#5B21B6",
                marginBottom: "1.25rem",
              }}
            >
              <strong>Immutable Audit Policy:</strong> Existing transactions cannot be edited. This form creates a new <strong>CORRECTION</strong> transaction to reverse or adjust points cleanly while preserving complete history.
            </div>

            {formError && (
              <div
                style={{
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: 10,
                  padding: "0.75rem 1rem",
                  display: "flex",
                  gap: "0.5rem",
                  marginBottom: "1rem",
                }}
              >
                <AlertCircle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: "0.875rem", color: "#DC2626" }}>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateCorrection} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Candidate Selection */}
              <div>
                <label style={{ display: "block", fontWeight: 700, fontSize: "0.8125rem", color: "#24131A", marginBottom: "0.375rem" }}>
                  Candidate *
                </label>
                <select
                  value={selectedCandidateId}
                  onChange={(e) => setSelectedCandidateId(e.target.value)}
                  className="input-field"
                  style={{ fontSize: "0.9rem", appearance: "none" }}
                  required
                >
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.display_name || c.name} — Current: {formatNumber(getCandidateScore(c))} pts
                    </option>
                  ))}
                </select>
              </div>

              {/* Correction Direction & Amount */}
              <div>
                <label style={{ display: "block", fontWeight: 700, fontSize: "0.8125rem", color: "#24131A", marginBottom: "0.375rem" }}>
                  Adjustment *
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: "0.5rem" }}>
                  <select
                    value={correctionDirection}
                    onChange={(e) => setCorrectionDirection(e.target.value as "+" | "-")}
                    className="input-field"
                    style={{ fontSize: "0.9rem", appearance: "none" }}
                  >
                    <option value="+">+ Add Points</option>
                    <option value="-">- Deduct Points</option>
                  </select>
                  <input
                    type="number"
                    min="1"
                    placeholder="Points amount"
                    value={correctionAmount}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCorrectionAmount(v === "" ? "" : parseInt(v, 10));
                    }}
                    className="input-field"
                    required
                    style={{ fontSize: "1rem", fontWeight: 700 }}
                  />
                </div>
              </div>

              {/* Projected Result */}
              {numAmt > 0 && (
                <div
                  style={{
                    background: "#FFF8FA",
                    border: "1px solid #F0DCE2",
                    borderRadius: 10,
                    padding: "0.625rem 0.875rem",
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.875rem",
                  }}
                >
                  <span style={{ color: "#6B6870" }}>Current: {formatNumber(currentCandidateScore)}</span>
                  <span style={{ fontWeight: 800, color: "#7A0C2E" }}>
                    Projected: {formatNumber(projectedScore)} pts
                  </span>
                </div>
              )}

              {/* Reason */}
              <div>
                <label style={{ display: "block", fontWeight: 700, fontSize: "0.8125rem", color: "#24131A", marginBottom: "0.375rem" }}>
                  Correction Reason *
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g., Reversing accidental bonus granted on 09/17; corrected per committee review"
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  className="input-field"
                  required
                  style={{ fontSize: "0.875rem" }}
                />
              </div>

              {/* Reference ID */}
              <div>
                <label style={{ display: "block", fontWeight: 700, fontSize: "0.8125rem", color: "#24131A", marginBottom: "0.375rem" }}>
                  Original Transaction Reference ID (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g., ledger-entry-3"
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                  className="input-field"
                  style={{ fontSize: "0.875rem", fontFamily: "monospace" }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", paddingTop: "0.5rem" }}>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setCorrectionModalOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}
                  style={{ background: "#7C3AED" }}
                >
                  {submitting ? "Recording..." : "Record Correction"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
