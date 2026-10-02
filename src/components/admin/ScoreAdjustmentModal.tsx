import { useState } from "react";
import { X, AlertCircle, AlertTriangle, Gift, ShieldAlert, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { type Candidate, type ScoreAdjustmentType, adjustCandidateScore, getCandidateScore } from "@/lib/supabase";
import { formatNumber } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

interface ScoreAdjustmentModalProps {
  type: "BONUS" | "PENALTY" | "CORRECTION";
  candidate: Candidate;
  allCandidates?: Candidate[];
  onClose: () => void;
  onSuccess: () => void;
}

export function ScoreAdjustmentModal({
  type,
  candidate: initialCandidate,
  allCandidates = [],
  onClose,
  onSuccess,
}: ScoreAdjustmentModalProps) {
  const { user } = useAuth();
  const [selectedCandidateId, setSelectedCandidateId] = useState(initialCandidate.id);
  const [quantity, setQuantity] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCandidate = allCandidates.find((c) => c.id === selectedCandidateId) || initialCandidate;
  const currentScore = getCandidateScore(activeCandidate);

  const numQty = typeof quantity === "number" ? quantity : 0;
  const isPenalty = type === "PENALTY";
  const delta = isPenalty ? -numQty : numQty;
  const rawScore = currentScore + delta;
  const newScore = Math.max(0, rawScore);
  const isCappedAtZero = isPenalty && rawScore < 0;

  const candidateDisplayName = activeCandidate.display_name || activeCandidate.name;

  async function handleConfirm() {
    if (!numQty || numQty <= 0) {
      setError("Please enter a valid positive quantity.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await adjustCandidateScore({
        candidateId: activeCandidate.id,
        type: type as ScoreAdjustmentType,
        quantity: numQty,
        reason: reason.trim() || null,
        adminEmail: user?.email || undefined,
      });

      if (!res.success) {
        throw new Error(res.error || "Failed to adjust score.");
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      setIsConfirming(false);
    } finally {
      setSubmitting(false);
    }
  }

  const bonusPresets = [10, 25, 50, 100, 250, 500];
  const penaltyPresets = [10, 25, 50, 100, 250, 500];

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 1100 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-content" style={{ maxWidth: 540 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: isPenalty ? "#FEF2F2" : "#FFF3F5",
                color: isPenalty ? "#DC2626" : "#E51B3E",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: `1px solid ${isPenalty ? "#FECACA" : "#F0DCE2"}`,
              }}
            >
              {isPenalty ? <ShieldAlert size={20} /> : <Gift size={20} />}
            </div>
            <div>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#24131A", margin: 0 }}>
                {isPenalty ? "Apply Penalty" : type === "CORRECTION" ? "Record Score Correction" : "Give Points"}
              </h2>
              <p style={{ fontSize: "0.8125rem", color: "#6B6870", margin: "0.125rem 0 0" }}>
                {isPenalty
                  ? "Deducts points from the candidate's current score without affecting paid votes or Stripe records."
                  : "Awards points to the candidate's score without requiring a Stripe payment."}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
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

        {error && (
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
            role="alert"
          >
            <AlertCircle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: "0.875rem", color: "#DC2626", fontWeight: 500 }}>{error}</span>
          </div>
        )}

        {/* Confirmation Screen */}
        {isConfirming ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div
              style={{
                background: isPenalty ? "#FFF5F5" : "#FFF8FA",
                border: `1.5px solid ${isPenalty ? "#FCA5A5" : "#F0DCE2"}`,
                borderRadius: 16,
                padding: "1.25rem",
              }}
            >
              <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#6B6870", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                Confirmation Required
              </div>
              <p style={{ fontSize: "1.0625rem", fontWeight: 700, color: "#24131A", margin: "0 0 1rem" }}>
                {isPenalty
                  ? `Apply a ${formatNumber(numQty)}-point penalty to ${candidateDisplayName}?`
                  : `Give ${formatNumber(numQty)} points to ${candidateDisplayName}?`}
              </p>

              {/* Score Transition */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto 1fr",
                  alignItems: "center",
                  gap: "0.75rem",
                  background: "#ffffff",
                  padding: "0.875rem 1rem",
                  borderRadius: 12,
                  border: "1px solid #F0DCE2",
                  marginBottom: "1rem",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#6B6870", fontWeight: 600 }}>Current Score</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#24131A" }}>
                    {formatNumber(currentScore)}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#6B6870" }}>
                  <ArrowRight size={18} />
                </div>

                <div>
                  <div style={{ fontSize: "0.75rem", color: "#6B6870", fontWeight: 600 }}>New Score</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 800, color: isPenalty ? "#DC2626" : "#16A34A" }}>
                    {formatNumber(newScore)}
                  </div>
                </div>
              </div>

              {/* Zero-floor alert if capped */}
              {isCappedAtZero && (
                <div
                  style={{
                    background: "#FEF3C7",
                    border: "1px solid #FCD34D",
                    borderRadius: 10,
                    padding: "0.75rem 1rem",
                    display: "flex",
                    gap: "0.5rem",
                    marginBottom: "1rem",
                  }}
                >
                  <AlertTriangle size={18} color="#D97706" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ fontSize: "0.8125rem", color: "#92400E", lineHeight: 1.4 }}>
                    <strong>Score Capped at Zero:</strong> The requested penalty (-{numQty}) exceeds the current score ({currentScore}). The score will become <strong>0</strong>. The full penalty will remain recorded in the immutable audit ledger.
                  </div>
                </div>
              )}

              {/* Reason summary */}
              <div style={{ fontSize: "0.8125rem", color: "#6B6870" }}>
                <strong>Reason:</strong> {reason.trim() || <span style={{ fontStyle: "italic", color: "#9CA3AF" }}>None (optional)</span>}
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn-outline"
                disabled={submitting}
                onClick={() => setIsConfirming(false)}
                style={{ fontSize: "0.9rem" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={submitting}
                style={{
                  background: isPenalty ? "#DC2626" : "#E51B3E",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: 10,
                  padding: "0.625rem 1.25rem",
                  fontSize: "0.9375rem",
                  fontWeight: 700,
                  cursor: submitting ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                    Applying...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    {isPenalty ? "Confirm Penalty" : "Confirm Points"}
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Form Input Screen */
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!numQty || numQty <= 0) {
                setError("Please enter a valid positive quantity.");
                return;
              }
              setError(null);
              setIsConfirming(true);
            }}
            style={{ display: "flex", flexDirection: "column", gap: "1.125rem" }}
          >
            {/* Candidate Selector */}
            <div>
              <label style={{ display: "block", fontWeight: 700, fontSize: "0.8125rem", color: "#24131A", marginBottom: "0.375rem" }}>
                Candidate
              </label>
              {allCandidates.length > 1 ? (
                <select
                  value={selectedCandidateId}
                  onChange={(e) => setSelectedCandidateId(e.target.value)}
                  className="input-field"
                  style={{ appearance: "none", fontSize: "0.9rem" }}
                >
                  {allCandidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.display_name || c.name} ({c.candidate_type === "couple" ? "Couple" : "Individual"}) — Current: {formatNumber(getCandidateScore(c))} pts
                    </option>
                  ))}
                </select>
              ) : (
                <div
                  style={{
                    padding: "0.625rem 0.875rem",
                    background: "#FFF8FA",
                    border: "1px solid #F0DCE2",
                    borderRadius: 10,
                    fontWeight: 700,
                    color: "#24131A",
                    fontSize: "0.9375rem",
                  }}
                >
                  {candidateDisplayName}
                </div>
              )}
            </div>

            {/* Current Score Info Box */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#FFF8FA",
                border: "1px solid #F0DCE2",
                borderRadius: 12,
                padding: "0.75rem 1rem",
              }}
            >
              <div>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#6B6870", textTransform: "uppercase" }}>
                  Current Score
                </span>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#7A0C2E" }}>
                  {formatNumber(currentScore)} Points
                </div>
              </div>

              <div style={{ textAlign: "right", fontSize: "0.75rem", color: "#6B6870" }}>
                <div>Paid: <strong>{formatNumber(activeCandidate.paid_votes ?? activeCandidate.total_votes ?? 0)}</strong></div>
                <div>Bonus: <strong>+{formatNumber(activeCandidate.bonus_votes ?? 0)}</strong> | Penalty: <strong>-{formatNumber(activeCandidate.penalty_points ?? 0)}</strong></div>
              </div>
            </div>

            {/* Quantity Input */}
            <div>
              <label htmlFor="adjust-qty" style={{ display: "block", fontWeight: 700, fontSize: "0.8125rem", color: "#24131A", marginBottom: "0.375rem" }}>
                {isPenalty ? "Penalty Points to Deduct" : "Points to Give"} *
              </label>
              <input
                id="adjust-qty"
                type="number"
                min="1"
                step="1"
                placeholder={isPenalty ? "e.g. 50" : "e.g. 100"}
                value={quantity}
                onChange={(e) => {
                  const v = e.target.value;
                  setQuantity(v === "" ? "" : parseInt(v, 10));
                }}
                className="input-field"
                required
                style={{ fontSize: "1rem", fontWeight: 700 }}
              />

              {/* Presets */}
              <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                {(isPenalty ? penaltyPresets : bonusPresets).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setQuantity(p)}
                    style={{
                      padding: "0.25rem 0.625rem",
                      borderRadius: 6,
                      border: `1px solid ${numQty === p ? (isPenalty ? "#DC2626" : "#E51B3E") : "#F0DCE2"}`,
                      background: numQty === p ? (isPenalty ? "#FEF2F2" : "#FFF3F5") : "#FFFFFF",
                      color: numQty === p ? (isPenalty ? "#DC2626" : "#E51B3E") : "#6B6870",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {isPenalty ? `-${p}` : `+${p}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Projected Score Preview */}
            {numQty > 0 && (
              <div
                style={{
                  background: isPenalty ? "#FEF2F2" : "#F0FDF4",
                  border: `1px solid ${isPenalty ? "#FECACA" : "#BBF7D0"}`,
                  borderRadius: 10,
                  padding: "0.625rem 0.875rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "0.875rem",
                }}
              >
                <span style={{ color: isPenalty ? "#991B1B" : "#166534", fontWeight: 600 }}>
                  Projected New Score:
                </span>
                <span style={{ fontWeight: 800, fontSize: "1rem", color: isPenalty ? "#DC2626" : "#16A34A" }}>
                  {formatNumber(newScore)} {isCappedAtZero ? "(Capped at 0)" : ""}
                </span>
              </div>
            )}

            {/* Reason Input (Optional) */}
            <div>
              <label htmlFor="adjust-reason" style={{ display: "block", fontWeight: 700, fontSize: "0.8125rem", color: "#24131A", marginBottom: "0.375rem" }}>
                Reason <span style={{ fontWeight: 500, color: "#6B6870" }}>(Optional)</span>
              </label>
              <textarea
                id="adjust-reason"
                rows={2}
                placeholder={
                  isPenalty
                    ? "Optional note or reason (e.g. Contest rule violation)"
                    : "Optional note or reason (e.g. Weekly Community Spotlight Winner)"
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="input-field"
                style={{ fontSize: "0.875rem", resize: "vertical" }}
              />
              <span style={{ fontSize: "0.75rem", color: "#6B6870" }}>
                Optional: If provided, this note will be recorded in the audit ledger.
              </span>
            </div>

            {/* Footer Buttons */}
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", paddingTop: "0.5rem" }}>
              <button type="button" className="btn-outline" onClick={onClose} style={{ fontSize: "0.9rem" }}>
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  background: isPenalty ? "#DC2626" : "#E51B3E",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: 10,
                  padding: "0.625rem 1.25rem",
                  fontSize: "0.9375rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Continue to Review
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
