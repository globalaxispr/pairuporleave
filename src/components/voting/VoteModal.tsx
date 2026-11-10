import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { X, Minus, Plus, Vote, Loader2, AlertCircle, Lock, Users, User } from "lucide-react";
import {
  getVotePriceDollars,
  calculateVotePricingCents,
  getSingleVoteAllInPriceFormatted,
  IS_PLATFORM_SERVICE_FEE_ENABLED,
  PRICING_VERSION,
  type PublicCandidate,
  getCandidateScore,
  supabaseUrl,
  supabaseAnonKey,
} from "@/lib/supabase";
import { formatNumber, formatCurrency } from "@/lib/utils";
import { useCompetitionSchedule } from "@/hooks/useCompetitionSchedule";

interface VoteModalProps {
  candidate: PublicCandidate;
  onClose: () => void;
}

const QUICK_AMOUNTS = [1, 5, 10, 25, 50, 100];

export function VoteModal({ candidate, onClose }: VoteModalProps) {
  const [quantity, setQuantity] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policyAccepted, setPolicyAccepted] = useState(true);
  const { isVotingClosed } = useCompetitionSchedule();

  const isCouple = candidate.candidate_type === "couple";
  const unitPrice = getVotePriceDollars(candidate.candidate_type);
  const pricing = calculateVotePricingCents(candidate.candidate_type, quantity);
  const singleVoteAllIn = getSingleVoteAllInPriceFormatted(candidate.candidate_type);

  const candidateDisplayName = candidate.display_name || candidate.name;
  const modalRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (document.activeElement instanceof HTMLElement) {
      previousFocusRef.current = document.activeElement;
    }

    const firstBtn = modalRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    firstBtn?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, []);

  const handleQuantityChange = useCallback((val: number) => {
    const clamped = Math.max(1, Math.min(1000, Math.floor(val)));
    setQuantity(isNaN(clamped) ? 1 : clamped);
  }, []);

  const handleCheckout = useCallback(async () => {
    if (loading) return;
    if (isVotingClosed) {
      setError("Voting has closed for this competition round. The deadline has passed.");
      return;
    }
    if (!policyAccepted) {
      setError("Please accept the Voting Policy before continuing to payment.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const resp = await fetch(
        `${supabaseUrl}/functions/v1/create-checkout-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            candidate_id: candidate.id,
            vote_quantity: quantity,
            pricing_version: PRICING_VERSION,
            client_total_cents: pricing.totalAmountCents,
          }),
        }
      );

      const data = (await resp.json()) as { url?: string; error?: string; message?: string };

      if (!resp.ok || !data.url) {
        throw new Error(data.error || data.message || "Failed to create checkout session");
      }

      window.location.href = data.url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(msg);
      setLoading(false);
    }
  }, [loading, isVotingClosed, policyAccepted, quantity, candidate.id, pricing.totalAmountCents]);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vote-modal-title"
      style={{
        padding: "0.75rem",
        alignItems: "flex-end",
      }}
    >
      <div
        ref={modalRef}
        className="modal-content"
        style={{
          borderRadius: "24px 24px 20px 20px",
          padding: "1.5rem 1.25rem 2rem",
          maxWidth: 480,
          margin: "0 auto",
          width: "100%",
          background: "#FFFFFF",
          border: "1px solid #F0DCE2",
          boxShadow: "0 20px 60px rgba(74, 6, 28, 0.22)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "1.25rem",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.5rem" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  background: isCouple ? "#FFE1E8" : "#FFF3F5",
                  border: "1px solid #F0DCE2",
                  padding: "0.2rem 0.6rem",
                  borderRadius: 99,
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  color: isCouple ? "#7A0C2E" : "#6B6870",
                  textTransform: "uppercase",
                }}
              >
                {isCouple ? <Users size={12} /> : <User size={12} />}
                {isCouple ? "Couple" : "Individual"}
              </span>

              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  background: "#FFF8FA",
                  border: "1px solid #F0DCE2",
                  padding: "0.2rem 0.6rem",
                  borderRadius: 99,
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  color: "#7A0C2E",
                }}
              >
                {IS_PLATFORM_SERVICE_FEE_ENABLED
                  ? `$${unitPrice}.00/vote base (${singleVoteAllIn} w/ fee for 1)`
                  : `$${unitPrice} per vote`}
              </span>
            </div>

            <h2
              id="vote-modal-title"
              style={{
                fontSize: "1.25rem",
                fontWeight: 800,
                color: "#24131A",
                margin: 0,
                lineHeight: 1.25,
              }}
            >
              Vote for {candidateDisplayName}
            </h2>
            <p style={{ fontSize: "0.8125rem", color: "#6B6870", margin: "0.25rem 0 0" }}>
              {candidate.position} · {candidate.category}
            </p>
          </div>

          <button
            onClick={onClose}
            aria-label="Close voting modal"
            style={{
              background: "#FFF3F5",
              border: "1px solid #F0DCE2",
              borderRadius: 10,
              cursor: "pointer",
              padding: "0.5rem",
              color: "#7A0C2E",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 44,
              minHeight: 44,
              flexShrink: 0,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Current votes banner */}
        <div
          style={{
            background: "#FFF8FA",
            border: "1px solid #F0DCE2",
            borderRadius: 12,
            padding: "0.625rem 0.875rem",
            marginBottom: "1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: "0.8125rem", color: "#6B6870", fontWeight: 600 }}>
            Current Standing:
          </span>
          <span style={{ fontSize: "0.9375rem", fontWeight: 800, color: "#7A0C2E" }}>
            {formatNumber(getCandidateScore(candidate))} votes
          </span>
        </div>

        {/* Quantity selector */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label
            htmlFor="vote-quantity"
            style={{
              display: "block",
              fontWeight: 700,
              color: "#24131A",
              marginBottom: "0.625rem",
              fontSize: "0.9375rem",
            }}
          >
            How many votes?
          </label>

          {/* Quick Amounts Pills with Upfront All-In Totals (3x2 on narrow mobile, 6-col on sm+) */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-4">
            {QUICK_AMOUNTS.map((amt) => {
              const isSelected = quantity === amt;
              const amtPricing = calculateVotePricingCents(candidate.candidate_type, amt);
              return (
                <button
                  key={amt}
                  onClick={() => handleQuantityChange(amt)}
                  style={{
                    padding: "0.375rem 0.125rem",
                    borderRadius: 10,
                    border: `1.5px solid ${isSelected ? "#E51B3E" : "#F0DCE2"}`,
                    background: isSelected ? "#FFE1E8" : "#FFF8FA",
                    color: isSelected ? "#7A0C2E" : "#24131A",
                    fontWeight: 800,
                    fontSize: "0.8125rem",
                    cursor: "pointer",
                    minHeight: 48,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    lineHeight: 1.15,
                    transition: "all 0.15s ease",
                  }}
                  aria-pressed={isSelected}
                >
                  <span>+{amt}</span>
                  <span style={{ fontSize: "0.625rem", fontWeight: 700, color: "#6B6870", marginTop: "0.125rem" }}>
                    {formatCurrency(amtPricing.totalAmountCents)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Manual Input with Large [-] [+] Buttons */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              justifyContent: "center",
            }}
          >
            <button
              onClick={() => handleQuantityChange(quantity - 1)}
              disabled={quantity <= 1}
              aria-label="Decrease vote quantity"
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                border: "1.5px solid #F0DCE2",
                background: "#FFF8FA",
                color: "#24131A",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: quantity <= 1 ? "not-allowed" : "pointer",
                opacity: quantity <= 1 ? 0.4 : 1,
              }}
            >
              <Minus size={20} />
            </button>

            <input
              type="number"
              id="vote-quantity"
              value={quantity}
              onChange={(e) => handleQuantityChange(parseInt(e.target.value, 10))}
              min={1}
              max={1000}
              style={{
                flex: 1,
                maxWidth: 140,
                height: 48,
                textAlign: "center",
                fontSize: "1.375rem",
                fontWeight: 800,
                border: "2px solid #E51B3E",
                borderRadius: 12,
                color: "#24131A",
                outline: "none",
                background: "#FFFFFF",
              }}
              aria-label="Vote quantity"
            />

            <button
              onClick={() => handleQuantityChange(quantity + 1)}
              aria-label="Increase vote quantity"
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                border: "1.5px solid #F0DCE2",
                background: "#FFF8FA",
                color: "#24131A",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {/* Itemized All-In Price Summary Box */}
        <div
          style={{
            background: "linear-gradient(135deg, #FFF8FA 0%, #FFE1E8 100%)",
            border: "1.5px solid #F0DCE2",
            borderRadius: 16,
            padding: "1rem 1.25rem",
            marginBottom: "1.25rem",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", marginBottom: "0.625rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#24131A", fontSize: "0.875rem", fontWeight: 700 }}>
                Base Vote Subtotal ({formatNumber(quantity)} Vote{quantity !== 1 ? "s" : ""} × ${unitPrice}.00)
              </span>
              <span style={{ color: "#24131A", fontSize: "0.875rem", fontWeight: 800 }}>
                {formatCurrency(pricing.subtotalCents)}
              </span>
            </div>

            {pricing.serviceFeeCents > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#6B6870", fontSize: "0.8125rem", fontWeight: 600 }}>
                  Platform Service Fee (mandatory · adds 0 votes)
                </span>
                <span style={{ color: "#24131A", fontSize: "0.8125rem", fontWeight: 700 }}>
                  {formatCurrency(pricing.serviceFeeCents)}
                </span>
              </div>
            )}

            {pricing.taxCents > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#6B6870", fontSize: "0.8125rem", fontWeight: 600 }}>
                  Applicable Tax
                </span>
                <span style={{ color: "#24131A", fontSize: "0.8125rem", fontWeight: 700 }}>
                  {formatCurrency(pricing.taxCents)}
                </span>
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: "0.5rem",
              marginBottom: "0.5rem",
              borderTop: "1px solid rgba(240, 220, 226, 0.8)",
            }}
          >
            <div>
              <span style={{ fontSize: "0.8125rem", color: "#24131A", display: "block", fontWeight: 800 }}>
                TOTAL DUE
              </span>
              <span style={{ fontSize: "0.75rem", color: "#7A0C2E", fontWeight: 700, display: "block", marginTop: "0.125rem" }}>
                The {isCouple ? "couple" : "candidate"} receives {formatNumber(quantity)} vote{quantity !== 1 ? "s" : ""}.
              </span>
            </div>
            <span
              style={{
                fontWeight: 900,
                fontSize: "1.625rem",
                color: "#7A0C2E",
                lineHeight: 1,
              }}
            >
              {formatCurrency(pricing.totalAmountCents)}
            </span>
          </div>

          <div
            style={{
              fontSize: "0.71875rem",
              color: "#7A0C2E",
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              fontWeight: 600,
              paddingTop: "0.375rem",
              borderTop: "1px solid rgba(240, 220, 226, 0.6)",
            }}
          >
            <Lock size={12} color="#E51B3E" style={{ flexShrink: 0 }} />
            <span>
              {IS_PLATFORM_SERVICE_FEE_ENABLED
                ? "Stripe 256-bit encrypted · Service fee is not a government tax"
                : "Stripe 256-bit encrypted · No account required"}
            </span>
          </div>
        </div>

        {/* Voting Closed Notification */}
        {isVotingClosed && (
          <div
            style={{
              background: "#FFF3F5",
              border: "1.5px solid #F0DCE2",
              borderRadius: 14,
              padding: "0.875rem 1rem",
              marginBottom: "1rem",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
            }}
            role="alert"
          >
            <AlertCircle size={20} color="#E51B3E" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: "0.875rem", color: "#7A0C2E", fontWeight: 700 }}>
              Voting has officially closed for this competition. No new votes can be submitted.
            </div>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div
            style={{
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: 12,
              padding: "0.75rem 1rem",
              marginBottom: "1rem",
              display: "flex",
              alignItems: "flex-start",
              gap: "0.5rem",
            }}
            role="alert"
          >
            <AlertCircle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: "0.8125rem", color: "#DC2626" }}>{error}</span>
          </div>
        )}

        {/* Official Voting Policy Notice & Acceptance Checkbox */}
        <div
          style={{
            background: "#FFF8FA",
            border: "1px solid #F0DCE2",
            borderRadius: 12,
            padding: "0.75rem 0.875rem",
            marginBottom: "1rem",
          }}
        >
          <label
            htmlFor="voting-policy-agree"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.625rem",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              id="voting-policy-agree"
              checked={policyAccepted}
              onChange={(e) => setPolicyAccepted(e.target.checked)}
              style={{
                marginTop: 2,
                width: 16,
                height: 16,
                accentColor: "#E51B3E",
                cursor: "pointer",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: "0.75rem",
                lineHeight: 1.45,
                color: "#6B6870",
              }}
            >
              All votes are final once payment is completed and votes are credited. Completed voting purchases are generally non-refundable, except where required by law or applicable payment rules. By continuing, you agree to our{" "}
              <Link
                to="/voting-policy"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "#7A0C2E",
                  fontWeight: 800,
                  textDecoration: "underline",
                }}
              >
                Voting Policy
              </Link>
              .
            </span>
          </label>
        </div>

        {/* Pay CTA */}
        <button
          onClick={handleCheckout}
          disabled={loading || quantity < 1 || isVotingClosed || !policyAccepted}
          className="btn-vote"
          style={{
            width: "100%",
            justifyContent: "center",
            minHeight: 52,
            fontSize: "1rem",
            fontWeight: 800,
            letterSpacing: "0.02em",
            opacity: loading || quantity < 1 || isVotingClosed || !policyAccepted ? 0.5 : 1,
            cursor: loading || quantity < 1 || isVotingClosed || !policyAccepted ? "not-allowed" : "pointer",
            filter: isVotingClosed ? "grayscale(1)" : "none",
          }}
          aria-label={
            isVotingClosed
              ? "Voting is closed"
              : `Continue to payment of ${formatCurrency(pricing.totalAmountCents)}`
          }
          id="checkout-btn"
        >
          {loading ? (
            <>
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
              Connecting to Stripe...
            </>
          ) : isVotingClosed ? (
            <>
              <Vote size={18} />
              VOTING CLOSED
            </>
          ) : (
            <>
              <Vote size={18} />
              CONTINUE TO PAYMENT · {formatCurrency(pricing.totalAmountCents)}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
