import { useNavigate } from "react-router-dom";
import { Vote, ArrowRight, Heart } from "lucide-react";

export function FinalCTASection() {
  const navigate = useNavigate();

  return (
    <section
      style={{
        background: "linear-gradient(135deg, #4A061C 0%, #7A0C2E 100%)",
        padding: "3.5rem 1rem",
        position: "relative",
        overflow: "hidden",
      }}
      aria-label="Call to action"
    >
      {/* Decorative */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "-100px",
          right: "-100px",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "rgba(229, 27, 62, 0.12)",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: "-80px",
          left: "-80px",
          width: 320,
          height: 320,
          borderRadius: "50%",
          background: "rgba(255, 255, 255, 0.04)",
          pointerEvents: "none",
        }}
      />

      <div
        className="container-max"
        style={{ textAlign: "center", position: "relative", zIndex: 1 }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "rgba(255, 225, 232, 0.15)",
            border: "1px solid rgba(255, 225, 232, 0.3)",
            borderRadius: 9999,
            padding: "0.375rem 1rem",
            marginBottom: "1.5rem",
          }}
        >
          <Heart size={14} color="#FF5475" fill="#FF5475" />
          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#FFE1E8" }}>
            Voting is Open Now
          </span>
        </div>

        <h2
          style={{
            fontSize: "clamp(2rem, 5vw, 3.25rem)",
            fontWeight: 900,
            color: "#ffffff",
            margin: "0 0 1rem",
            letterSpacing: "-0.03em",
          }}
        >
          Ready to Make Your Choice?
        </h2>

        <p
          style={{
            fontSize: "clamp(1rem, 2vw, 1.1875rem)",
            color: "rgba(255,255,255,0.85)",
            maxWidth: 520,
            margin: "0 auto 2.25rem",
            lineHeight: 1.7,
          }}
        >
          Explore the candidates, find who you want to support, and cast your vote.
        </p>

        <div
          style={{
            display: "flex",
            gap: "1rem",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            className="btn-vote"
            onClick={() => navigate("/candidates")}
            style={{ fontSize: "1.0625rem", padding: "0.875rem 2rem", minHeight: 48 }}
            aria-label="Explore candidates and vote"
          >
            <Vote size={18} />
            EXPLORE CANDIDATES
          </button>
          <button
            onClick={() => navigate("/ranking")}
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "2px solid rgba(255,255,255,0.3)",
              borderRadius: 12,
              padding: "0.875rem 2rem",
              fontSize: "1.0625rem",
              color: "#ffffff",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              transition: "all 0.2s ease",
              minHeight: 48,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.2)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)";
            }}
            aria-label="View live ranking"
          >
            VIEW LIVE RANKING
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
