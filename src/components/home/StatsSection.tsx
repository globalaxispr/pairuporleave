import { useEffect, useState } from "react";
import { Users, Vote, Heart } from "lucide-react";
import { supabase, fetchCandidatesSafe, getCandidateScore } from "@/lib/supabase";
import { formatNumber } from "@/lib/utils";

interface Stats {
  totalCandidates: number;
  totalVotes: number;
  totalSupporters: number;
}

function StatItem({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: React.ElementType;
  value: number | null;
  label: string;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        flex: 1,
        minWidth: 180,
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: "#FFE1E8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          border: "1px solid #F0DCE2",
        }}
      >
        <Icon size={24} color={color} />
      </div>
      <div>
        <div className="stat-number" style={{ color }}>
          {value === null ? (
            <div className="skeleton" style={{ width: 80, height: 36 }} />
          ) : (
            formatNumber(value)
          )}
        </div>
        <div style={{ fontSize: "0.875rem", color: "#6B6870", fontWeight: 600 }}>
          {label}
        </div>
      </div>
    </div>
  );
}

export function StatsSection() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    async function loadStats() {
      try {
        const [candidatesRes, votesRes] = await Promise.all([
          (supabase.from("public_candidates" as any) as any)
            .select("id", { count: "exact", head: true }),
          (supabase.from("public_candidates" as any) as any)
            .select("current_score"),
        ]);

        let totalCandidates = candidatesRes.count ?? 0;
        let totalVotes = (votesRes.data ?? []).reduce(
          (sum: number, c: { current_score?: number }) => sum + (c.current_score ?? 0),
          0
        );

        if (totalCandidates === 0) {
          const fallback = await fetchCandidatesSafe();
          totalCandidates = fallback.length;
          totalVotes = fallback.reduce((sum, c) => sum + getCandidateScore(c), 0);
        }

        const totalSupporters = Math.round(totalVotes * 0.6); // approx unique supporters

        setStats({ totalCandidates, totalVotes, totalSupporters });
      } catch {
        const fallback = await fetchCandidatesSafe();
        const totalCandidates = fallback.length;
        const totalVotes = fallback.reduce((sum, c) => sum + getCandidateScore(c), 0);
        setStats({ totalCandidates, totalVotes, totalSupporters: Math.round(totalVotes * 0.6) });
      }
    }

    void loadStats();
  }, []);

  return (
    <section
      style={{
        background: "#FFF8FA",
        borderTop: "1px solid #F0DCE2",
        borderBottom: "1px solid #F0DCE2",
        padding: "2.5rem 1.5rem",
      }}
      aria-label="Platform statistics"
    >
      <div className="container-max">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "2rem",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Dividers between items on desktop */}
          <StatItem
            icon={Users}
            value={stats?.totalCandidates ?? null}
            label="Candidates"
            color="#7A0C2E"
          />
          <div
            style={{
              width: 1,
              height: 48,
              background: "#F0DCE2",
            }}
            className="stat-divider"
            aria-hidden="true"
          />
          <StatItem
            icon={Vote}
            value={stats?.totalVotes ?? null}
            label="Total Votes Cast"
            color="#E51B3E"
          />
          <div
            style={{
              width: 1,
              height: 48,
              background: "#F0DCE2",
            }}
            className="stat-divider"
            aria-hidden="true"
          />
          <StatItem
            icon={Heart}
            value={stats?.totalSupporters ?? null}
            label="Supporters"
            color="#E51B3E"
          />
        </div>
      </div>
      <style>{`
        @media (max-width: 600px) {
          .stat-divider { display: none; }
        }
      `}</style>
    </section>
  );
}
