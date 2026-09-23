import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Vote } from "lucide-react";
import { supabase, fetchCandidatesSafe, type Candidate } from "@/lib/supabase";
import { CandidateGrid } from "@/components/candidates/CandidateGrid";
import { LoadingState } from "@/components/ui/LoadingState";

export function FeaturedCandidates() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchCandidatesSafe(6);
        setCandidates(data);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  // Real-time subscription for vote count updates
  useEffect(() => {
    const channel = supabase
      .channel("featured-candidates")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "candidates" },
        (payload) => {
          setCandidates((prev) =>
            prev.map((c) =>
              c.id === (payload.new as Candidate).id
                ? { ...c, ...(payload.new as Candidate) }
                : c
            )
          );
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  return (
    <section className="section" style={{ background: "#ffffff" }} id="candidates">
      <div className="container-max">
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
            marginBottom: "2.5rem",
          }}
        >
          <div>
            <div className="badge badge-burgundy" style={{ marginBottom: "0.75rem" }}>
              <Vote size={12} style={{ marginRight: "0.375rem" }} />
              Featured Candidates
            </div>
            <h2
              style={{
                fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
                fontWeight: 800,
                color: "#24131A",
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              Meet the Candidates
            </h2>
            <p
              style={{
                fontSize: "1.0625rem",
                color: "#6B7280",
                margin: "0.5rem 0 0",
              }}
            >
              Discover the candidates and choose who you want to support.
            </p>
          </div>
          <Link to="/candidates">
            <button className="btn-outline" aria-label="View all candidates">
              View All
              <ArrowRight size={16} />
            </button>
          </Link>
        </div>

        {loading ? (
          <LoadingState message="Loading candidates..." />
        ) : (
          <CandidateGrid candidates={candidates} />
        )}

        {!loading && candidates.length > 0 && (
          <div style={{ textAlign: "center", marginTop: "2.5rem" }}>
            <Link to="/candidates">
              <button className="btn-primary" style={{ fontSize: "1rem" }}>
                <Vote size={17} />
                View All Candidates & Vote
                <ArrowRight size={16} />
              </button>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
