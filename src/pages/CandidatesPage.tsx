import { useEffect, useState, useMemo, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { supabase, type PublicCandidate, fetchCandidatesSafe, getCandidateScore, pickPublicFields } from "@/lib/supabase";
import { CandidateGrid } from "@/components/candidates/CandidateGrid";
import { CandidateFilter } from "@/components/candidates/CandidateFilter";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Users, Vote } from "lucide-react";
import { SITE_URL } from "@/lib/utils";

function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function CandidatesPage() {
  const [candidates, setCandidates] = useState<PublicCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("votes_desc");

  const debouncedSearch = useDebounce(search, 300);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCandidatesSafe();
      setCandidates(data ?? []);
    } catch {
      setError("Failed to load candidates. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Realtime vote updates
  useEffect(() => {
    const channel = supabase
      .channel("candidates-page")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "candidates" }, (payload) => {
        const updated = pickPublicFields(payload.new as Record<string, unknown>);
        setCandidates((prev) =>
          prev.map((c) => c.id === updated.id ? { ...c, ...updated } : c)
        );
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const categories = useMemo(
    () => [...new Set(candidates.map((c) => c.category))].sort(),
    [candidates]
  );

  const filtered = useMemo(() => {
    let list = [...candidates];
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q) ||
          c.position.toLowerCase().includes(q)
      );
    }
    if (category) list = list.filter((c) => c.category === category);
    switch (sort) {
      case "votes_asc":   list.sort((a, b) => getCandidateScore(a) - getCandidateScore(b)); break;
      case "name_asc":    list.sort((a, b) => a.name.localeCompare(b.name)); break;
      case "created_desc":list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
      default:             list.sort((a, b) => getCandidateScore(b) - getCandidateScore(a)); break;
    }
    return list;
  }, [candidates, debouncedSearch, category, sort]);

  return (
    <>
      <Helmet>
        <title>Candidates — Pair Up or Leave</title>
        <meta name="description" content="Browse all candidates and couples on Pair Up or Leave and cast your votes. $1/vote for individuals, $2/vote for couples. No account required." />
        <meta property="og:title" content="Candidates — Pair Up or Leave" />
        <meta property="og:description" content="Browse all candidates and couples on Pair Up or Leave and cast your votes. $1/vote for individuals, $2/vote for couples." />
        <meta property="og:url" content={`${SITE_URL}/candidates`} />
        <link rel="canonical" href={`${SITE_URL}/candidates`} />
      </Helmet>

      <main id="main-content" style={{ minHeight: "80vh", background: "#ffffff" }}>
        {/* Clean Light Hero */}
        <div
          style={{
            background: "linear-gradient(180deg, #FFF8FA 0%, #FFFFFF 100%)",
            borderBottom: "1px solid #F0DCE2",
            padding: "3.25rem 1rem 3.5rem",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div className="container-max" style={{ textAlign: "center" }}>
            {/* Eyebrow */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                background: "#FFE1E8",
                border: "1px solid #F0DCE2",
                padding: "0.25rem 0.875rem",
                borderRadius: 99,
                marginBottom: "0.875rem",
              }}
            >
              <Users size={14} color="#7A0C2E" />
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  color: "#7A0C2E",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                MEET THE CANDIDATES
              </span>
            </div>

            {/* Headline */}
            <h1
              className="reveal-fade-up"
              style={{
                fontSize: "clamp(2rem, 5.5vw, 3.25rem)",
                fontWeight: 900,
                color: "#24131A",
                margin: "0 0 0.75rem",
                letterSpacing: "-0.03em",
              }}
            >
              Find Your Favorite.
            </h1>

            {/* Supporting Text */}
            <p
              className="reveal-fade-up stagger-1"
              style={{
                fontSize: "1.0625rem",
                color: "#6B6870",
                margin: "0 auto",
                maxWidth: 520,
                lineHeight: 1.6,
              }}
            >
              Explore the candidates, discover their stories, and choose who deserves your vote.
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="container-max" style={{ padding: "2rem 1rem 4rem" }}>
          <CandidateFilter
            search={search}
            onSearchChange={setSearch}
            category={category}
            onCategoryChange={setCategory}
            sort={sort}
            onSortChange={setSort}
            categories={categories}
          />

          {loading ? (
            <LoadingState message="Loading candidates..." size="lg" />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Vote size={32} color="#9CA3AF" />}
              title="No candidates found."
              description="Try another search or category."
            />
          ) : (
            <>
              <div style={{ marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.875rem", color: "#6B7280", fontWeight: 600 }}>
                  Showing {filtered.length} candidate{filtered.length !== 1 ? "s" : ""}
                </span>
              </div>
              <CandidateGrid
                candidates={filtered}
                showRank={sort === "votes_desc"}
              />
            </>
          )}
        </div>
      </main>
    </>
  );
}
