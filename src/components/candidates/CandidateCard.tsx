import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Vote, TrendingUp, User, Eye } from "lucide-react";
import { getVotePriceDollars, getSingleVoteAllInPriceFormatted, IS_PLATFORM_SERVICE_FEE_ENABLED, type PublicCandidate, getCandidateScore } from "@/lib/supabase";
import { VoteModal } from "@/components/voting/VoteModal";
import { useCompetitionSchedule } from "@/hooks/useCompetitionSchedule";
import { CandidateShareButtons } from "@/components/candidates/CandidateShareButtons";

interface CandidateCardProps {
  candidate: PublicCandidate;
  rank?: number;
}

export function CandidateCard({ candidate, rank }: CandidateCardProps) {
  const [voteModalOpen, setVoteModalOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [imgErrorTwo, setImgErrorTwo] = useState(false);
  const navigate = useNavigate();
  const { isVotingClosed } = useCompetitionSchedule();

  const isPaused = candidate.status === "paused";
  const isCouple = candidate.candidate_type === "couple";
  const pricePerVote = getVotePriceDollars(candidate.candidate_type);
  const singleVoteAllIn = getSingleVoteAllInPriceFormatted(candidate.candidate_type);
  const voteScore = getCandidateScore(candidate);
  const formattedVotes = voteScore.toLocaleString("en-US");
  const voteCountFontSize =
    formattedVotes.length > 9
      ? "clamp(1.05rem, 3.8vw, 1.25rem)"
      : formattedVotes.length > 7
      ? "clamp(1.15rem, 4.2vw, 1.375rem)"
      : "clamp(1.25rem, 4.8vw, 1.5rem)";

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
          height: "100%",
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
        {/* Dedicated Metadata Row for Couple Candidates — Positions COUPLE and category badges cleanly outside the face area */}
        {isCouple && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "0.375rem",
              padding: "0.45rem 0.75rem",
              background: "#FFF8FA",
              borderBottom: "1px solid #F0DCE2",
              cursor: "pointer",
            }}
            onClick={() => navigate(`/candidate/${candidate.id}`)}
          >
            <span
              style={{
                background: "#FFE1E8",
                color: "#7A0C2E",
                border: "1px solid #F0DCE2",
                padding: "0.2rem 0.55rem",
                borderRadius: 99,
                fontSize: "0.6875rem",
                fontWeight: 800,
                letterSpacing: "0.04em",
                boxShadow: "0 1px 4px rgba(74, 6, 28, 0.06)",
              }}
            >
              COUPLE
            </span>
            <div
              style={{
                background: "rgba(74, 6, 28, 0.88)",
                color: "#FFFFFF",
                padding: "0.2rem 0.625rem",
                borderRadius: 99,
                fontSize: "0.75rem",
                fontWeight: 700,
              }}
            >
              {candidate.category}
            </div>
          </div>
        )}

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

          {/* Badges: Type (Individual) + Category Chip for Individual Cards Only */}
          {!isCouple && (
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
          )}

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
                    width={200}
                    height={250}
                    loading="lazy"
                    decoding="async"
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
                    width={200}
                    height={250}
                    loading="lazy"
                    decoding="async"
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
              width={400}
              height={250}
              loading="lazy"
              decoding="async"
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
            gap: "0.875rem",
            flex: 1,
            minWidth: 0,
          }}
        >
          {/* Candidate Info */}
          <div style={{ minWidth: 0 }}>
            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: 800,
                color: "#24131A",
                margin: 0,
                lineHeight: 1.35,
                overflowWrap: "break-word",
                wordBreak: "break-word",
              }}
            >
              <Link
                to={`/candidate/${candidate.id}`}
                style={{
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                {candidate.name}
              </Link>
            </h3>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                marginTop: "0.35rem",
                fontSize: "0.8125rem",
                color: "#6B6870",
                minWidth: 0,
              }}
            >
              <User size={13} color="#6B6870" style={{ flexShrink: 0 }} />
              <span style={{ overflowWrap: "break-word", minWidth: 0 }}>
                {candidate.position}
              </span>
            </div>
          </div>

          {/* Vote Information Area */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              alignItems: "center",
              gap: "0.75rem",
              padding: "0.75rem 0.875rem",
              background: "#FFF8FA",
              borderRadius: 12,
              border: "1px solid #F0DCE2",
              marginTop: "auto",
            }}
          >
            {/* Left Side: TOTAL VOTES label + prominent tabular vote count */}
            <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <TrendingUp size={13} color="#E51B3E" style={{ flexShrink: 0 }} />
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 800,
                    color: "#7A0C2E",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    lineHeight: 1.2,
                  }}
                >
                  Total Votes
                </span>
              </div>
              <div
                style={{
                  fontWeight: 900,
                  fontSize: voteCountFontSize,
                  color: "#7A0C2E",
                  lineHeight: 1.15,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.02em",
                  overflowWrap: "anywhere",
                }}
              >
                {formattedVotes}
              </div>
            </div>

            {/* Right Side: Base vote price + clear service fee indication */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                justifyContent: "center",
                gap: "0.25rem",
                paddingLeft: "0.75rem",
                borderLeft: "1px solid #F0DCE2",
                textAlign: "right",
                flexShrink: 0,
              }}
              title={
                IS_PLATFORM_SERVICE_FEE_ENABLED
                  ? `$${pricePerVote.toFixed(2)}/vote base (${singleVoteAllIn} total for 1 vote w/ service fee)`
                  : `$${pricePerVote.toFixed(2)}/vote`
              }
            >
              <span
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 800,
                  color: "#24131A",
                  lineHeight: 1.2,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                ${pricePerVote.toFixed(2)} / vote
              </span>
              {IS_PLATFORM_SERVICE_FEE_ENABLED && (
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    color: "#7A0C2E",
                    background: isCouple ? "#FFE1E8" : "#FFF3F5",
                    border: "1px solid #F0DCE2",
                    padding: "0.1rem 0.45rem",
                    borderRadius: 6,
                    lineHeight: 1.2,
                    whiteSpace: "nowrap",
                  }}
                >
                  + service fee
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons: Two Clean Rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%" }}>
            {/* Row 1: Primary Full-Width Vote Button */}
            <button
              className="btn-vote"
              disabled={isPaused || isVotingClosed}
              onClick={() => !isPaused && !isVotingClosed && setVoteModalOpen(true)}
              style={{
                width: "100%",
                minHeight: 48,
                borderRadius: 12,
                justifyContent: "center",
                fontSize: "1rem",
                fontWeight: 800,
                opacity: isPaused || isVotingClosed ? 0.5 : 1,
                cursor: isPaused || isVotingClosed ? "not-allowed" : "pointer",
                filter: isVotingClosed ? "grayscale(1)" : "none",
              }}
              aria-label={
                isVotingClosed
                  ? `Voting is closed for ${candidate.name}`
                  : `Vote for ${candidate.name} ($${pricePerVote} per vote)`
              }
            >
              <Vote size={18} />
              {isVotingClosed ? "VOTING CLOSED" : "VOTE NOW"}
            </button>

            {/* Row 2: Secondary Actions (Clean 3-Column Grid) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "0.5rem",
                width: "100%",
              }}
            >
              <Link
                to={`/candidate/${candidate.id}`}
                style={{
                  width: "100%",
                  minWidth: 0,
                  minHeight: 42,
                  padding: "0 0.5rem",
                  borderRadius: 10,
                  border: "1.5px solid #F0DCE2",
                  background: "#FFF8FA",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.35rem",
                  color: "#7A0C2E",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  textDecoration: "none",
                }}
                aria-label={`View details of ${candidate.name}`}
                title="View Profile"
              >
                <Eye size={15} style={{ flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  View
                </span>
              </Link>

              <CandidateShareButtons
                candidateId={candidate.id}
                candidateName={candidate.display_name || candidate.name}
                isCouple={isCouple}
                compact
              />
            </div>
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
