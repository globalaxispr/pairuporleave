import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Vote, ArrowLeft, TrendingUp, User, MessageSquare, Eye } from "lucide-react";
import { supabase, type PublicCandidate, fetchCandidateByIdSafe, getCandidateScore, pickPublicFields } from "@/lib/supabase";
import { formatNumber, SITE_URL } from "@/lib/utils";
import { VoteModal } from "@/components/voting/VoteModal";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

export function CandidateProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState<PublicCandidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [imgErrorTwo, setImgErrorTwo] = useState(false);
  const [voteModalOpen, setVoteModalOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    async function load() {
      setLoading(true);
      const data = await fetchCandidateByIdSafe(id);
      if (!data) {
        setError("Candidate not found.");
      } else {
        setCandidate(data);
      }
      setLoading(false);
    }
    void load();
  }, [id]);

  // Realtime vote updates
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`candidate-profile-${id}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "candidates",
        filter: `id=eq.${id}`,
      }, (payload) => {
        const updated = pickPublicFields(payload.new as Record<string, unknown>);
        setCandidate((prev) => prev ? { ...prev, ...updated } : prev);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [id]);

  if (loading) return <LoadingState size="lg" message="Loading candidate..." />;
  if (error || !candidate) return (
    <ErrorState
      title="Candidate not found"
      message="This candidate does not exist or has been removed."
      onRetry={() => navigate("/candidates")}
    />
  );

  const isPaused = candidate.status === "paused";
  const isCouple = candidate.candidate_type === "couple";
  const candidateDisplayName = candidate.display_name || candidate.name;
  const initials = candidate.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();

  return (
    <>
      <Helmet>
        <title>{candidate.name} — Pair Up or Leave</title>
        <meta name="description" content={`Support ${candidate.name} — ${candidate.position}. ${candidate.description ?? ""} Vote now on Pair Up or Leave.`} />
        <meta property="og:title" content={`${candidate.name} — Pair Up or Leave`} />
        <meta property="og:description" content={`Support ${candidate.name} — ${candidate.position}. Cast your votes now on Pair Up or Leave. ${isCouple ? "$2/vote (couple entry)" : "$1/vote (individual entry)"}.`} />
        <meta property="og:url" content={`${SITE_URL}/candidate/${candidate.id}`} />
        <link rel="canonical" href={`${SITE_URL}/candidate/${candidate.id}`} />
        {candidate.photo_url && <meta property="og:image" content={candidate.photo_url} />}
      </Helmet>

      <main id="main-content" style={{ minHeight: "80vh", background: "#ffffff" }}>
        {/* Back */}
        <div style={{ background: "#FFF8FA", borderBottom: "1px solid #F0DCE2", padding: "0.875rem 1.5rem" }}>
          <div className="container-max">
            <Link
              to="/candidates"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", color: "#6B6870", textDecoration: "none", fontSize: "0.9375rem", fontWeight: 500 }}
            >
              <ArrowLeft size={16} />
              Back to Candidates
            </Link>
          </div>
        </div>

        <div className="container-max" style={{ padding: "3rem 1.5rem" }}>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "3rem", alignItems: "start" }}
            className="profile-grid"
          >
            {/* Left — Photo + vote button */}
            <div>
              {/* Photo(s) */}
              {isCouple ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem",
                    marginBottom: "1.5rem",
                  }}
                >
                  {/* Person 1 */}
                  <div
                    style={{
                      borderRadius: 18,
                      overflow: "hidden",
                      background: "#FFF3F5",
                      aspectRatio: "3/4",
                      border: "1px solid #F0DCE2",
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                    }}
                    className="card-shadow"
                  >
                    {candidate.person_one_photo_url || (candidate.photo_url && !imgError) ? (
                      <img
                        src={candidate.person_one_photo_url || candidate.photo_url!}
                        alt={candidate.person_one_name ? `Portrait of ${candidate.person_one_name}` : `Portrait of ${candidate.name} (person 1)`}
                        width={300}
                        height={400}
                        loading="eager"
                        decoding="async"
                        onError={() => setImgError(true)}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #7A0C2E, #E51B3E)", color: "#fff", fontWeight: 800, fontSize: "1.75rem" }}>
                        {candidate.person_one_name ? candidate.person_one_name.charAt(0) : "1"}
                      </div>
                    )}
                    {candidate.person_one_name && (
                      <div style={{ position: "absolute", bottom: 8, left: 8, right: 8, background: "rgba(36,19,26,0.85)", backdropFilter: "blur(4px)", color: "#ffffff", padding: "0.25rem 0.5rem", borderRadius: 8, textAlign: "center", fontSize: "0.75rem", fontWeight: 700 }}>
                        {candidate.person_one_name}
                      </div>
                    )}
                  </div>

                  {/* Person 2 */}
                  <div
                    style={{
                      borderRadius: 18,
                      overflow: "hidden",
                      background: "#FFF3F5",
                      aspectRatio: "3/4",
                      border: "1px solid #F0DCE2",
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                    }}
                    className="card-shadow"
                  >
                    {candidate.person_two_photo_url && !imgErrorTwo ? (
                      <img
                        src={candidate.person_two_photo_url}
                        alt={candidate.person_two_name ? `Portrait of ${candidate.person_two_name}` : `Portrait of ${candidate.name} (person 2)`}
                        width={300}
                        height={400}
                        loading="eager"
                        decoding="async"
                        onError={() => setImgErrorTwo(true)}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #4A061C, #7A0C2E)", color: "#fff", fontWeight: 800, fontSize: "1.75rem" }}>
                        {candidate.person_two_name ? candidate.person_two_name.charAt(0) : "2"}
                      </div>
                    )}
                    {candidate.person_two_name && (
                      <div style={{ position: "absolute", bottom: 8, left: 8, right: 8, background: "rgba(36,19,26,0.85)", backdropFilter: "blur(4px)", color: "#ffffff", padding: "0.25rem 0.5rem", borderRadius: 8, textAlign: "center", fontSize: "0.75rem", fontWeight: 700 }}>
                        {candidate.person_two_name}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    borderRadius: 24,
                    overflow: "hidden",
                    background: "linear-gradient(135deg, #FFF8FA, #FFF3F5)",
                    aspectRatio: "3/4",
                    marginBottom: "1.5rem",
                    border: "1px solid #F0DCE2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  className="card-shadow"
                >
                  {candidate.photo_url && !imgError ? (
                    <img
                      src={candidate.photo_url}
                      alt={`Photo of ${candidate.name}`}
                      width={600}
                      height={800}
                      loading="eager"
                      decoding="async"
                      onError={() => setImgError(true)}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <div style={{ width: 100, height: 100, borderRadius: "50%", background: "linear-gradient(135deg, #7A0C2E, #E51B3E)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: "2.5rem" }}>
                      {initials}
                    </div>
                  )}
                </div>
              )}

              {/* Vote count */}
              <div
                style={{
                  background: "#FFF8FA",
                  border: "1px solid #F0DCE2",
                  borderRadius: 16,
                  padding: "1.25rem",
                  textAlign: "center",
                  marginBottom: "1rem",
                }}
              >
                <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#6B6870", marginBottom: "0.375rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Current Votes
                </div>
                <div style={{ fontSize: "2.25rem", fontWeight: 900, color: "#E51B3E" }}>
                  {formatNumber(getCandidateScore(candidate))}
                </div>
                <div style={{ fontSize: "0.8125rem", color: "#7A0C2E", fontWeight: 700, marginTop: "0.25rem" }}>
                  ${isCouple ? "2.00" : "1.00"} per vote · {isCouple ? "Couple Entry" : "Individual Entry"}
                </div>
              </div>

              {/* Vote CTA */}
              <button
                className="btn-vote"
                style={{ width: "100%", justifyContent: "center", padding: "1rem", fontSize: "1.125rem", opacity: isPaused ? 0.5 : 1, cursor: isPaused ? "not-allowed" : "pointer" }}
                onClick={() => !isPaused && setVoteModalOpen(true)}
                disabled={isPaused}
                aria-label={isPaused ? "Voting paused for this candidate" : `Vote for ${candidate.name}`}
                id="profile-vote-btn"
              >
                <Vote size={20} />
                {isPaused ? "Voting Paused" : `Vote for ${candidateDisplayName}`}
              </button>
            </div>

            {/* Right — Bio */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                {isCouple ? (
                  <span
                    style={{
                      background: "#FFE1E8",
                      color: "#7A0C2E",
                      border: "1px solid #F0DCE2",
                      padding: "0.25rem 0.625rem",
                      borderRadius: 99,
                      fontSize: "0.75rem",
                      fontWeight: 800,
                      letterSpacing: "0.05em",
                    }}
                  >
                    COUPLE CANDIDATE
                  </span>
                ) : (
                  <span
                    style={{
                      background: "#F3F4F6",
                      color: "#374151",
                      padding: "0.25rem 0.625rem",
                      borderRadius: 99,
                      fontSize: "0.75rem",
                      fontWeight: 700,
                    }}
                  >
                    INDIVIDUAL
                  </span>
                )}
                <span className="badge" style={{ background: "#FFE1E8", color: "#7A0C2E" }}>{candidate.category}</span>
                {isPaused && <span className="badge badge-red">Voting Paused</span>}
              </div>

              <h1 style={{ fontSize: "clamp(1.875rem, 4vw, 2.75rem)", fontWeight: 900, color: "#24131A", margin: "0 0 0.5rem", letterSpacing: "-0.03em" }}>
                {candidateDisplayName}
              </h1>

              {isCouple && candidate.person_one_name && candidate.person_two_name && (
                <div style={{ fontSize: "1rem", color: "#7A0C2E", fontWeight: 700, marginBottom: "0.5rem" }}>
                  {candidate.person_one_name} & {candidate.person_two_name}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "1.5rem" }}>
                <User size={14} color="#9CA3AF" />
                <span style={{ fontSize: "1rem", color: "#6B6870" }}>{candidate.position}</span>
              </div>

              {candidate.description && (
                <p style={{ fontSize: "1.0625rem", color: "#24131A", lineHeight: 1.75, marginBottom: "2rem", borderLeft: "3px solid #E51B3E", paddingLeft: "1rem" }}>
                  {candidate.description}
                </p>
              )}

              {candidate.biography && (
                <section style={{ marginBottom: "2rem" }}>
                  <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "1.125rem", fontWeight: 700, color: "#24131A", marginBottom: "0.875rem" }}>
                    <MessageSquare size={18} color="#7A0C2E" />
                    Biography
                  </h2>
                  <p style={{ fontSize: "0.9375rem", color: "#6B6870", lineHeight: 1.8 }}>{candidate.biography}</p>
                </section>
              )}

              {candidate.vision && (
                <section
                  style={{
                    background: "linear-gradient(135deg, #FFF8FA, #FFF3F5)",
                    border: "1px solid #F0DCE2",
                    borderRadius: 16,
                    padding: "1.5rem",
                    marginBottom: "2rem",
                  }}
                >
                  <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "1.125rem", fontWeight: 700, color: "#7A0C2E", marginBottom: "0.75rem" }}>
                    <Eye size={18} color="#E51B3E" />
                    Vision & Message
                  </h2>
                  <p style={{ fontSize: "0.9375rem", color: "#24131A", lineHeight: 1.8, margin: 0 }}>{candidate.vision}</p>
                </section>
              )}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "1rem 1.25rem",
                  background: "#FFF8FA",
                  border: "1px solid #F0DCE2",
                  borderRadius: 12,
                }}
              >
                <TrendingUp size={16} color="#E51B3E" />
                <span style={{ fontSize: "0.9375rem", color: "#24131A" }}>
                  <strong style={{ color: "#E51B3E" }}>{formatNumber(getCandidateScore(candidate))}</strong>{" "}
                  votes received — keep voting to move them up!
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {voteModalOpen && (
        <VoteModal candidate={candidate} onClose={() => setVoteModalOpen(false)} />
      )}

      <style>{`
        @media (max-width: 768px) {
          .profile-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );
}
