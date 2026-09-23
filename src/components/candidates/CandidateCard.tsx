import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Vote, TrendingUp, User, Eye } from "lucide-react";
import { getVotePriceDollars, type Candidate } from "@/lib/supabase";
import { formatNumber } from "@/lib/utils";
import { VoteModal } from "@/components/voting/VoteModal";

interface CandidateCardProps {
  candidate: Candidate;
  rank?: number;
}

export function CandidateCard({ candidate, rank }: CandidateCardProps) {
  const [voteModalOpen, setVoteModalOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [imgErrorTwo, setImgErrorTwo] = useState(false);
  const navigate = useNavigate();

  const isPaused = candidate.status === "paused";
  const isCouple = candidate.candidate_type === "couple";
  const pricePerVote = getVotePriceDollars(candidate.candidate_type);

  const initials = candidate.name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const rankBadgeStyle = (r?: number) => {
    if (!r) return null;
    let bg = "#FFFFFF";
    let color = "#6B6870";
    let border = "#F0DCE2";

    if (r === 1) {
      bg = "#7A0C2E";
      color = "#FFFFFF";
      border = "#E51B3E";
    } else if (r === 2) {
      bg = "#FFE1E8";
      color = "#7A0C2E";
      border = "#F0DCE2";
    } else if (r === 3) {
      bg = "#FFF3F5";
      color = "#7A0C2E";
      border = "#F0DCE2";
    }

    return (
      <div
        style={{
          position: "absolute",
          top: "0.75rem",
          left: "0.75rem",
          background: bg,
          color: color,
          border: `1.5px solid ${border}`,
          borderRadius: 99,
          padding: "0.2rem 0.625rem",
          fontSize: "0.8125rem",
          fontWeight: 800,
          boxShadow: "0 2px 8px rgba(74, 6, 28, 0.12)",
          display: "flex",
          alignItems: "center",
          gap: "0.25rem",
          zIndex: 2,
        }}
      >
        <span>#{r}</span>
      </div>
    );
  };

  return (
    <>
      <article
        className="candidate-card"
        style={{
          width: "100%",
          background: "#FFFFFF",
          borderRadius: 16,
          border: "1px solid #F0DCE2",
          boxShadow: "0 4px 20px rgba(74, 6, 28, 0.05)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        aria-label={`Candidate: ${candidate.name}`}
      >
        {/* Photo Area */}
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "16/10",
            background: "linear-gradient(135deg, #FFF8FA 0%, #FFF3F5 100%)",
            overflow: "hidden",
            cursor: "pointer",
          }}
          onClick={() => navigate(`/candidate/${candidate.id}`)}
        >
          {/* Rank Badge */}
          {rankBadgeStyle(rank)}

          {/* Badges: Type (Couple / Individual) + Category Chip */}
          <div
            style={{
              position: "absolute",
              top: "0.75rem",
              right: "0.75rem",
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              zIndex: 2,
            }}
          >
            {isCouple ? (
              <span
                style={{
                  background: "#FFE1E8",
                  color: "#7A0C2E",
                  border: "1px solid #F0DCE2",
                  padding: "0.25rem 0.55rem",
                  borderRadius: 99,
                  fontSize: "0.6875rem",
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  boxShadow: "0 2px 6px rgba(74, 6, 28, 0.08)",
                }}
              >
                COUPLE
              </span>
            ) : (
              <span
                style={{
                  background: "#FFF3F5",
                  color: "#6B6870",
                  border: "1px solid #F0DCE2",
                  padding: "0.25rem 0.55rem",
                  borderRadius: 99,
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                }}
              >
                INDIVIDUAL
              </span>
            )}
            <div
              style={{
                background: "rgba(74, 6, 28, 0.88)",
                color: "#FFFFFF",
                padding: "0.25rem 0.625rem",
                borderRadius: 99,
                fontSize: "0.75rem",
                fontWeight: 700,
                backdropFilter: "blur(4px)",
              }}
            >
              {candidate.category}
            </div>
          </div>

          {/* Photo: Dual Photo for Couple, Single Photo for Individual */}
          {isCouple ? (
            <div style={{ display: "flex", width: "100%", height: "100%" }}>
              {/* Person 1 */}
              <div
                style={{
                  flex: 1,
                  height: "100%",
                  position: "relative",
                  overflow: "hidden",
                  borderRight: "1.5px solid rgba(255, 255, 255, 0.9)",
                }}
              >
                {candidate.person_one_photo_url || (candidate.photo_url && !imgError) ? (
                  <img
                    src={candidate.person_one_photo_url || candidate.photo_url!}
                    alt={candidate.person_one_name ? `Portrait of ${candidate.person_one_name}` : `Portrait of ${candidate.name} (person 1)`}
                    loading="lazy"
                    onError={() => setImgError(true)}
                    className="candidate-photo-img"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "linear-gradient(135deg, #7A0C2E, #E51B3E)",
                      color: "#FFFFFF",
                      fontWeight: 800,
                      fontSize: "1.25rem",
                    }}
                  >
                    {candidate.person_one_name ? candidate.person_one_name.charAt(0) : "1"}
                  </div>
                )}
                {candidate.person_one_name && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "0.375rem",
                      left: "0.375rem",
                      background: "rgba(36, 19, 26, 0.8)",
                      backdropFilter: "blur(4px)",
                      color: "#FFFFFF",
                      padding: "0.125rem 0.375rem",
                      borderRadius: 6,
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      maxWidth: "90%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {candidate.person_one_name.split(" ")[0]}
                  </div>
                )}
              </div>

              {/* Person 2 */}
              <div
                style={{
                  flex: 1,
                  height: "100%",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {candidate.person_two_photo_url && !imgErrorTwo ? (
                  <img
                    src={candidate.person_two_photo_url}
                    alt={candidate.person_two_name ? `Portrait of ${candidate.person_two_name}` : `Portrait of ${candidate.name} (person 2)`}
                    loading="lazy"
                    onError={() => setImgErrorTwo(true)}
                    className="candidate-photo-img"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "linear-gradient(135deg, #4A061C, #7A0C2E)",
                      color: "#FFFFFF",
                      fontWeight: 800,
                      fontSize: "1.25rem",
                    }}
                  >
                    {candidate.person_two_name ? candidate.person_two_name.charAt(0) : "2"}
                  </div>
                )}
                {candidate.person_two_name && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "0.375rem",
                      right: "0.375rem",
                      background: "rgba(36, 19, 26, 0.8)",
                      backdropFilter: "blur(4px)",
                      color: "#FFFFFF",
                      padding: "0.125rem 0.375rem",
                      borderRadius: 6,
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      maxWidth: "90%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {candidate.person_two_name.split(" ")[0]}
                  </div>
                )}
              </div>
            </div>
          ) : candidate.photo_url && !imgError ? (
            <img
              src={candidate.photo_url}
              alt={`Portrait of ${candidate.name}`}
              loading="lazy"
              onError={() => setImgError(true)}
              className="candidate-photo-img"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #7A0C2E, #E51B3E)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#FFFFFF",
                  fontWeight: 800,
                  fontSize: "1.75rem",
                }}
              >
                {initials}
              </div>
            </div>
          )}

          {/* Paused Banner */}
          {isPaused && (
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                background: "rgba(229, 27, 62, 0.95)",
                color: "#FFFFFF",
                padding: "0.375rem",
                textAlign: "center",
                fontSize: "0.75rem",
                fontWeight: 700,
              }}
            >
              Voting Paused
            </div>
          )}
        </div>

        {/* Content Section */}
        <div
          style={{
            padding: "1.125rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            flex: 1,
          }}
        >
          {/* Candidate Info */}
          <div>
            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: 800,
                color: "#24131A",
                margin: 0,
                lineHeight: 1.3,
                cursor: "pointer",
              }}
              onClick={() => navigate(`/candidate/${candidate.id}`)}
            >
              {candidate.name}
            </h3>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                marginTop: "0.25rem",
                fontSize: "0.875rem",
                color: "#6B6870",
              }}
            >
              <User size={13} color="#6B6870" />
              <span>{candidate.position}</span>
            </div>
          </div>

          {/* Vote count banner */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.5rem 0.75rem",
              background: "#FFF8FA",
              borderRadius: 12,
              border: "1px solid #F0DCE2",
              marginTop: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <TrendingUp size={15} color="#E51B3E" />
              <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#7A0C2E", textTransform: "uppercase" }}>
                Total Votes
              </span>
              <span
                style={{
                  fontSize: "0.6875rem",
                  background: isCouple ? "#FFE1E8" : "#FFF3F5",
                  color: isCouple ? "#7A0C2E" : "#6B6870",
                  fontWeight: 700,
                  padding: "0.0625rem 0.375rem",
                  borderRadius: 4,
                  border: "1px solid #F0DCE2",
                }}
              >
                ${pricePerVote}/vote
              </span>
            </div>
            <span
              style={{
                fontWeight: 900,
                fontSize: "1.125rem",
                color: "#7A0C2E",
              }}
            >
              {formatNumber(candidate.total_votes)}
            </span>
          </div>

          {/* Action Buttons: Large Touch-Target Vote Button */}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              className="btn-vote"
              disabled={isPaused}
              onClick={() => setVoteModalOpen(true)}
              style={{
                flex: 1,
                minHeight: 48,
                justifyContent: "center",
                fontSize: "1rem",
                fontWeight: 800,
                opacity: isPaused ? 0.5 : 1,
                cursor: isPaused ? "not-allowed" : "pointer",
              }}
              aria-label={`Vote for ${candidate.name} ($${pricePerVote} per vote)`}
            >
              <Vote size={18} />
              VOTE NOW
            </button>

            <button
              onClick={() => navigate(`/candidate/${candidate.id}`)}
              style={{
                width: 48,
                minHeight: 48,
                borderRadius: 12,
                border: "1.5px solid #F0DCE2",
                background: "#FFF8FA",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#7A0C2E",
                cursor: "pointer",
                flexShrink: 0,
                transition: "all 0.15s ease",
              }}
              aria-label={`View details of ${candidate.name}`}
              title="View Profile"
            >
              <Eye size={18} />
            </button>
          </div>
        </div>
      </article>

      {/* Vote Modal */}
      {voteModalOpen && (
        <VoteModal
          candidate={candidate}
          onClose={() => setVoteModalOpen(false)}
        />
      )}
    </>
  );
}
