import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { TrendingUp, Vote, Trophy, ArrowRight } from "lucide-react";
import { supabase, type Candidate, fetchCandidatesSafe, getCandidateScore } from "@/lib/supabase";
import { formatNumber, SITE_URL } from "@/lib/utils";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { VoteModal } from "@/components/voting/VoteModal";

const rankBadges: Record<number, { bg: string; color: string; border: string; label: string }> = {
  0: { bg: "#7A0C2E", color: "#ffffff", border: "#7A0C2E", label: "#1" },
  1: { bg: "#A82046", color: "#ffffff", border: "#A82046", label: "#2" },
  2: { bg: "#E51B3E", color: "#ffffff", border: "#E51B3E", label: "#3" },
};

export function ResultsPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [animateBars, setAnimateBars] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    setAnimateBars(false);
    try {
      const data = await fetchCandidatesSafe();
      setCandidates(data ?? []);
      setTimeout(() => setAnimateBars(true), 80);
    } catch {
      setError("Failed to load results. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Realtime score & vote updates
  useEffect(() => {
    const channel = supabase
      .channel("results-page")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "candidates" },
        (payload) => {
          setCandidates((prev) =>
            [...prev.map((c) =>
              c.id === (payload.new as Candidate).id ? { ...c, ...(payload.new as Candidate) } : c
            )].sort((a, b) => getCandidateScore(b) - getCandidateScore(a))
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const totalVotes = candidates.reduce((s, c) => s + getCandidateScore(c), 0);
  const maxVotes = candidates.length > 0 ? getCandidateScore(candidates[0]) || 1 : 1;

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
        <title>Live Voting Results — Pair Up or Leave</title>
        <meta
          name="description"
          content="Live voting results and rankings for all candidates and couples on Pair Up or Leave. Updated in real time."
        />
        <meta property="og:title" content="Live Voting Results — Pair Up or Leave" />
        <meta property="og:description" content="See the current vote tallies and who is winning the Pair Up or Leave competition. Results updated live." />
        <meta property="og:url" content={`${SITE_URL}/results`} />
        <link rel="canonical" href={`${SITE_URL}/results`} />
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
              <TrendingUp size={14} color="#7A0C2E" />
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  color: "#7A0C2E",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                RESULTS
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
              See Where Everyone Stands.
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
              Follow the latest scores and see how the competition is unfolding.
            </p>
          </div>
        </div>

        {/* Results List */}
        <div className="container-max" style={{ padding: "2rem 1rem", maxWidth: 840, margin: "0 auto" }}>
          {loading ? (
            <LoadingState size="lg" message="Loading live results..." />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : candidates.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "3rem 1rem",
                color: "#6B7280",
                background: "#FFF8FA",
                borderRadius: 16,
                border: "1px solid #F0DCE2",
              }}
            >
              No candidate results found.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {candidates.map((c, i) => {
                const isTop3 = i < 3;
                const badge = rankBadges[i] ?? {
                  bg: "#FFF3F5",
                  color: "#7A0C2E",
                  border: "#F0DCE2",
                  label: `#${i + 1}`,
                };
                // Progress bar relative to the leader
                const barPct = maxVotes > 0 ? (c.total_votes / maxVotes) * 100 : 0;
                const votePct = totalVotes > 0 ? (c.total_votes / totalVotes) * 100 : 0;

                return (
                  <article
                    key={c.id}
                    style={{
                      background: "#ffffff",
                      borderRadius: 18,
                      border: "1px solid #F0DCE2",
                      boxShadow: isTop3
                        ? "0 4px 16px rgba(122, 12, 46, 0.06)"
                        : "0 2px 8px rgba(0,0,0,0.03)",
                      padding: "1rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.875rem",
                      transition: "transform 0.15s ease",
                    }}
                    aria-label={`Rank ${i + 1}: ${c.name} with ${formatNumber(c.total_votes)} votes`}
                  >
                    {/* Top Row: Rank + Photo + Name + Vote Count */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      {/* Prominent Rank Badge */}
                      <div
                        style={{
                          minWidth: 44,
                          height: 44,
                          borderRadius: 12,
                          background: badge.bg,
                          color: badge.color,
                          border: `1.5px solid ${badge.border}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 900,
                          fontSize: isTop3 ? "0.9375rem" : "0.875rem",
                          flexShrink: 0,
                          boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                        }}
                      >
                        {badge.label}
                      </div>

                      {/* Photo or Dual Photo */}
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
                          fontWeight: 800,
                          fontSize: "0.9375rem",
                          flexShrink: 0,
                        }}
                      >
                        {c.candidate_type === "couple" && c.person_one_photo_url && c.person_two_photo_url ? (
                          <div style={{ display: "flex", width: "100%", height: "100%" }}>
                            <img src={c.person_one_photo_url} alt="Partner 1" style={{ width: "50%", height: "100%", objectFit: "cover" }} />
                            <img src={c.person_two_photo_url} alt="Partner 2" style={{ width: "50%", height: "100%", objectFit: "cover", borderLeft: "1px solid #fff" }} />
                          </div>
                        ) : c.photo_url ? (
                          <img
                            src={c.photo_url}
                            alt={c.name}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          getInitials(c.name)
                        )}
                      </div>

                      {/* Candidate Name, Type & Position */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: "1rem",
                            color: "#24131A",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.display_name || c.name}</span>
                          <span
                            style={{
                              fontSize: "0.6875rem",
                              fontWeight: 800,
                              padding: "0.125rem 0.4rem",
                              borderRadius: 4,
                              background: "#FFE1E8",
                              color: "#7A0C2E",
                              border: "1px solid #F0DCE2",
                              textTransform: "uppercase",
                              flexShrink: 0,
                            }}
                          >
                            {c.candidate_type === "couple" ? "Couple" : "Individual"}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "#6B6870",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {c.position} · <span style={{ color: "#7A0C2E", fontWeight: 600 }}>{c.category}</span>
                        </div>
                      </div>

                      {/* Vote Count */}
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div
                          style={{
                            fontWeight: 900,
                            fontSize: "1.1875rem",
                            color: "#E51B3E",
                            lineHeight: 1.1,
                          }}
                        >
                          {formatNumber(c.total_votes)}
                        </div>
                        <div style={{ fontSize: "0.6875rem", color: "#6B6870", fontWeight: 600 }}>
                          {votePct.toFixed(1)}% of total
                        </div>
                      </div>
                    </div>

                    {/* Horizontal Progress Bar */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div
                        style={{
                          flex: 1,
                          height: 10,
                          background: "#FFF3F5",
                          borderRadius: 99,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: animateBars ? `${Math.max(barPct, 2)}%` : "0%",
                            height: "100%",
                            background:
                              i === 0
                                ? "linear-gradient(90deg, #7A0C2E 0%, #E51B3E 100%)"
                                : "linear-gradient(90deg, #E51B3E 0%, #FF5475 100%)",
                            borderRadius: 99,
                            transition: "width 0.75s cubic-bezier(0.16, 1, 0.3, 1)",
                          }}
                          role="progressbar"
                          aria-valuenow={Math.round(barPct)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        />
                      </div>

                      {/* Vote button on each result card */}
                      <button
                        className="btn-vote"
                        onClick={() => setSelectedCandidate(c)}
                        style={{
                          padding: "0.375rem 0.875rem",
                          fontSize: "0.8125rem",
                          fontWeight: 800,
                          minHeight: 36,
                          flexShrink: 0,
                          borderRadius: 8,
                        }}
                        aria-label={`Vote for ${c.name}`}
                      >
                        <Vote size={13} />
                        Vote
                      </button>
                    </div>
                  </article>
                );
              })}
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
