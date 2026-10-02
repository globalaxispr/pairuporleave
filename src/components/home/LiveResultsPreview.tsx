import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, ArrowRight } from "lucide-react";
import { supabase, fetchCandidatesSafe, getCandidateScore, pickPublicFields, type PublicCandidate } from "@/lib/supabase";
import { formatNumber } from "@/lib/utils";

export function LiveResultsPreview() {
  const [candidates, setCandidates] = useState<PublicCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchCandidatesSafe(5);
        setCandidates(data);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const totalVotes = candidates.reduce((s, c) => s + getCandidateScore(c), 0);

  return (
    <section
      className="section"
      style={{ background: "#ffffff", borderBottom: "1px solid #F0DCE2" }}
      aria-label="Live results preview"
    >
      <div className="container-max">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "4rem",
            alignItems: "center",
          }}
          className="results-preview-grid"
        >
          {/* Left â€” text */}
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                background: "#FFE1E8",
                color: "#7A0C2E",
                borderRadius: 9999,
                padding: "0.25rem 0.875rem",
                fontSize: "0.75rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: "0.75rem",
              }}
            >
              <TrendingUp size={13} />
              Results Preview
            </div>
            <h2
              style={{
                fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
                fontWeight: 800,
                color: "#24131A",
                margin: "0 0 0.75rem",
                letterSpacing: "-0.02em",
              }}
            >
              See Where Everyone Stands.
            </h2>
            <p style={{ fontSize: "1.0625rem", color: "#6B6870", lineHeight: 1.65, marginBottom: "1.75rem" }}>
              Scores update as votes come in. Follow the latest standings and see how the competition is unfolding in real time.
            </p>
            <Link to="/results">
              <button className="btn-primary" aria-label="View complete competition results">
                <TrendingUp size={16} />
                Full Results
                <ArrowRight size={16} />
              </button>
            </Link>
          </div>

          {/* Right â€” results list */}
          <div>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton" style={{ height: 72, borderRadius: 14 }} />
                ))}
              </div>
            ) : (
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #F0DCE2",
                  borderRadius: 20,
                  overflow: "hidden",
                }}
                className="card-shadow"
              >
                {candidates.slice(0, 5).map((c, i) => {
                  const pct = totalVotes > 0 ? Math.round((getCandidateScore(c) / totalVotes) * 100) : 0;
                  const initials = c.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();

                  return (
                    <div
                      key={c.id}
                      style={{
                        padding: "0.875rem 1.25rem",
                        borderBottom: i < candidates.length - 1 ? "1px solid #FDF2F4" : "none",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.875rem",
                      }}
                    >
                      {/* Rank */}
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: "50%",
                          background: i === 0 ? "#7A0C2E" : i === 1 ? "#A82046" : i === 2 ? "#E51B3E" : "#FFF3F5",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.75rem",
                          fontWeight: 800,
                          color: i < 3 ? "#ffffff" : "#7A0C2E",
                          flexShrink: 0,
                        }}
                        aria-label={`Rank ${i + 1}`}
                      >
                        #{i + 1}
                      </div>

                      {/* Photo/initials */}
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          background: "linear-gradient(135deg, #7A0C2E, #E51B3E)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#fff",
                          fontWeight: 700,
                          fontSize: "0.875rem",
                          flexShrink: 0,
                          overflow: "hidden",
                        }}
                      >
                        {c.photo_url ? (
                          <img src={c.photo_url} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          initials
                        )}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: "0.9375rem",
                            color: "#24131A",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {c.name}
                        </div>
                        {/* Progress bar */}
                        <div className="progress-bar" style={{ marginTop: "0.375rem" }}>
                          <div
                            className="progress-bar-fill"
                            style={{ width: `${pct}%` }}
                            role="progressbar"
                            aria-label={`Vote percentage for ${c.name}: ${pct}%`}
                            aria-valuenow={pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          />
                        </div>
                      </div>

                      {/* Votes + pct */}
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: "#E51B3E" }}>
                          {formatNumber(getCandidateScore(c))}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#6B6870" }}>{pct}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 768px) {
          .results-preview-grid {
            grid-template-columns: 1fr !important;
            gap: 2rem !important;
          }
        }
      `}</style>
    </section>
  );
}
