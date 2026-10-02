import { useState, useCallback, useEffect } from "react";
import { X, Minus, Plus, Vote, Loader2, AlertCircle, Lock, Users, User } from "lucide-react";
import { getVotePriceDollars, type PublicCandidate, getCandidateScore } from "@/lib/supabase";
import { formatNumber } from "@/lib/utils";

interface VoteModalProps {
  candidate: PublicCandidate;
  onClose: () => void;
}

const QUICK_AMOUNTS = [1, 5, 10, 25, 50, 100];

export function VoteModal({ candidate, onClose }: VoteModalProps) {
  const [quantity, setQuantity] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

  const isCouple = candidate.candidate_type === "couple";
  const unitPrice = getVotePriceDollars(candidate.candidate_type);
  const totalPrice = quantity * unitPrice;

  const candidateDisplayName = candidate.display_name || candidate.name;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleQuantityChange = useCallback((val: number) => {
    const clamped = Math.max(1, Math.min(99999, Math.floor(val)));
    setQuantity(isNaN(clamped) ? 1 : clamped);
  }, []);

  const handleCheckout = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const resp = await fetch(
        `${supabaseUrl}/functions/v1/create-checkout-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            candidate_id: candidate.id,
            vote_quantity: quantity,
          }),
        }
      );

      const data = (await resp.json()) as { url?: string; error?: string };

      if (!resp.ok || !data.url) {
        throw new Error(data.error ?? "Failed to create checkout session");
      }

      window.location.href = data.url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(msg);
      setLoading(false);
    }
  }, [loading, quantity, candidate.id, supabaseUrl]);

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
                ${unitPrice} per vote
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
              minWidth: 40,
              minHeight: 40,
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

          {/* Quick Amounts Pills */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: "0.375rem",
              marginBottom: "1rem",
            }}
          >
            {QUICK_AMOUNTS.map((amt) => {
              const isSelected = quantity === amt;
              return (
                <button
                  key={amt}
                  onClick={() => handleQuantityChange(amt)}
                  style={{
                    padding: "0.5rem 0",
                    borderRadius: 10,
                    border: `1.5px solid ${isSelected ? "#E51B3E" : "#F0DCE2"}`,
                    background: isSelected ? "#FFE1E8" : "#FFF8FA",
                    color: isSelected ? "#7A0C2E" : "#24131A",
                    fontWeight: 800,
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    minHeight: 44,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.15s ease",
                  }}
                  aria-pressed={isSelected}
                >
                  +{amt}
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

        {/* Total Price Summary Box */}
        <div
          style={{
            background: "linear-gradient(135deg, #FFF8FA 0%, #FFE1E8 100%)",
            border: "1.5px solid #F0DCE2",
            borderRadius: 16,
            padding: "1.125rem 1.25rem",
            marginBottom: "1.25rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.5rem",
            }}
          >
            <div>
              <span style={{ color: "#24131A", fontSize: "0.9375rem", fontWeight: 800, display: "block" }}>
                {formatNumber(quantity)} Vote{quantity !== 1 ? "s" : ""} × ${unitPrice}
              </span>
              <span style={{ fontSize: "0.8125rem", color: "#7A0C2E", fontWeight: 700, display: "block", marginTop: "0.125rem" }}>
                The {isCouple ? "couple" : "candidate"} receives exactly {formatNumber(quantity)} vote{quantity !== 1 ? "s" : ""}.
              </span>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: "0.75rem", color: "#6B6870", display: "block", fontWeight: 700 }}>
                TOTAL
              </span>
              <span
                style={{
                  fontWeight: 900,
                  fontSize: "1.625rem",
                  color: "#7A0C2E",
                  lineHeight: 1,
                }}
              >
                ${formatNumber(totalPrice)}.00
              </span>
            </div>
          </div>

          <div
            style={{
              fontSize: "0.75rem",
              color: "#7A0C2E",
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              fontWeight: 600,
              paddingTop: "0.375rem",
              borderTop: "1px solid rgba(240, 220, 226, 0.6)",
            }}
          >
            <Lock size={12} color="#E51B3E" />
            Stripe 256-bit encrypted · No account required
          </div>
        </div>

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

        {/* Pay CTA */}
        <button
          onClick={handleCheckout}
          disabled={loading || quantity < 1}
          className="btn-vote"
          style={{
            width: "100%",
            justifyContent: "center",
            minHeight: 52,
            fontSize: "1rem",
            fontWeight: 800,
            letterSpacing: "0.02em",
            cursor: loading ? "not-allowed" : "pointer",
          }}
          aria-label={`Continue to payment of $${totalPrice}`}
          id="checkout-btn"
        >
          {loading ? (
            <>
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
              Connecting to Stripe...
            </>
          ) : (
            <>
              <Vote size={18} />
              CONTINUE TO PAYMENT · ${formatNumber(totalPrice)}.00
            </>
          )}
        </button>
      </div>
    </div>
  );
}
