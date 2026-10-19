import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Clock, Calendar, CheckCircle2, Vote, Trophy, AlertTriangle } from "lucide-react";
import {
  fetchCompetitionSchedule,
  getCompetitionStatus,
  supabase,
  type CompetitionSchedule,
  type CompetitionStatus,
  DEFAULT_COMPETITION_SCHEDULE,
} from "@/lib/supabase";

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
}

function calculateTimeLeft(targetTimeMs: number, nowMs: number): TimeLeft {
  const diffMs = Math.max(0, targetTimeMs - nowMs);
  const totalSeconds = Math.floor(diffMs / 1000);

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds, totalSeconds };
}

export function CompetitionCountdownSection() {
  const [schedule, setSchedule] = useState<CompetitionSchedule>(DEFAULT_COMPETITION_SCHEDULE);
  const [status, setStatus] = useState<CompetitionStatus>("VOTING_OPEN");
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => {
    const endMs = new Date(DEFAULT_COMPETITION_SCHEDULE.end_time).getTime();
    return calculateTimeLeft(endMs, Date.now());
  });
  const [loading, setLoading] = useState(true);

  // Time drift synchronization
  const serverOffsetRef = useRef<number>(0);

  useEffect(() => {
    let isMounted = true;

    async function loadSchedule() {
      try {
        const clientFetchTime = Date.now();
        const data = await fetchCompetitionSchedule();
        if (!isMounted) return;

        // Calculate server time offset if possible
        if (data.updated_at) {
          const serverReported = new Date(data.updated_at).getTime();
          if (!isNaN(serverReported)) {
            serverOffsetRef.current = 0; // fallback clean
          }
        }

        setSchedule(data);
        const currentNow = Date.now() + serverOffsetRef.current;
        setStatus(getCompetitionStatus(data, currentNow));
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadSchedule();

    // Supabase Realtime subscription for instant countdown synchronization
    const channel = supabase
      .channel("competition-schedule-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "competition_schedule" },
        (payload) => {
          if (payload.new && typeof payload.new === "object") {
            const updated = payload.new as Record<string, unknown>;
            setSchedule((prev) => {
              const next: CompetitionSchedule = {
                ...prev,
                name: (updated.name as string) || prev.name,
                is_enabled: updated.is_enabled !== undefined ? Boolean(updated.is_enabled) : prev.is_enabled,
                start_time: (updated.start_time as string) || prev.start_time,
                end_time: (updated.end_time as string) || prev.end_time,
                timezone: (updated.timezone as string) || prev.timezone,
                title: (updated.title as string) || prev.title,
                description: (updated.description as string | null) ?? prev.description,
              };
              const currentNow = Date.now() + serverOffsetRef.current;
              setStatus(getCompetitionStatus(next, currentNow));
              return next;
            });
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  // High-precision 1-second interval tick without unnecessary layout recalculations
  useEffect(() => {
    const tick = () => {
      const nowMs = Date.now() + serverOffsetRef.current;
      const currentStatus = getCompetitionStatus(schedule, nowMs);
      setStatus(currentStatus);

      let targetMs = 0;
      if (currentStatus === "UPCOMING") {
        targetMs = new Date(schedule.start_time).getTime();
      } else if (currentStatus === "VOTING_OPEN") {
        targetMs = new Date(schedule.end_time).getTime();
      }

      if (targetMs > 0) {
        setTimeLeft(calculateTimeLeft(targetMs, nowMs));
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 });
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [schedule]);

  // If countdown is disabled by admin, hide gracefully
  if (!loading && !schedule.is_enabled) {
    return null;
  }

  // Format dates in user-configured timezone
  const formatDateTime = (isoString: string) => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: schedule.timezone || "America/New_York",
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date(isoString));
    } catch {
      return isoString;
    }
  };

  const isVotingOpen = status === "VOTING_OPEN";
  const isUpcoming = status === "UPCOMING";
  const isClosed = status === "VOTING_CLOSED";

  return (
    <section
      id="competition-countdown"
      aria-label="Competition Voting Countdown"
      style={{
        background: "linear-gradient(180deg, #FFFFFF 0%, #FFF5F7 100%)",
        borderTop: "1px solid #F0DCE2",
        borderBottom: "1px solid #F0DCE2",
        padding: "3.5rem 1rem",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background decorative glow */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "900px",
          maxWidth: "100%",
          height: "350px",
          background: isVotingOpen
            ? "radial-gradient(circle, rgba(229, 27, 62, 0.08) 0%, rgba(255, 225, 232, 0) 70%)"
            : "radial-gradient(circle, rgba(122, 12, 46, 0.06) 0%, rgba(255, 225, 232, 0) 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div className="container-max" style={{ position: "relative", zIndex: 1, maxWidth: 1040, margin: "0 auto" }}>
        {/* Header Block */}
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          {/* Eyebrow Status Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.35rem 0.95rem",
              borderRadius: 9999,
              fontSize: "0.75rem",
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: "1rem",
              background: isVotingOpen
                ? "rgba(229, 27, 62, 0.12)"
                : isUpcoming
                ? "rgba(245, 158, 11, 0.12)"
                : "rgba(107, 104, 112, 0.12)",
              border: `1px solid ${
                isVotingOpen
                  ? "rgba(229, 27, 62, 0.35)"
                  : isUpcoming
                  ? "rgba(245, 158, 11, 0.35)"
                  : "#F0DCE2"
              }`,
              color: isVotingOpen ? "#E51B3E" : isUpcoming ? "#B45309" : "#6B6870",
            }}
          >
            {isVotingOpen ? (
              <>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#E51B3E",
                    animation: "pulse-red 1.5s infinite",
                  }}
                />
                <span>VOTING OPEN — OFFICIAL COUNTDOWN</span>
              </>
            ) : isUpcoming ? (
              <>
                <Calendar size={13} color="#B45309" />
                <span>UPCOMING COMPETITION ROUND</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={13} color="#6B6870" />
                <span>VOTING PERIOD CONCLUDED</span>
              </>
            )}
          </div>

          {/* Section Main Title */}
          <h2
            style={{
              fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)",
              fontWeight: 900,
              color: "#24131A",
              letterSpacing: "-0.03em",
              lineHeight: 1.2,
              margin: "0 0 0.75rem",
            }}
          >
            {isVotingOpen
              ? schedule.title || "Official Voting Closes In"
              : isUpcoming
              ? "Voting Opens Soon"
              : "Voting Has Officially Closed"}
          </h2>

          <p
            style={{
              fontSize: "clamp(0.9375rem, 1.8vw, 1.0625rem)",
              color: "#6B6870",
              maxWidth: 680,
              margin: "0 auto",
              lineHeight: 1.6,
            }}
          >
            {isVotingOpen
              ? schedule.description ||
                "Every vote changes the live leaderboard. Cast your votes for your favorite couples and individual candidates before the clock reaches zero!"
              : isUpcoming
              ? `Get ready! Voting officially begins on ${formatDateTime(schedule.start_time)}. Support starts at $1/vote.`
              : `The competition deadline of ${formatDateTime(schedule.end_time)} has passed. Final results and standings are locked.`}
          </p>
        </div>

        {/* 3-State Timer Frame */}
        {isClosed ? (
          /* VOTING CLOSED STATE */
          <div
            style={{
              background: "#FFFFFF",
              border: "1.5px solid #F0DCE2",
              borderRadius: 24,
              padding: "2.5rem 1.5rem",
              textAlign: "center",
              boxShadow: "0 4px 20px rgba(74, 6, 28, 0.04)",
              maxWidth: 720,
              margin: "0 auto",
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "rgba(122, 12, 46, 0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1.25rem",
              }}
            >
              <Trophy size={32} color="#7A0C2E" />
            </div>
            <h3
              style={{
                fontSize: "1.5rem",
                fontWeight: 800,
                color: "#24131A",
                margin: "0 0 0.5rem",
              }}
            >
              Voting is Closed for this Competition
            </h3>
            <p style={{ color: "#6B6870", fontSize: "0.9375rem", margin: "0 0 1.5rem" }}>
              Thank you for participating! Check out the final leaderboard and official results below.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                to="/ranking"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  background: "#7A0C2E",
                  color: "#FFFFFF",
                  padding: "0.85rem 1.75rem",
                  borderRadius: 12,
                  fontWeight: 800,
                  fontSize: "0.9375rem",
                  textDecoration: "none",
                  boxShadow: "0 4px 14px rgba(122, 12, 46, 0.25)",
                }}
              >
                <Trophy size={18} />
                <span>View Final Rankings</span>
              </Link>
              <Link
                to="/results"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  background: "#FFE1E8",
                  color: "#7A0C2E",
                  padding: "0.85rem 1.75rem",
                  borderRadius: 12,
                  fontWeight: 800,
                  fontSize: "0.9375rem",
                  textDecoration: "none",
                  border: "1px solid #F0DCE2",
                }}
              >
                <span>Full Results Table</span>
              </Link>
            </div>
          </div>
        ) : (
          /* ACTIVE / UPCOMING COUNTDOWN TIMER */
          <div
            role="timer"
            aria-label="Competition countdown clock"
            style={{
              background: "#4A061C",
              borderRadius: 24,
              padding: "2rem 1.5rem",
              boxShadow: isVotingOpen
                ? "0 20px 50px -10px rgba(229, 27, 62, 0.25), 0 8px 24px -6px rgba(74, 6, 28, 0.3)"
                : "0 20px 45px -10px rgba(74, 6, 28, 0.25)",
              border: "1px solid rgba(240, 220, 226, 0.25)",
              maxWidth: 820,
              margin: "0 auto",
            }}
          >
            {/* 4-Unit Grid (Days, Hours, Minutes, Seconds) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "clamp(0.5rem, 2vw, 1.5rem)",
                marginBottom: "1.75rem",
              }}
            >
              {[
                { label: "DAYS", value: timeLeft.days },
                { label: "HOURS", value: timeLeft.hours },
                { label: "MINUTES", value: timeLeft.minutes },
                { label: "SECONDS", value: timeLeft.seconds },
              ].map((unit) => (
                <div
                  key={unit.label}
                  style={{
                    background: "rgba(26, 2, 9, 0.65)",
                    border: "1px solid rgba(255, 225, 232, 0.15)",
                    borderRadius: 16,
                    padding: "clamp(0.75rem, 2vw, 1.25rem) 0.5rem",
                    textAlign: "center",
                    boxShadow: "inset 0 1px 1px rgba(255, 255, 255, 0.1)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "clamp(1.75rem, 5.5vw, 3.5rem)",
                      fontWeight: 900,
                      color: "#FFFFFF",
                      lineHeight: 1,
                      fontVariantNumeric: "tabular-nums",
                      letterSpacing: "-0.04em",
                      textShadow: "0 2px 10px rgba(0, 0, 0, 0.5)",
                    }}
                  >
                    {String(unit.value).padStart(2, "0")}
                  </div>
                  <div
                    style={{
                      fontSize: "clamp(0.625rem, 1.4vw, 0.8125rem)",
                      fontWeight: 800,
                      color: "#FF5475",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      marginTop: "0.5rem",
                    }}
                  >
                    {unit.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Schedule Footnote & Action */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "1rem",
                paddingTop: "1.25rem",
                borderTop: "1px solid rgba(255, 225, 232, 0.15)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#FFE1E8", fontSize: "0.8125rem" }}>
                <Clock size={16} color="#FF5475" />
                <span>
                  <strong>Deadline:</strong> {formatDateTime(schedule.end_time)}
                </span>
              </div>

              {isVotingOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById("live-ranking");
                    if (el) {
                      el.scrollIntoView({ behavior: "smooth" });
                    } else {
                      window.location.href = "/candidates";
                    }
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    background: "#E51B3E",
                    color: "#FFFFFF",
                    padding: "0.65rem 1.4rem",
                    borderRadius: 10,
                    fontWeight: 800,
                    fontSize: "0.875rem",
                    border: "none",
                    cursor: "pointer",
                    boxShadow: "0 3px 12px rgba(229, 27, 62, 0.4)",
                    transition: "transform 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                  }}
                >
                  <Vote size={16} />
                  <span>Vote Now Before Time Runs Out</span>
                </button>
              ) : (
                <Link
                  to="/candidates"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    background: "#FFE1E8",
                    color: "#7A0C2E",
                    padding: "0.65rem 1.4rem",
                    borderRadius: 10,
                    fontWeight: 800,
                    fontSize: "0.875rem",
                    textDecoration: "none",
                  }}
                >
                  <span>Meet The Contestants</span>
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
