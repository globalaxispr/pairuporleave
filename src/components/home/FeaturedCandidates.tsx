import { useEffect, useState } from "react";
import { Vote } from "lucide-react";
import { supabase, fetchCandidatesSafe, getCandidateScore, type PublicCandidate, applyRealtimeCandidateToCache } from "@/lib/supabase";
import { CandidateGrid } from "@/components/candidates/CandidateGrid";
import { LoadingState } from "@/components/ui/LoadingState";

export function FeaturedCandidates() {
  const [candidates, setCandidates] = useState<PublicCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchCandidatesSafe();
        setCandidates(data);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  // Real-time subscription for candidate and vote count updates
  useEffect(() => {
    const channel = supabase
      .channel("featured-candidates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "candidates" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as Record<string, unknown> | undefined;
            if (oldRow?.id) {
              setCandidates((prev) => prev.filter((c) => c.id !== oldRow.id));
            }
            return;
          }
          if (!payload.new) return;
          const updated = applyRealtimeCandidateToCache(
            payload.new as Record<string, unknown>,
            payload.eventType
          );
          if (!updated) return;
          setCandidates((prev) => {
            if (updated.status !== "active") {
              return prev.filter((c) => c.id !== updated.id);
            }
            const exists = prev.some((c) => c.id === updated.id);
            const next = exists
              ? prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
              : [...prev, updated];
            return [...next].sort((a, b) => getCandidateScore(b) - getCandidateScore(a));
          });
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
        </div>

        {loading ? (
          <LoadingState message="Loading candidates..." />
        ) : (
          <CandidateGrid candidates={candidates} />
        )}
      </div>
    </section>
  );
}
