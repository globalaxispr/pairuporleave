import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trophy, TrendingUp, Vote, ArrowRight } from "lucide-react";
import { supabase, fetchCandidatesSafe, getCandidateScore, pickPublicFields, type PublicCandidate } from "@/lib/supabase";
import { formatNumber } from "@/lib/utils";
import { VoteModal } from "@/components/voting/VoteModal";

export function LiveRankingSection() {
  const [candidates, setCandidates] = useState<PublicCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState<PublicCandidate | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchCandidatesSafe(10);
        setCandidates(data);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  // Supabase Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("live-ranking-home")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "candidates" },
        (payload) => {
          const updated = pickPublicFields(payload.new as Record<string, unknown>);
          setCandidates((prev) => {
            const mapped = prev.map((c) =>
              c.id === updated.id ? { ...c, ...updated } : c
            );
            return [...mapped].sort((a, b) => getCandidateScore(b) - getCandidateScore(a));
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const top1 = candidates[0];
  const top2 = candidates[1];
  const top3 = candidates[2];

  const getInitials = (name?: string) =>
    name
      ? name
          .split(" ")
          .slice(0, 2)
          .map((n) => n[0])
          .join("")
          .toUpperCase()
      : "PL";

  return (
    <>
      <section
        id="live-ranking"
        style={{
          background: "#FFF8FA",
          padding: "3rem 1rem 3.5rem",
          borderBottom: "1px solid #F0DCE2",
        }}
        aria-label="Live Ranking"
      >
        <div className="container-max" style={{ maxWidth: 880, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                background: "#FFE1E8",
                border: "1px solid #F0DCE2",
                padding: "0.25rem 0.75rem",
                borderRadius: 99,
                marginBottom: "0.625rem",
              }}
            >
              <Trophy size={14} color="#7A0C2E" />
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  color: "#7A0C2E",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                LIVE RANKING
              </span>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#E51B3E",
                  display: "inline-block",
                  animation: "pulse-red 2s infinite",
                }}
              />
            </div>

            <h2
              style={{
                fontSize: "clamp(1.75rem, 6vw, 2.5rem)",
                fontWeight: 900,
                color: "#24131A",
                letterSpacing: "-0.03em",
                margin: "0 0 0.375rem",
              }}
            >
              Who's Leading Right Now?
            </h2>
            <p style={{ fontSize: "0.9375rem", color: "#6B6870", margin: 0 }}>
              Scores update as votes come in. Check the current standings and see where your favorite stands.
            </p>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "2.5rem", color: "#6B6870" }}>
              Loading real-time rankings...
            </div>
          ) : candidates.length === 0 ? (
            <div
              style={{
                background: "#FFFFFF",
                borderRadius: 16,
                padding: "2rem",
                textAlign: "center",
                color: "#6B6870",
                border: "1px solid #F0DCE2",
              }}
            >
              No active candidates currently listed.
            </div>
          ) : (
            <div>
              {/* ========================================================
                  MOBILE PODIUM (< 768px):
                  - #1 Dominant card on top
                  - #2 and #3 side-by-side in 2 columns directly below #1
                  - Followed by [ View Full Ranking ]
                 ======================================================== */}
              <div className="md:hidden">
                {/* #1 Dominant Card */}
                {top1 && (
                  <div
                    style={{
                      background: "#FFFFFF",
                      borderRadius: 20,
                      border: "2px solid #E51B3E",
                      boxShadow: "0 6px 24px rgba(74, 6, 28, 0.12)",
                      overflow: "hidden",
                      marginBottom: "0.875rem",
                    }}
                  >
                    {/* Header Strip */}
                    <div
                      style={{
                        background: "linear-gradient(135deg, #4A061C 0%, #7A0C2E 100%)",
                        color: "#FFFFFF",
                        padding: "0.5rem 0.875rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <span style={{ fontWeight: 900, fontSize: "0.875rem", color: "#FFE1E8" }}>
                          #1
                        </span>
                        <span style={{ fontWeight: 800, fontSize: "0.8125rem", color: "#FFFFFF" }}>
                          CURRENT LEADER
                        </span>
                      </div>
                      <span
                        style={{
                          background: "#E51B3E",
                          color: "#FFFFFF",
                          fontWeight: 800,
                          fontSize: "0.6875rem",
                          padding: "0.125rem 0.5rem",
                          borderRadius: 99,
                        }}
                      >
                        TOP RANK
                      </span>
                    </div>

                    {/* Content */}
                    <div style={{ padding: "1.25rem", textAlign: "center" }}>
                      <div
                        style={{
                          width: 84,
                          height: 84,
                          borderRadius: "50%",
                          border: "3.5px solid #E51B3E",
                          overflow: "hidden",
                          margin: "0 auto 0.75rem",
                          background: "linear-gradient(135deg, #7A0C2E, #E51B3E)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#FFFFFF",
                          fontWeight: 800,
                          fontSize: "1.75rem",
                        }}
                      >
                        {top1.candidate_type === "couple" && top1.person_one_photo_url && top1.person_two_photo_url ? (
                          <div style={{ display: "flex", width: "100%", height: "100%" }}>
                            <img src={top1.person_one_photo_url} alt="Partner 1" width={40} height={80} loading="lazy" decoding="async" style={{ width: "50%", height: "100%", objectFit: "cover" }} />
                            <img src={top1.person_two_photo_url} alt="Partner 2" width={40} height={80} loading="lazy" decoding="async" style={{ width: "50%", height: "100%", objectFit: "cover", borderLeft: "1px solid #fff" }} />
                          </div>
                        ) : top1.photo_url ? (
                          <img src={top1.photo_url} alt={top1.name} width={80} height={80} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          getInitials(top1.name)
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.375rem", flexWrap: "wrap", marginBottom: "0.125rem" }}>
                        <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#24131A", margin: 0 }}>
                          {top1.candidate_type === "couple" ? (top1.display_name || top1.name) : top1.name}
                        </h3>
                        {top1.candidate_type === "couple" && (
                          <span style={{ fontSize: "0.625rem", fontWeight: 800, padding: "0.125rem 0.4rem", borderRadius: 4, background: "#FFE1E8", color: "#7A0C2E", letterSpacing: "0.05em" }}>
                            COUPLE
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.8125rem", color: "#6B6870", marginBottom: "0.875rem" }}>
                        {top1.position} Â· <span style={{ color: "#7A0C2E", fontWeight: 600 }}>{top1.category}</span>
                      </div>

                      {/* Vote pill */}
                      <div
                        style={{
                          background: "#FFF8FA",
                          border: "1px solid #F0DCE2",
                          borderRadius: 12,
                          padding: "0.5rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.375rem",
                          marginBottom: "1rem",
                          width: "100%",
                          justifyContent: "center",
                        }}
                      >
                        <TrendingUp size={16} color="#E51B3E" />
                        <span style={{ fontSize: "1.25rem", fontWeight: 900, color: "#7A0C2E" }}>
                          {formatNumber(getCandidateScore(top1))}
                        </span>
                        <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#6B6870" }}>
                          VOTES
                        </span>
                      </div>

                      <button
                        className="btn-vote"
                        onClick={() => setSelectedCandidate(top1)}
                        style={{
                          width: "100%",
                          justifyContent: "center",
                          minHeight: 48,
                          fontSize: "1rem",
                          fontWeight: 800,
                        }}
                        aria-label={`Vote for #1 ${top1.name}`}
                      >
                        <Vote size={17} />
                        VOTE FOR #1
                      </button>
                    </div>
                  </div>
                )}

                {/* #2 and #3 Side-by-Side Row */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem",
                    marginBottom: "1.25rem",
                  }}
                >
                  {/* #2 Card */}
                  {top2 && (
                    <div
                      style={{
                        background: "#FFFFFF",
                        borderRadius: 16,
                        border: "1px solid #F0DCE2",
                        padding: "1rem 0.75rem",
                        textAlign: "center",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        boxShadow: "0 2px 8px rgba(74, 6, 28, 0.04)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", marginBottom: "0.5rem" }}>
                        <span style={{ fontWeight: 800, fontSize: "0.75rem", color: "#7A0C2E", background: "#FFE1E8", padding: "0.1rem 0.4rem", borderRadius: 99 }}>
                          #2 RANK
                        </span>
                      </div>

                      <div
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: "50%",
                          border: "2px solid #F0DCE2",
                          overflow: "hidden",
                          marginBottom: "0.5rem",
                          background: "linear-gradient(135deg, #7A0C2E, #E51B3E)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#FFFFFF",
                          fontWeight: 800,
                          fontSize: "1.125rem",
                        }}
                      >
                        {top2.candidate_type === "couple" && top2.person_one_photo_url && top2.person_two_photo_url ? (
                          <div style={{ display: "flex", width: "100%", height: "100%" }}>
                            <img src={top2.person_one_photo_url} alt="Partner 1" width={28} height={56} loading="lazy" decoding="async" style={{ width: "50%", height: "100%", objectFit: "cover" }} />
                            <img src={top2.person_two_photo_url} alt="Partner 2" width={28} height={56} loading="lazy" decoding="async" style={{ width: "50%", height: "100%", objectFit: "cover", borderLeft: "1px solid #fff" }} />
                          </div>
                        ) : top2.photo_url ? (
                          <img src={top2.photo_url} alt={top2.name} width={56} height={56} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          getInitials(top2.name)
                        )}
                      </div>

                      <h3
                        style={{
                          fontWeight: 800,
                          fontSize: "0.875rem",
                          color: "#24131A",
                          lineHeight: 1.2,
                          margin: "0 0 0.25rem",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          width: "100%",
                        }}
                      >
                        {top2.candidate_type === "couple" ? (top2.display_name || top2.name) : top2.name}
                      </h3>

                      <div style={{ fontSize: "0.9375rem", fontWeight: 800, color: "#7A0C2E", marginBottom: "0.75rem" }}>
                        {formatNumber(getCandidateScore(top2))} <span style={{ fontSize: "0.6875rem", color: "#6B6870", fontWeight: 600 }}>votes</span>
                      </div>

                      <button
                        className="btn-vote"
                        onClick={() => setSelectedCandidate(top2)}
                        style={{
                          width: "100%",
                          justifyContent: "center",
                          minHeight: 40,
                          fontSize: "0.8125rem",
                          padding: "0.375rem 0.5rem",
                          marginTop: "auto",
                        }}
                        aria-label={`Vote for #2 ${top2.name}`}
                      >
                        <Vote size={13} />
                        Vote #2
                      </button>
                    </div>
                  )}

                  {/* #3 Card */}
                  {top3 && (
                    <div
                      style={{
                        background: "#FFFFFF",
                        borderRadius: 16,
                        border: "1px solid #F0DCE2",
                        padding: "1rem 0.75rem",
                        textAlign: "center",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        boxShadow: "0 2px 8px rgba(74, 6, 28, 0.04)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", marginBottom: "0.5rem" }}>
                        <span style={{ fontWeight: 800, fontSize: "0.75rem", color: "#6B6870", background: "#FFF3F5", padding: "0.1rem 0.4rem", borderRadius: 99 }}>
                          #3 RANK
                        </span>
                      </div>

                      <div
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: "50%",
                          border: "2px solid #F0DCE2",
                          overflow: "hidden",
                          marginBottom: "0.5rem",
                          background: "linear-gradient(135deg, #7A0C2E, #E51B3E)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#FFFFFF",
                          fontWeight: 800,
                          fontSize: "1.125rem",
                        }}
                      >
                        {top3.candidate_type === "couple" && top3.person_one_photo_url && top3.person_two_photo_url ? (
                          <div style={{ display: "flex", width: "100%", height: "100%" }}>
                            <img src={top3.person_one_photo_url} alt="Partner 1" width={28} height={56} loading="lazy" decoding="async" style={{ width: "50%", height: "100%", objectFit: "cover" }} />
                            <img src={top3.person_two_photo_url} alt="Partner 2" width={28} height={56} loading="lazy" decoding="async" style={{ width: "50%", height: "100%", objectFit: "cover", borderLeft: "1px solid #fff" }} />
                          </div>
                        ) : top3.photo_url ? (
                          <img src={top3.photo_url} alt={top3.name} width={56} height={56} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          getInitials(top3.name)
                        )}
                      </div>

                      <h3
                        style={{
                          fontWeight: 800,
                          fontSize: "0.875rem",
                          color: "#24131A",
                          lineHeight: 1.2,
                          margin: "0 0 0.25rem",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          width: "100%",
                        }}
                      >
                        {top3.candidate_type === "couple" ? (top3.display_name || top3.name) : top3.name}
                      </h3>

                      <div style={{ fontSize: "0.9375rem", fontWeight: 800, color: "#7A0C2E", marginBottom: "0.75rem" }}>
                        {formatNumber(getCandidateScore(top3))} <span style={{ fontSize: "0.6875rem", color: "#6B6870", fontWeight: 600 }}>votes</span>
                      </div>

                      <button
                        className="btn-vote"
                        onClick={() => setSelectedCandidate(top3)}
                        style={{
                          width: "100%",
                          justifyContent: "center",
                          minHeight: 40,
                          fontSize: "0.8125rem",
                          padding: "0.375rem 0.5rem",
                          marginTop: "auto",
                        }}
                        aria-label={`Vote for #3 ${top3.name}`}
                      >
                        <Vote size={13} />
                        Vote #3
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ========================================================
                  DESKTOP PODIUM (>= 768px):
                  Classic 3-column layout (#2 Left, #1 Center Dominant, #3 Right)
                 ======================================================== */}
              <div className="hidden md:grid md:grid-cols-3 md:gap-4 md:items-end md:mb-6">
                {/* #2 Runner-up */}
                {top2 && (
                  <div
                    className="podium-card"
                    style={{
                      background: "#FFFFFF",
                      borderRadius: 20,
                      border: "1px solid #F0DCE2",
                      padding: "1.5rem 1rem",
                      textAlign: "center",
                      boxShadow: "0 4px 20px rgba(74, 6, 28, 0.05)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.375rem", marginBottom: "0.75rem" }}>
                      <span style={{ fontWeight: 800, fontSize: "0.8125rem", color: "#7A0C2E", background: "#FFE1E8", padding: "0.15rem 0.55rem", borderRadius: 99 }}>
                        #2 RUNNER-UP
                      </span>
                    </div>
                    <div
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: "50%",
                        border: "3px solid #F0DCE2",
                        overflow: "hidden",
                        margin: "0 auto 0.75rem",
                        background: "linear-gradient(135deg, #7A0C2E, #E51B3E)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#FFFFFF",
                        fontWeight: 800,
                      }}
                    >
                      {top2.candidate_type === "couple" && top2.person_one_photo_url && top2.person_two_photo_url ? (
                        <div style={{ display: "flex", width: "100%", height: "100%" }}>
                          <img src={top2.person_one_photo_url} alt="Partner 1" width={36} height={72} loading="lazy" decoding="async" style={{ width: "50%", height: "100%", objectFit: "cover" }} />
                          <img src={top2.person_two_photo_url} alt="Partner 2" width={36} height={72} loading="lazy" decoding="async" style={{ width: "50%", height: "100%", objectFit: "cover", borderLeft: "1px solid #fff" }} />
                        </div>
                      ) : top2.photo_url ? (
                        <img src={top2.photo_url} alt={top2.name} width={72} height={72} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        getInitials(top2.name)
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
                      <h3 style={{ fontSize: "1.125rem", fontWeight: 800, color: "#24131A", margin: 0 }}>
                        {top2.candidate_type === "couple" ? (top2.display_name || top2.name) : top2.name}
                      </h3>
                      {top2.candidate_type === "couple" && (
                        <span style={{ fontSize: "0.625rem", fontWeight: 800, padding: "0.125rem 0.375rem", borderRadius: 4, background: "#FFE1E8", color: "#7A0C2E", letterSpacing: "0.05em" }}>
                          COUPLE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#6B6870", marginBottom: "0.75rem" }}>{top2.position}</div>
                    <div style={{ fontSize: "1.125rem", fontWeight: 900, color: "#7A0C2E", marginBottom: "1rem" }}>
                      {formatNumber(getCandidateScore(top2))} votes
                    </div>
                    <button
                      className="btn-vote"
                      onClick={() => setSelectedCandidate(top2)}
                      style={{ width: "100%", justifyContent: "center", minHeight: 44 }}
                    >
                      <Vote size={15} />
                      Vote for #2
                    </button>
                  </div>
                )}

                {/* #1 Center Champion */}
                {top1 && (
                  <div
                    className="podium-card"
                    style={{
                      background: "#FFFFFF",
                      borderRadius: 24,
                      border: "2.5px solid #E51B3E",
                      boxShadow: "0 10px 32px rgba(229, 27, 62, 0.15)",
                      padding: "2rem 1.25rem",
                      textAlign: "center",
                      position: "relative",
                      transform: "translateY(-8px)",
                    }}
                  >
                    <div
                      style={{
                        background: "linear-gradient(135deg, #4A061C 0%, #7A0C2E 100%)",
                        color: "#FFFFFF",
                        padding: "0.375rem 0.875rem",
                        borderRadius: 99,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.375rem",
                        marginBottom: "1rem",
                      }}
                    >
                      <span style={{ fontWeight: 900, fontSize: "0.875rem", color: "#FFE1E8" }}>#1</span>
                      <span style={{ fontWeight: 800, fontSize: "0.8125rem", color: "#FFFFFF" }}>CURRENT LEADER</span>
                    </div>
                    <div
                      style={{
                        width: 90,
                        height: 90,
                        borderRadius: "50%",
                        border: "4px solid #E51B3E",
                        overflow: "hidden",
                        margin: "0 auto 1rem",
                        background: "linear-gradient(135deg, #7A0C2E, #E51B3E)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#FFFFFF",
                        fontWeight: 800,
                        fontSize: "1.875rem",
                      }}
                    >
                      {top1.candidate_type === "couple" && top1.person_one_photo_url && top1.person_two_photo_url ? (
                        <div style={{ display: "flex", width: "100%", height: "100%" }}>
                          <img src={top1.person_one_photo_url} alt="Partner 1" width={48} height={96} loading="lazy" decoding="async" style={{ width: "50%", height: "100%", objectFit: "cover" }} />
                          <img src={top1.person_two_photo_url} alt="Partner 2" width={48} height={96} loading="lazy" decoding="async" style={{ width: "50%", height: "100%", objectFit: "cover", borderLeft: "1px solid #fff" }} />
                        </div>
                      ) : top1.photo_url ? (
                        <img src={top1.photo_url} alt={top1.name} width={96} height={96} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        getInitials(top1.name)
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
                      <h3 style={{ fontSize: "1.375rem", fontWeight: 900, color: "#24131A", margin: 0 }}>
                        {top1.candidate_type === "couple" ? (top1.display_name || top1.name) : top1.name}
                      </h3>
                      {top1.candidate_type === "couple" && (
                        <span style={{ fontSize: "0.625rem", fontWeight: 800, padding: "0.125rem 0.4rem", borderRadius: 4, background: "#FFE1E8", color: "#7A0C2E", letterSpacing: "0.05em" }}>
                          COUPLE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "#6B6870", marginBottom: "1rem" }}>{top1.position} Â· {top1.category}</div>
                    <div
                      style={{
                        background: "#FFF8FA",
                        border: "1px solid #F0DCE2",
                        borderRadius: 12,
                        padding: "0.625rem",
                        marginBottom: "1.25rem",
                      }}
                    >
                      <span style={{ fontSize: "1.375rem", fontWeight: 900, color: "#7A0C2E" }}>
                        {formatNumber(getCandidateScore(top1))}
                      </span>{" "}
                      <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#6B6870" }}>VOTES</span>
                    </div>
                    <button
                      className="btn-vote"
                      onClick={() => setSelectedCandidate(top1)}
                      style={{ width: "100%", justifyContent: "center", minHeight: 48, fontSize: "1rem", fontWeight: 800 }}
                    >
                      <Vote size={18} />
                      VOTE FOR #1
                    </button>
                  </div>
                )}

                {/* #3 Third Place */}
                {top3 && (
                  <div
                    className="podium-card"
                    style={{
                      background: "#FFFFFF",
                      borderRadius: 20,
                      border: "1px solid #F0DCE2",
                      padding: "1.5rem 1rem",
                      textAlign: "center",
                      boxShadow: "0 4px 20px rgba(74, 6, 28, 0.05)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.375rem", marginBottom: "0.75rem" }}>
                      <span style={{ fontWeight: 800, fontSize: "0.8125rem", color: "#6B6870", background: "#FFF3F5", padding: "0.15rem 0.55rem", borderRadius: 99 }}>
                        #3 3RD PLACE
                      </span>
                    </div>
                    <div
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: "50%",
                        border: "3px solid #F0DCE2",
                        overflow: "hidden",
                        margin: "0 auto 0.75rem",
                        background: "linear-gradient(135deg, #7A0C2E, #E51B3E)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#FFFFFF",
                        fontWeight: 800,
                      }}
                    >
                      {top3.candidate_type === "couple" && top3.person_one_photo_url && top3.person_two_photo_url ? (
                        <div style={{ display: "flex", width: "100%", height: "100%" }}>
                          <img src={top3.person_one_photo_url} alt="Partner 1" width={36} height={72} loading="lazy" decoding="async" style={{ width: "50%", height: "100%", objectFit: "cover" }} />
                          <img src={top3.person_two_photo_url} alt="Partner 2" width={36} height={72} loading="lazy" decoding="async" style={{ width: "50%", height: "100%", objectFit: "cover", borderLeft: "1px solid #fff" }} />
                        </div>
                      ) : top3.photo_url ? (
                        <img src={top3.photo_url} alt={top3.name} width={72} height={72} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        getInitials(top3.name)
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
                      <h3 style={{ fontSize: "1.125rem", fontWeight: 800, color: "#24131A", margin: 0 }}>
                        {top3.candidate_type === "couple" ? (top3.display_name || top3.name) : top3.name}
                      </h3>
                      {top3.candidate_type === "couple" && (
                        <span style={{ fontSize: "0.625rem", fontWeight: 800, padding: "0.125rem 0.375rem", borderRadius: 4, background: "#FFE1E8", color: "#7A0C2E", letterSpacing: "0.05em" }}>
                          COUPLE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#6B7280", marginBottom: "0.75rem" }}>{top3.position}</div>
                    <div style={{ fontSize: "1.125rem", fontWeight: 900, color: "#7A0C2E", marginBottom: "1rem" }}>
                      {formatNumber(getCandidateScore(top3))} votes
                    </div>
                    <button
                      className="btn-vote"
                      onClick={() => setSelectedCandidate(top3)}
                      style={{ width: "100%", justifyContent: "center", minHeight: 44 }}
                    >
                      <Vote size={15} />
                      Vote for #3
                    </button>
                  </div>
                )}
              </div>

              {/* View Full Ranking Button */}
              <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
                <Link to="/ranking" style={{ textDecoration: "none" }}>
                  <button
                    className="btn-outline"
                    style={{
                      minHeight: 46,
                      padding: "0.625rem 1.5rem",
                      fontSize: "0.9375rem",
                      fontWeight: 700,
                    }}
                    aria-label="View full ranking leaderboard"
                  >
                    <span>View Full Ranking</span>
                    <ArrowRight size={16} />
                  </button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Vote Modal */}
      {selectedCandidate && (
        <VoteModal
          candidate={selectedCandidate}
          onClose={() => setSelectedCandidate(null)}
        />
      )}
    </>
  );
}
