import { useEffect, useState } from "react";
import { X, History, PlusCircle, MinusCircle, DollarSign, Gift, AlertOctagon, RefreshCw } from "lucide-react";
import { type Candidate, type ScoreLedgerEntry, fetchCandidateLedgerSafe, getCandidateScore } from "@/lib/supabase";
import { formatNumber, formatDate } from "@/lib/utils";

interface CandidateScoreHistoryModalProps {
  candidate: Candidate;
  onClose: () => void;
  onGiveBonus: () => void;
  onApplyPenalty: () => void;
}

export function CandidateScoreHistoryModal({
  candidate,
  onClose,
  onGiveBonus,
  onApplyPenalty,
}: CandidateScoreHistoryModalProps) {
  const [ledger, setLedger] = useState<ScoreLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const currentScore = getCandidateScore(candidate);
  const paidVotes = candidate.paid_votes ?? candidate.total_votes ?? 0;
  const bonusVotes = candidate.bonus_votes ?? 0;
  const penaltyPoints = candidate.penalty_points ?? 0;

  useEffect(() => {
    async function load() {
      setLoading(true);
      const data = await fetchCandidateLedgerSafe(candidate.id);
      setLedger(data);
      setLoading(false);
    }
    void load();
  }, [candidate.id]);

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
          label: "Bonus Votes",
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
          icon: AlertOctagon,
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

  const candidateDisplayName = candidate.display_name || candidate.name;

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 1100 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-content" style={{ maxWidth: 680, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "linear-gradient(135deg, #7A0C2E, #E51B3E)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FFFFFF",
                fontWeight: 800,
              }}
            >
              <History size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#24131A", margin: 0 }}>
                Score Overview &amp; History
              </h2>
              <div style={{ fontSize: "0.875rem", color: "#6B6870", fontWeight: 600 }}>
                {candidateDisplayName} ({candidate.candidate_type === "couple" ? "Couple Candidate" : "Individual Candidate"})
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "#FFF8FA",
              border: "1px solid #F0DCE2",
              borderRadius: 8,
              cursor: "pointer",
              padding: "0.375rem",
              display: "flex",
            }}
          >
            <X size={18} color="#6B6870" />
          </button>
        </div>

        {/* Overview Formula Card */}
        <div
          style={{
            background: "linear-gradient(135deg, #FFF8FA 0%, #FFF3F5 100%)",
            border: "1.5px solid #F0DCE2",
            borderRadius: 16,
            padding: "1.25rem",
            marginBottom: "1.5rem",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
            {/* Current Score */}
            <div style={{ background: "#ffffff", padding: "0.75rem", borderRadius: 12, border: "1px solid #F0DCE2" }}>
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#7A0C2E", textTransform: "uppercase" }}>
                Current Score
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "#E51B3E", lineHeight: 1.2 }}>
                {formatNumber(currentScore)}
              </div>
            </div>

            {/* Paid Votes */}
            <div style={{ background: "#ffffff", padding: "0.75rem", borderRadius: 12, border: "1px solid #F0DCE2" }}>
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#6B6870", textTransform: "uppercase" }}>
                Paid Votes
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#24131A", lineHeight: 1.2 }}>
                {formatNumber(paidVotes)}
              </div>
            </div>

            {/* Bonus Votes */}
            <div style={{ background: "#ffffff", padding: "0.75rem", borderRadius: 12, border: "1px solid #F0DCE2" }}>
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#059669", textTransform: "uppercase" }}>
                Bonus Votes
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#059669", lineHeight: 1.2 }}>
                +{formatNumber(bonusVotes)}
              </div>
            </div>

            {/* Penalty Points */}
            <div style={{ background: "#ffffff", padding: "0.75rem", borderRadius: 12, border: "1px solid #F0DCE2" }}>
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#DC2626", textTransform: "uppercase" }}>
                Penalty Points
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#DC2626", lineHeight: 1.2 }}>
                -{formatNumber(penaltyPoints)}
              </div>
            </div>
          </div>

          {/* Mathematical Formula Display */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.5rem",
              background: "#ffffff",
              padding: "0.625rem 1rem",
              borderRadius: 10,
              fontSize: "0.8125rem",
              fontWeight: 700,
              color: "#24131A",
              border: "1px solid #F0DCE2",
            }}
          >
            <span>
              Formula: {formatNumber(paidVotes)} (Paid) + {formatNumber(bonusVotes)} (Bonus) - {formatNumber(penaltyPoints)} (Penalty) = <span style={{ color: "#E51B3E" }}>{formatNumber(currentScore)} Points</span>
            </span>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={onGiveBonus}
                style={{
                  background: "#FFE1E8",
                  color: "#7A0C2E",
                  border: "1px solid #F0DCE2",
                  padding: "0.3rem 0.625rem",
                  borderRadius: 8,
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                }}
              >
                <PlusCircle size={14} />
                Give Bonus
              </button>

              <button
                type="button"
                onClick={onApplyPenalty}
                style={{
                  background: "#FEF2F2",
                  color: "#DC2626",
                  border: "1px solid #FECACA",
                  padding: "0.3rem 0.625rem",
                  borderRadius: 8,
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                }}
              >
                <MinusCircle size={14} />
                Apply Penalty
              </button>
            </div>
          </div>
        </div>

        {/* Ledger Transaction History */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ fontSize: "0.8125rem", fontWeight: 800, color: "#24131A", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Immutable Transaction Ledger ({ledger.length})
          </div>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 12 }} />)}
            </div>
          ) : ledger.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem 1rem", color: "#6B6870", fontSize: "0.875rem" }}>
              No score adjustments recorded yet for this candidate.
            </div>
          ) : (
            ledger.map((entry) => {
              const badge = getTypeBadge(entry.type);
              const Icon = badge.icon;
              const isPositive = entry.quantity > 0;

              return (
                <div
                  key={entry.id}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #F0DCE2",
                    borderRadius: 12,
                    padding: "0.875rem 1rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "1rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        background: badge.bg,
                        color: badge.color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        border: `1px solid ${badge.border}`,
                      }}
                    >
                      <Icon size={16} />
                    </div>

                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                        <span
                          style={{
                            background: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`,
                            fontSize: "0.6875rem",
                            fontWeight: 800,
                            padding: "0.15rem 0.5rem",
                            borderRadius: 99,
                            textTransform: "uppercase",
                          }}
                        >
                          {badge.label}
                        </span>

                        <span style={{ fontSize: "0.75rem", color: "#6B6870" }}>
                          {formatDate(entry.created_at)}
                        </span>
                      </div>

                      <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#24131A" }}>
                        {entry.reason}
                      </div>

                      {entry.admin_email && (
                        <div style={{ fontSize: "0.6875rem", color: "#6B6870", marginTop: "0.125rem" }}>
                          Admin: {entry.admin_email}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div
                      style={{
                        fontSize: "1.125rem",
                        fontWeight: 900,
                        color: isPositive ? "#059669" : "#DC2626",
                      }}
                    >
                      {isPositive ? `+${formatNumber(entry.quantity)}` : formatNumber(entry.quantity)}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#6B6870", fontWeight: 500 }}>
                      Score: {formatNumber(entry.previous_score)} &rarr; {formatNumber(entry.new_score)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid #F0DCE2", paddingTop: "1rem", marginTop: "1rem", display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="btn-outline" onClick={onClose} style={{ fontSize: "0.9rem" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
