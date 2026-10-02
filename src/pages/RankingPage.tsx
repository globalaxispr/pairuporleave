import { useEffect, useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Trophy, TrendingUp, Vote, Zap, SlidersHorizontal } from "lucide-react";
import { supabase, type PublicCandidate, fetchCandidatesSafe, getCandidateScore, pickPublicFields } from "@/lib/supabase";
import { formatNumber, SITE_URL } from "@/lib/utils";
import { VoteModal } from "@/components/voting/VoteModal";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

export function RankingPage() {
  const [candidates, setCandidates] = useState<PublicCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<PublicCandidate | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCandidatesSafe();
      setCandidates(data ?? []);
    } catch {
      setError("Failed to load rankings. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Supabase Realtime subscription: updates in real-time when votes or score change
  useEffect(() => {
    const channel = supabase
      .channel("live-ranking-page")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "candidates" },
        (payload) => {
          // pickPublicFields strips any internal columns (paid_votes, bonus_votes,
          // penalty_points, etc.) from the realtime event before merging into state.
          const updated = pickPublicFields(payload.new as Record<string, unknown>);
          setCandidates((prev) =>
            [...prev.map((c) =>
              c.id === updated.id ? { ...c, ...updated } : c
            )].sort((a, b) => getCandidateScore(b) - getCandidateScore(a))
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const categories = useMemo(
    () => [...new Set(candidates.map((c) => c.category))].sort(),
    [candidates]
  );

  const filtered = useMemo(() => {
    if (!category) return candidates;
    return candidates.filter((c) => c.category === category);
  }, [candidates, category]);

  const top1 = filtered[0];
  const top2 = filtered[1];
  const top3 = filtered[2];
  const remaining = filtered.slice(3);

  const getInitials = (name: string) =>
    name
      .split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase();

  return (
    <>
      <Helmet>
        <title>Live Rankings — Pair Up or Leave</title>
        <meta
          name="description"
          content="Live standings and rankings of all candidates and couples on Pair Up or Leave. Votes update in real time."
        />
        <meta property="og:title" content="Live Rankings — Pair Up or Leave" />
        <meta property="og:description" content="See who's leading the competition right now. Live standings updated in real time. Cast your vote and change the rankings." />
        <meta property="og:url" content={`${SITE_URL}/ranking`} />
        <link rel="canonical" href={`${SITE_URL}/ranking`} />
      </Helmet>

      <main id="main-content" style={{ minHeight: "85vh", background: "#FFFFFF", paddingBottom: "5rem" }}>
        {/* Clean Light Hero */}
        <div
          style={{
            background: "linear-gradient(180deg, #FFF8FA 0%, #FFFFFF 100%)",
            borderBottom: "1px solid #F0DCE2",
            padding: "3.25rem 1rem 3.5rem",
            color: "#24131A",
          }}
        >
          <div className="container-max" style={{ textAlign: "center" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                background: "#FFE1E8",
                border: "1px solid #F0DCE2",
                padding: "0.25rem 0.875rem",
                borderRadius: 9999,
                marginBottom: "0.875rem",
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

            <h1
              className="reveal-fade-up"
              style={{
                fontSize: "clamp(2rem, 5.5vw, 3.25rem)",
                fontWeight: 900,
                color: "#24131A",
                letterSpacing: "-0.03em",
                margin: "0 0 0.5rem",
              }}
            >
              Who's Leading Right Now?
            </h1>
            <p
              className="reveal-fade-up stagger-1"
              style={{
                fontSize: "1.0625rem",
                color: "#6B6870",
                margin: 0,
                maxWidth: 520,
                marginInline: "auto",
                lineHeight: 1.6,
              }}
            >
              Scores update as votes come in. Check the current standings and see where your favorite stands.
            </p>
          </div>
        </div>

        {/* Content Container */}
        <div className="container-max" style={{ padding: "2rem 1rem" }}>
          {/* Category Chips Filter */}
          <div style={{ marginBottom: "2rem" }}>
            <div
              className="no-scrollbar"
              style={{
                display: "flex",
                gap: "0.5rem",
                overflowX: "auto",
                paddingBottom: "0.5rem",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <button
                onClick={() => setCategory("")}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: 99,
                  fontSize: "0.875rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  border: "1.5px solid",
                  borderColor: category === "" ? "#7A0C2E" : "#F0DCE2",
                  background: category === "" ? "#7A0C2E" : "#FFFFFF",
                  color: category === "" ? "#FFFFFF" : "#6B6870",
                  whiteSpace: "nowrap",
                  minHeight: 40,
                }}
              >
                All Categories
              </button>

              {categories.map((cat) => {
                const isActive = category === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    style={{
                      padding: "0.5rem 1rem",
                      borderRadius: 99,
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      border: "1.5px solid",
                      borderColor: isActive ? "#7A0C2E" : "#F0DCE2",
                      background: isActive ? "#7A0C2E" : "#FFFFFF",
                      color: isActive ? "#FFFFFF" : "#6B6870",
                      whiteSpace: "nowrap",
                      minHeight: 40,
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {loading ? (
            <LoadingState message="Loading live rankings..." />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#6B7280" }}>
              No candidates found in this category.
            </div>
          ) : (
            <div style={{ maxWidth: 960, margin: "0 auto" }}>
              {/* Top 3 Podium Cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  gap: "1.25rem",
                  marginBottom: "2rem",
                }}
                className="lg:grid-cols-3"
              >
                {/* #1 Leader */}
                {top1 && (
                  <div
                    style={{
                      background: "#ffffff",
                      borderRadius: 24,
                      border: "2px solid #E51B3E",
                      boxShadow: "0 8px 32px rgba(122, 12, 46, 0.12), 0 0 0 4px rgba(229, 27, 62, 0.15)",
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                    }}
                    className="podium-card lg:order-2 lg:-translate-y-2"
                  >
                    <div
                      style={{
                        background: "linear-gradient(135deg, #7A0C2E 0%, #E51B3E 100%)",
                        color: "#ffffff",
                        padding: "0.625rem 1rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <span style={{ fontWeight: 900, fontSize: "0.875rem", color: "#FFE1E8", letterSpacing: "0.05em" }}>
                          #1 CURRENT LEADER
                        </span>
                      </div>
                      <span style={{ background: "#FFE1E8", color: "#7A0C2E", fontWeight: 800, fontSize: "0.6875rem", padding: "0.125rem 0.5rem", borderRadius: 99 }}>
                        LEADER
                      </span>
                    </div>

                    <div style={{ padding: "1.5rem 1.25rem", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                      <div
                        style={{
                          width: 96,
                          height: 96,
                          borderRadius: "50%",
                          border: "4px solid #E51B3E",
                          overflow: "hidden",
                          marginBottom: "1rem",
                          background: "linear-gradient(135deg, #7A0C2E, #E51B3E)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
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
                          <span style={{ color: "#ffffff", fontSize: "2rem", fontWeight: 800 }}>{getInitials(top1.name)}</span>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.375rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
                        <h3 style={{ fontSize: "1.375rem", fontWeight: 800, color: "#24131A", margin: 0 }}>
                          {top1.candidate_type === "couple" ? (top1.display_name || top1.name) : top1.name}
                        </h3>
                        {top1.candidate_type === "couple" && (
                          <span style={{ fontSize: "0.625rem", fontWeight: 800, padding: "0.125rem 0.4rem", borderRadius: 4, background: "#FFE1E8", color: "#7A0C2E", letterSpacing: "0.05em" }}>
                            COUPLE
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.875rem", color: "#6B6870", marginBottom: "1rem" }}>
                        {top1.position} · <span style={{ color: "#7A0C2E", fontWeight: 600 }}>{top1.category}</span>
                      </div>

                      <div
                        style={{
                          width: "100%",
                          background: "linear-gradient(135deg, #FFF8FA 0%, #FFF3F5 100%)",
                          border: "1px solid #F0DCE2",
                          borderRadius: 14,
                          padding: "0.75rem 1rem",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.5rem",
                          marginBottom: "1.25rem",
                        }}
                      >
                        <TrendingUp size={18} color="#E51B3E" />
                        <span style={{ fontSize: "1.375rem", fontWeight: 900, color: "#E51B3E" }}>
                          {formatNumber(getCandidateScore(top1))}
                        </span>
                        <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#7A0C2E" }}>VOTES</span>
                      </div>

                      <button
                        className="btn-vote"
                        onClick={() => setSelectedCandidate(top1)}
                        style={{ width: "100%", justifyContent: "center", minHeight: 48, fontSize: "1.0625rem" }}
                      >
                        <Vote size={18} />
                        VOTE FOR #1
                      </button>
                    </div>
                  </div>
                )}

                {/* #2 Runner-up */}
                {top2 && (
                  <div
                    style={{
                      background: "#ffffff",
                      borderRadius: 20,
                      border: "1px solid #F0DCE2",
                      boxShadow: "0 4px 16px rgba(74, 6, 28, 0.05)",
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                    }}
                    className="podium-card lg:order-1"
                  >
                    <div
                      style={{
                        background: "#FFF3F5",
                        color: "#7A0C2E",
                        padding: "0.5rem 1rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderBottom: "1px solid #F0DCE2",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <span style={{ fontWeight: 800, fontSize: "0.8125rem", color: "#7A0C2E" }}>#2 RANK</span>
                      </div>
                      <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#A82046" }}>Runner-up</span>
                    </div>

                    <div style={{ padding: "1.25rem 1rem", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                      <div
                        style={{
                          width: 80,
                          height: 80,
                          borderRadius: "50%",
                          border: "3px solid #F0DCE2",
                          overflow: "hidden",
                          marginBottom: "0.75rem",
                          background: "linear-gradient(135deg, #7A0C2E, #E51B3E)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {top2.candidate_type === "couple" && top2.person_one_photo_url && top2.person_two_photo_url ? (
                          <div style={{ display: "flex", width: "100%", height: "100%" }}>
                            <img src={top2.person_one_photo_url} alt="Partner 1" width={40} height={80} loading="lazy" decoding="async" style={{ width: "50%", height: "100%", objectFit: "cover" }} />
                            <img src={top2.person_two_photo_url} alt="Partner 2" width={40} height={80} loading="lazy" decoding="async" style={{ width: "50%", height: "100%", objectFit: "cover", borderLeft: "1px solid #fff" }} />
                          </div>
                        ) : top2.photo_url ? (
                          <img src={top2.photo_url} alt={top2.name} width={80} height={80} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <span style={{ color: "#ffffff", fontSize: "1.625rem", fontWeight: 800 }}>{getInitials(top2.name)}</span>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
                        <h3 style={{ fontSize: "1.1875rem", fontWeight: 700, color: "#24131A", margin: 0 }}>
                          {top2.candidate_type === "couple" ? (top2.display_name || top2.name) : top2.name}
                        </h3>
                        {top2.candidate_type === "couple" && (
                          <span style={{ fontSize: "0.625rem", fontWeight: 800, padding: "0.125rem 0.375rem", borderRadius: 4, background: "#FFE1E8", color: "#7A0C2E", letterSpacing: "0.05em" }}>
                            COUPLE
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.8125rem", color: "#6B6870", marginBottom: "0.875rem" }}>
                        {top2.position} · {top2.category}
                      </div>

                      <div
                        style={{
                          width: "100%",
                          background: "#FFF8FA",
                          border: "1px solid #F0DCE2",
                          borderRadius: 12,
                          padding: "0.5rem 0.75rem",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.375rem",
                          marginBottom: "1rem",
                        }}
                      >
                        <span style={{ fontSize: "1.1875rem", fontWeight: 800, color: "#7A0C2E" }}>
                          {formatNumber(getCandidateScore(top2))}
                        </span>
                        <span style={{ fontSize: "0.8125rem", color: "#6B6870", fontWeight: 600 }}>votes</span>
                      </div>

                      <button
                        className="btn-vote"
                        onClick={() => setSelectedCandidate(top2)}
                        style={{ width: "100%", justifyContent: "center", minHeight: 46 }}
                      >
                        <Vote size={16} />
                        Vote for #2
                      </button>
                    </div>
                  </div>
                )}

                {/* #3 Third Place */}
                {top3 && (
                  <div
                    style={{
                      background: "#ffffff",
                      borderRadius: 20,
                      border: "1px solid #F0DCE2",
                      boxShadow: "0 4px 16px rgba(74, 6, 28, 0.05)",
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                    }}
                    className="podium-card lg:order-3"
                  >
                    <div
                      style={{
                        background: "#FFF8FA",
                        color: "#7A0C2E",
                        padding: "0.5rem 1rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderBottom: "1px solid #F0DCE2",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <span style={{ fontWeight: 800, fontSize: "0.8125rem", color: "#7A0C2E" }}>#3 RANK</span>
                      </div>
                      <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#A82046" }}>3rd Place</span>
                    </div>

                    <div style={{ padding: "1.25rem 1rem", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                      <div
                        style={{
                          width: 80,
                          height: 80,
                          borderRadius: "50%",
                          border: "3px solid #F0DCE2",
                          overflow: "hidden",
                          marginBottom: "0.75rem",
                          background: "linear-gradient(135deg, #7A0C2E, #E51B3E)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {top3.candidate_type === "couple" && top3.person_one_photo_url && top3.person_two_photo_url ? (
                          <div style={{ display: "flex", width: "100%", height: "100%" }}>
                            <img src={top3.person_one_photo_url} alt="Partner 1" width={40} height={80} loading="lazy" decoding="async" style={{ width: "50%", height: "100%", objectFit: "cover" }} />
                            <img src={top3.person_two_photo_url} alt="Partner 2" width={40} height={80} loading="lazy" decoding="async" style={{ width: "50%", height: "100%", objectFit: "cover", borderLeft: "1px solid #fff" }} />
                          </div>
                        ) : top3.photo_url ? (
                          <img src={top3.photo_url} alt={top3.name} width={80} height={80} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <span style={{ color: "#ffffff", fontSize: "1.625rem", fontWeight: 800 }}>{getInitials(top3.name)}</span>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
                        <h3 style={{ fontSize: "1.1875rem", fontWeight: 700, color: "#24131A", margin: 0 }}>
                          {top3.candidate_type === "couple" ? (top3.display_name || top3.name) : top3.name}
                        </h3>
                        {top3.candidate_type === "couple" && (
                          <span style={{ fontSize: "0.625rem", fontWeight: 800, padding: "0.125rem 0.375rem", borderRadius: 4, background: "#FFE1E8", color: "#7A0C2E", letterSpacing: "0.05em" }}>
                            COUPLE
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.8125rem", color: "#6B6870", marginBottom: "0.875rem" }}>
                        {top3.position} · {top3.category}
                      </div>

                      <div
                        style={{
                          width: "100%",
                          background: "#FFF8FA",
                          border: "1px solid #F0DCE2",
                          borderRadius: 12,
                          padding: "0.5rem 0.75rem",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.375rem",
                          marginBottom: "1rem",
                        }}
                      >
                        <span style={{ fontSize: "1.1875rem", fontWeight: 800, color: "#E51B3E" }}>
                          {formatNumber(getCandidateScore(top3))}
                        </span>
                        <span style={{ fontSize: "0.8125rem", color: "#6B6870", fontWeight: 600 }}>votes</span>
                      </div>

                      <button
                        className="btn-vote"
                        onClick={() => setSelectedCandidate(top3)}
                        style={{ width: "100%", justifyContent: "center", minHeight: 46 }}
                      >
                        <Vote size={16} />
                        Vote for #3
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Ranks #4 and onward */}
              {remaining.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      color: "#7A0C2E",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Contenders (#4 & Above)
                  </div>

                  {remaining.map((cand, idx) => {
                    const rankNum = idx + 4;
                    return (
                      <div
                        key={cand.id}
                        style={{
                          background: "#ffffff",
                          borderRadius: 16,
                          border: "1px solid #F0DCE2",
                          padding: "0.875rem 1rem",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.875rem",
                          boxShadow: "0 2px 8px rgba(74,6,28,0.04)",
                        }}
                      >
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            background: "#FFF3F5",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 800,
                            fontSize: "0.875rem",
                            color: "#7A0C2E",
                            flexShrink: 0,
                          }}
                        >
                          #{rankNum}
                        </div>

                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            overflow: "hidden",
                            background: "linear-gradient(135deg, #7A0C2E, #E51B3E)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#ffffff",
                            fontWeight: 700,
                            fontSize: "0.9375rem",
                            flexShrink: 0,
                          }}
                        >
                          {cand.candidate_type === "couple" && cand.person_one_photo_url && cand.person_two_photo_url ? (
                            <div style={{ display: "flex", width: "100%", height: "100%" }}>
                              <img src={cand.person_one_photo_url} alt="Partner 1" width={22} height={44} loading="lazy" decoding="async" style={{ width: "50%", height: "100%", objectFit: "cover" }} />
                              <img src={cand.person_two_photo_url} alt="Partner 2" width={22} height={44} loading="lazy" decoding="async" style={{ width: "50%", height: "100%", objectFit: "cover", borderLeft: "1px solid #fff" }} />
                            </div>
                          ) : cand.photo_url ? (
                            <img src={cand.photo_url} alt={cand.name} width={44} height={44} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            getInitials(cand.name)
                          )}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                            <span style={{ fontWeight: 700, fontSize: "0.9375rem", color: "#24131A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {cand.candidate_type === "couple" ? (cand.display_name || cand.name) : cand.name}
                            </span>
                            {cand.candidate_type === "couple" && (
                              <span style={{ fontSize: "0.625rem", fontWeight: 800, padding: "0.125rem 0.375rem", borderRadius: 4, background: "#FFE1E8", color: "#7A0C2E", flexShrink: 0 }}>
                                COUPLE
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "#6B6870" }}>
                            {cand.position} · {cand.category}
                          </div>
                        </div>

                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: "1rem", color: "#E51B3E" }}>
                            {formatNumber(getCandidateScore(cand))}
                          </div>
                          <div style={{ fontSize: "0.6875rem", color: "#6B6870" }}>votes</div>
                        </div>

                        <button
                          className="btn-vote"
                          onClick={() => setSelectedCandidate(cand)}
                          style={{ padding: "0.5rem 0.875rem", fontSize: "0.8125rem", minHeight: 40, flexShrink: 0 }}
                        >
                          <Vote size={14} />
                          Vote
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

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
