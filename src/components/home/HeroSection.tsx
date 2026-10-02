import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trophy, Vote, ArrowRight, ShieldCheck, Heart } from "lucide-react";
import { fetchCandidatesSafe, getCandidateScore, type PublicCandidate } from "@/lib/supabase";
import { formatNumber } from "@/lib/utils";

export function HeroSection() {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<PublicCandidate[]>([]);

  useEffect(() => {
    async function load() {
      const data = await fetchCandidatesSafe(4);
      setCandidates(data);
    }
    void load();
  }, []);

  const handleStartVoting = () => {
    const el = document.getElementById("live-ranking");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    } else {
      navigate("/candidates");
    }
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase();

  return (
    <section
      style={{
        background: "#FFFFFF",
        borderBottom: "1px solid #F0DCE2",
        position: "relative",
        overflow: "hidden",
      }}
      aria-label="Hero Section"
    >
      {/* Subtle soft pink background decorative circles */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "-120px",
          right: "-100px",
          width: 480,
          height: 480,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255, 225, 232, 0.45) 0%, rgba(255, 243, 245, 0) 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: "-80px",
          left: "-80px",
          width: 360,
          height: 360,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255, 225, 232, 0.35) 0%, rgba(255, 243, 245, 0) 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Unified Responsive Hero Layout (Single H1, Composited GPU animations, Zero duplicate nodes) */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <div className="container-max" style={{ padding: "3rem 1.25rem 3.5rem" }}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Left Column: Headline, Supporting Text, Action Buttons, Trust */}
            <div className="lg:col-span-7 text-center lg:text-left">
              {/* Eyebrow */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  background: "#FFE1E8",
                  border: "1px solid #F0DCE2",
                  borderRadius: 99,
                  padding: "0.25rem 0.75rem",
                  marginBottom: "1rem",
                }}
              >
                <Heart size={12} color="#E51B3E" fill="#E51B3E" />
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    color: "#7A0C2E",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  PAIR UP OR LEAVE
                </span>
              </div>

              {/* Sole Primary H1 Headline */}
              <h1
                className="reveal-fade-up"
                style={{
                  fontSize: "clamp(2.25rem, 5.2vw, 3.85rem)",
                  fontWeight: 900,
                  color: "#24131A",
                  lineHeight: 1.12,
                  letterSpacing: "-0.03em",
                  margin: "0 0 1rem",
                }}
              >
                Your Vote.<br />
                <span className="text-gradient-burgundy">Their Moment.</span>
              </h1>

              {/* Supporting text */}
              <p
                className="reveal-fade-up stagger-1"
                style={{
                  fontSize: "clamp(0.9375rem, 1.6vw, 1.125rem)",
                  color: "#6B6870",
                  lineHeight: 1.6,
                  margin: "0 auto 1.75rem",
                  maxWidth: 520,
                }}
              >
                Choose your favorite candidate, cast your vote, and watch the rankings move in real time.
              </p>

              {/* Action Buttons */}
              <div
                className="reveal-fade-up stagger-2"
                style={{
                  display: "flex",
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  justifyContent: "center",
                  marginBottom: "1.75rem",
                }}
              >
                <button
                  className="btn-vote"
                  onClick={handleStartVoting}
                  style={{
                    minWidth: 160,
                    justifyContent: "center",
                    minHeight: 48,
                    fontSize: "1.0625rem",
                    fontWeight: 800,
                  }}
                  aria-label="Vote now"
                >
                  <Vote size={18} />
                  VOTE NOW
                </button>

                <button
                  className="btn-outline"
                  onClick={() => navigate("/candidates")}
                  style={{
                    minWidth: 160,
                    justifyContent: "center",
                    minHeight: 48,
                    fontSize: "0.9375rem",
                    fontWeight: 700,
                  }}
                  aria-label="Explore candidates"
                >
                  EXPLORE CANDIDATES
                  <ArrowRight size={16} />
                </button>
              </div>

              {/* Trust Indicators / Badges */}
              <div
                className="reveal-fade-up stagger-3"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1.25rem",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  color: "#6B6870",
                  fontSize: "0.8125rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <ShieldCheck size={16} color="#22C55E" />
                  <span>Stripe Secure Payments</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <span style={{ fontWeight: 800, color: "#7A0C2E" }}>$1</span>
                  <span>/ vote individual</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <span style={{ fontWeight: 800, color: "#7A0C2E" }}>$2</span>
                  <span>/ vote couple</span>
                </div>
              </div>
            </div>

            {/* Right Column: Multi-Candidate Competition Showcase */}
            <div
              className="lg:col-span-5 reveal-scale stagger-1"
              style={{
                background: "linear-gradient(145deg, #FFFFFF 0%, #FFF8FA 100%)",
                border: "1.5px solid #F0DCE2",
                borderRadius: 24,
                padding: "1.5rem",
                boxShadow: "0 12px 36px rgba(74, 6, 28, 0.07)",
                maxWidth: 480,
                margin: "0 auto",
                width: "100%",
              }}
            >
              {/* Card Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "1.25rem",
                  paddingBottom: "0.875rem",
                  borderBottom: "1px solid #F0DCE2",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Trophy size={18} color="#7A0C2E" />
                  <span style={{ fontWeight: 800, fontSize: "1rem", color: "#24131A" }}>
                    Live Contest Standings
                  </span>
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    background: "#FFE1E8",
                    color: "#7A0C2E",
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    padding: "0.25rem 0.625rem",
                    borderRadius: 99,
                    border: "1px solid #F0DCE2",
                  }}
                >
                  <span
                    className="animate-pulse-red"
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#E51B3E",
                      display: "inline-block",
                    }}
                  />
                  LIVE
                </div>
              </div>

              {/* Candidate Items in Contest */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {candidates.length > 0 ? (
                  candidates.slice(0, 3).map((c, idx) => {
                    const isFirst = idx === 0;
                    return (
                      <div
                        key={c.id}
                        style={{
                          background: "#FFFFFF",
                          border: isFirst ? "1.5px solid #E51B3E" : "1px solid #F0DCE2",
                          borderRadius: 14,
                          padding: "0.75rem 1rem",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.875rem",
                          boxShadow: isFirst ? "0 4px 16px rgba(229, 27, 62, 0.12)" : "none",
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: idx === 0 ? "#7A0C2E" : idx === 1 ? "#FFE1E8" : "#FFF3F5",
                            color: idx === 0 ? "#FFFFFF" : "#7A0C2E",
                            border: `1px solid ${idx === 0 ? "#E51B3E" : "#F0DCE2"}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.75rem",
                            fontWeight: 800,
                            flexShrink: 0,
                          }}
                        >
                          #{idx + 1}
                        </div>

                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            overflow: "hidden",
                            background: "linear-gradient(135deg, #7A0C2E, #E51B3E)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#FFFFFF",
                            fontWeight: 800,
                            fontSize: "0.875rem",
                            flexShrink: 0,
                          }}
                        >
                          {c.photo_url ? (
                            <img
                              src={c.photo_url}
                              alt={c.name}
                              width={40}
                              height={40}
                              loading="eager"
                              decoding="async"
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : (
                            getInitials(c.name)
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: "0.9375rem", color: "#24131A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {c.name}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "#6B6870" }}>
                            {c.position}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 900, fontSize: "1rem", color: "#7A0C2E" }}>
                            {formatNumber(getCandidateScore(c))}
                          </div>
                          <div style={{ fontSize: "0.6875rem", color: "#6B6870" }}>votes</div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div
                    style={{
                      background: "#FFFFFF",
                      borderRadius: 14,
                      padding: "1rem",
                      border: "1px solid #F0DCE2",
                      textAlign: "center",
                      color: "#6B6870",
                      fontSize: "0.875rem",
                    }}
                  >
                    Multiple candidates actively competing. Real-time updates.
                  </div>
                )}
              </div>

              {/* Bottom Card Summary */}
              <div
                style={{
                  marginTop: "1.25rem",
                  padding: "0.75rem 1rem",
                  borderRadius: 12,
                  background: "linear-gradient(135deg, #4A061C 0%, #7A0C2E 100%)",
                  color: "#FFFFFF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#FFE1E8" }}>
                  Ready to support your candidate?
                </div>
                <button
                  onClick={handleStartVoting}
                  style={{
                    background: "#E51B3E",
                    color: "#FFFFFF",
                    fontWeight: 800,
                    fontSize: "0.75rem",
                    padding: "0.4rem 0.875rem",
                    borderRadius: 8,
                    border: "none",
                    cursor: "pointer",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                  }}
                >
                  Vote Now
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
