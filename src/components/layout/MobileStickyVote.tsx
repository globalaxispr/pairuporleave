import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Vote, Heart, X, Trophy } from "lucide-react";
import { IS_PLATFORM_SERVICE_FEE_ENABLED } from "@/lib/supabase";
import { useCompetitionSchedule } from "@/hooks/useCompetitionSchedule";

export function MobileStickyVote() {
  const location = useLocation();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const { isVotingClosed } = useCompetitionSchedule();

  // Do not show on admin routes, checkout result pages, or if dismissed
  const isHidden =
    dismissed ||
    location.pathname.startsWith("/admin") ||
    location.pathname === "/vote/success" ||
    location.pathname === "/vote/cancel" ||
    location.pathname === "/vote-success" ||
    location.pathname === "/vote-cancel";

  if (isHidden) return null;

  const handleClick = () => {
    if (isVotingClosed) {
      navigate("/ranking");
      return;
    }
    if (location.pathname === "/") {
      const el = document.getElementById("live-ranking");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }
    navigate("/candidates");
  };

  return (
    <div
      className="md:hidden"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 35,
        background: "rgba(255, 255, 255, 0.98)",
        backdropFilter: "blur(12px)",
        borderTop: "1px solid #F0DCE2",
        boxShadow: "0 -4px 16px rgba(74, 6, 28, 0.08)",
        padding: "0.5rem 1rem",
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
      aria-label="Mobile sticky vote action"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          maxWidth: 480,
          margin: "0 auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            onClick={() => setDismissed(true)}
            style={{
              background: "#FFF3F5",
              border: "1px solid #F0DCE2",
              borderRadius: 8,
              padding: "0.375rem",
              minWidth: 36,
              minHeight: 36,
              cursor: "pointer",
              color: "#7A0C2E",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
            aria-label="Dismiss sticky vote prompt"
          >
            <X size={16} />
          </button>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <Heart size={13} color="#E51B3E" fill="#E51B3E" />
              <span style={{ fontSize: "0.8125rem", fontWeight: 800, color: "#24131A" }}>
                {isVotingClosed
                  ? "Voting Period Concluded"
                  : IS_PLATFORM_SERVICE_FEE_ENABLED
                  ? "1 Vote: $1 ($1.80 w/ fee) · Couples: $2 ($2.80 w/ fee)"
                  : "1 Vote = $1 · Couples = $2"}
              </span>
            </div>
            <span style={{ fontSize: "0.6875rem", color: "#6B6870" }}>
              {isVotingClosed ? "Check final standings" : "Live real-time voting"}
            </span>
          </div>
        </div>

        <button
          className="btn-vote"
          onClick={handleClick}
          style={{
            padding: "0.5rem 1.125rem",
            fontSize: "0.875rem",
            fontWeight: 800,
            minHeight: 44,
            background: isVotingClosed ? "#4A061C" : undefined,
          }}
          aria-label={isVotingClosed ? "View rankings" : "Vote now"}
        >
          {isVotingClosed ? (
            <>
              <Trophy size={15} />
              RANKING
            </>
          ) : (
            <>
              <Vote size={15} />
              VOTE NOW
            </>
          )}
        </button>
      </div>
    </div>
  );
}
