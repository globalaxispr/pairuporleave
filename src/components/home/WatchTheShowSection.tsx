import { useState, useEffect } from "react";
import { Play, Radio, Calendar, ExternalLink, Vote, Clock } from "lucide-react";
import { YouTubeIcon } from "@/components/ui/YouTubeIcon";
import {
  fetchLiveShowSettings,
  supabase,
  type LiveShowSettings,
  DEFAULT_LIVE_SHOW_SETTINGS,
} from "@/lib/supabase";
import {
  extractYouTubeVideoId,
  buildYouTubeEmbedUrl,
  getYouTubeThumbnailUrl,
  getYouTubeWatchUrl,
  OFFICIAL_YOUTUBE_CHANNEL,
  OFFICIAL_YOUTUBE_HANDLE,
} from "@/lib/youtube";

export function WatchTheShowSection() {
  const [settings, setSettings] = useState<LiveShowSettings>(DEFAULT_LIVE_SHOW_SETTINGS);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const data = await fetchLiveShowSettings();
        if (isMounted) {
          setSettings(data);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void load();

    // Realtime subscription for broadcast status changes
    const channel = supabase
      .channel("watch-the-show-settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_show_settings" },
        (payload) => {
          if (payload.new && typeof payload.new === "object") {
            const updated = payload.new as Record<string, unknown>;
            setSettings((prev) => ({
              ...prev,
              is_enabled: updated.is_enabled !== undefined ? Boolean(updated.is_enabled) : prev.is_enabled,
              status: (updated.status as any) || prev.status,
              video_id: (updated.video_id as string | null) ?? prev.video_id,
              video_url: (updated.video_url as string | null) ?? prev.video_url,
              title: (updated.title as string) || prev.title,
              description: (updated.description as string | null) ?? prev.description,
              scheduled_start_time: (updated.scheduled_start_time as string | null) ?? prev.scheduled_start_time,
              channel_url: (updated.channel_url as string) || prev.channel_url,
            }));
            // Reset player state if video changes
            setIsPlaying(false);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  // If section is disabled by admin in settings, do not render
  if (!loading && !settings.is_enabled) {
    return null;
  }

  const { videoId } = extractYouTubeVideoId(settings.video_id || settings.video_url);
  const isLive = settings.status === "live" && Boolean(videoId);
  const isScheduled = settings.status === "scheduled";

  const embedUrl = videoId ? buildYouTubeEmbedUrl(videoId, { autoplay: true }) : "";
  const fallbackWatchUrl = videoId ? getYouTubeWatchUrl(videoId) : OFFICIAL_YOUTUBE_CHANNEL;
  const channelUrl = settings.channel_url || OFFICIAL_YOUTUBE_CHANNEL;
  const thumbnailUrl = videoId ? getYouTubeThumbnailUrl(videoId) : null;

  // Format scheduled date if present
  let formattedSchedule: string | null = null;
  if (settings.scheduled_start_time) {
    try {
      const d = new Date(settings.scheduled_start_time);
      formattedSchedule = new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(d);
    } catch {
      formattedSchedule = settings.scheduled_start_time;
    }
  }

  const handleVoteClick = () => {
    const el = document.getElementById("live-ranking");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    } else {
      window.location.href = "/candidates";
    }
  };

  return (
    <section
      id="watch-the-show"
      aria-label="Watch The Show Live Stream"
      style={{
        background: "linear-gradient(180deg, #FFFFFF 0%, #FFF8FA 100%)",
        borderTop: "1px solid #F0DCE2",
        borderBottom: "1px solid #F0DCE2",
        padding: "4rem 1rem",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background ambient lighting */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "10%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "900px",
          maxWidth: "100%",
          height: "400px",
          background: isLive
            ? "radial-gradient(circle, rgba(229, 27, 62, 0.08) 0%, rgba(255, 225, 232, 0) 70%)"
            : "radial-gradient(circle, rgba(122, 12, 46, 0.06) 0%, rgba(255, 225, 232, 0) 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div className="container-max" style={{ position: "relative", zIndex: 1 }}>
        {/* Header Block */}
        <div style={{ maxWidth: 840, margin: "0 auto 2.5rem", textAlign: "center" }}>
          {/* Status Eyebrow Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.35rem 0.9rem",
              borderRadius: 9999,
              fontSize: "0.75rem",
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: "1rem",
              background: isLive
                ? "rgba(229, 27, 62, 0.12)"
                : isScheduled
                ? "rgba(245, 158, 11, 0.12)"
                : "rgba(122, 12, 46, 0.08)",
              border: `1px solid ${
                isLive
                  ? "rgba(229, 27, 62, 0.35)"
                  : isScheduled
                  ? "rgba(245, 158, 11, 0.35)"
                  : "#F0DCE2"
              }`,
              color: isLive ? "#E51B3E" : isScheduled ? "#B45309" : "#7A0C2E",
            }}
          >
            {isLive ? (
              <>
                <span
                  style={{
                    position: "relative",
                    display: "inline-flex",
                    width: 9,
                    height: 9,
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      width: "100%",
                      height: "100%",
                      borderRadius: "50%",
                      background: "#E51B3E",
                      opacity: 0.75,
                      animation: "pulse-red 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                    }}
                  />
                  <span
                    style={{
                      position: "relative",
                      display: "inline-flex",
                      borderRadius: "50%",
                      width: 9,
                      height: 9,
                      background: "#E51B3E",
                    }}
                  />
                </span>
                <span>Live Broadcast Active</span>
              </>
            ) : isScheduled ? (
              <>
                <Calendar size={13} color="#B45309" />
                <span>Upcoming Live Broadcast</span>
              </>
            ) : (
              <>
                <Radio size={13} color="#7A0C2E" />
                <span>Pair Up or Leave Showroom</span>
              </>
            )}
          </div>

          {/* Section Main Title */}
          <h2
            style={{
              fontSize: "clamp(1.875rem, 4vw, 2.75rem)",
              fontWeight: 900,
              color: "#24131A",
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
              margin: "0 0 1rem",
            }}
          >
            {settings.title || "Watch The Show"}
          </h2>

          {/* Description */}
          <p
            style={{
              fontSize: "clamp(1rem, 1.8vw, 1.125rem)",
              color: "#6B6870",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {settings.description ||
              "Tune into the official live stream, follow the contestant drama in real time, and vote for your favorite couples before eliminations."}
          </p>
        </div>

        {/* Video Player Cinema Frame */}
        <div
          style={{
            maxWidth: 1040,
            margin: "0 auto",
            background: "#4A061C",
            borderRadius: 24,
            padding: "0.75rem",
            border: "1px solid rgba(240, 220, 226, 0.25)",
            boxShadow: isLive
              ? "0 20px 50px -10px rgba(229, 27, 62, 0.25), 0 8px 24px -6px rgba(74, 6, 28, 0.3)"
              : "0 20px 45px -10px rgba(74, 6, 28, 0.25), 0 8px 20px -6px rgba(74, 6, 28, 0.2)",
          }}
        >
          {/* 16:9 Video Aspect Container */}
          <div
            style={{
              position: "relative",
              width: "100%",
              paddingTop: "56.25%", // Strict 16:9 ratio — prevents any CLS
              borderRadius: 18,
              overflow: "hidden",
              background: "#1A0209",
            }}
          >
            {/* Active Iframe Player (Mounted only upon user intent) */}
            {isPlaying && videoId ? (
              <iframe
                src={embedUrl}
                title={settings.title || "Pair Up or Leave Broadcast"}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  border: "none",
                }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : videoId ? (
              /* Lightweight Facade Poster: 0 scripts loaded until interaction */
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  padding: "1.5rem",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  backgroundImage: thumbnailUrl
                    ? `linear-gradient(180deg, rgba(26, 2, 9, 0.3) 0%, rgba(26, 2, 9, 0.85) 100%), url(${thumbnailUrl})`
                    : "linear-gradient(135deg, #4A061C 0%, #24030D 100%)",
                }}
                onClick={() => setIsPlaying(true)}
                role="button"
                tabIndex={0}
                aria-label={`Play broadcast: ${settings.title}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setIsPlaying(true);
                  }
                }}
              >
                {/* Facade Top Bar */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      background: isLive ? "#E51B3E" : "rgba(74, 6, 28, 0.85)",
                      color: "#FFFFFF",
                      padding: "0.35rem 0.8rem",
                      borderRadius: 8,
                      fontSize: "0.75rem",
                      fontWeight: 800,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                      backdropFilter: "blur(6px)",
                    }}
                  >
                    {isLive ? (
                      <>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: "#FFFFFF",
                            animation: "pulse-red 1.5s infinite",
                          }}
                        />
                        <span>LIVE NOW</span>
                      </>
                    ) : isScheduled ? (
                      <>
                        <Clock size={12} />
                        <span>SCHEDULED</span>
                      </>
                    ) : (
                      <>
                        <YouTubeIcon size={14} />
                        <span>RECORDED EPISODE</span>
                      </>
                    )}
                  </div>

                  {formattedSchedule && (
                    <div
                      style={{
                        background: "rgba(0, 0, 0, 0.65)",
                        backdropFilter: "blur(6px)",
                        border: "1px solid rgba(255, 225, 232, 0.2)",
                        color: "#FFE1E8",
                        padding: "0.35rem 0.75rem",
                        borderRadius: 8,
                        fontSize: "0.75rem",
                        fontWeight: 600,
                      }}
                    >
                      {formattedSchedule}
                    </div>
                  )}
                </div>

                {/* Facade Center Play Button */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.75rem",
                    margin: "auto",
                  }}
                >
                  <button
                    type="button"
                    aria-label="Play broadcast"
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: "50%",
                      background: isLive
                        ? "linear-gradient(135deg, #E51B3E 0%, #C41030 100%)"
                        : "linear-gradient(135deg, #E51B3E 0%, #7A0C2E 100%)",
                      border: "3px solid rgba(255, 255, 255, 0.9)",
                      color: "#FFFFFF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: isLive
                        ? "0 0 30px rgba(229, 27, 62, 0.75)"
                        : "0 10px 25px rgba(0, 0, 0, 0.5)",
                      cursor: "pointer",
                      transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = "scale(1.08)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                    }}
                  >
                    <Play size={30} fill="#FFFFFF" style={{ marginLeft: 4 }} />
                  </button>
                  <span
                    style={{
                      color: "#FFFFFF",
                      fontWeight: 800,
                      fontSize: "0.9375rem",
                      textShadow: "0 2px 6px rgba(0,0,0,0.8)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {isLive ? "Click to Watch Live Stream" : "Watch Broadcast"}
                  </span>
                </div>

                {/* Facade Bottom Title Strip */}
                <div
                  style={{
                    background: "rgba(26, 2, 9, 0.75)",
                    backdropFilter: "blur(8px)",
                    border: "1px solid rgba(255, 225, 232, 0.15)",
                    borderRadius: 12,
                    padding: "0.75rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "1rem",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        color: "#FFFFFF",
                        fontWeight: 700,
                        fontSize: "0.9375rem",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {settings.title}
                    </div>
                    <div
                      style={{
                        color: "rgba(255, 225, 232, 0.75)",
                        fontSize: "0.75rem",
                        marginTop: 2,
                      }}
                    >
                      Official YouTube Stream • {OFFICIAL_YOUTUBE_HANDLE}
                    </div>
                  </div>
                  <div
                    style={{
                      color: "#FFE1E8",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      flexShrink: 0,
                    }}
                  >
                    Watch Now →
                  </div>
                </div>
              </div>
            ) : (
              /* Offline / Studio Showroom State (No video URL provided or offline) */
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "2rem",
                  textAlign: "center",
                  background: "linear-gradient(135deg, #4A061C 0%, #24030D 100%)",
                }}
              >
                {/* YouTube Branded TV Icon */}
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 20,
                    background: "rgba(255, 255, 255, 0.08)",
                    border: "1px solid rgba(255, 225, 232, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "1.25rem",
                  }}
                >
                  <YouTubeIcon size={36} color="#E51B3E" />
                </div>

                <h3
                  style={{
                    color: "#FFFFFF",
                    fontSize: "clamp(1.25rem, 2.5vw, 1.75rem)",
                    fontWeight: 800,
                    margin: "0 0 0.5rem",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {isScheduled ? "Upcoming Live Broadcast" : "Live Stream Currently Offline"}
                </h3>

                <p
                  style={{
                    color: "rgba(255, 225, 232, 0.85)",
                    fontSize: "0.9375rem",
                    maxWidth: 520,
                    lineHeight: 1.6,
                    margin: "0 0 1.5rem",
                  }}
                >
                  {isScheduled && formattedSchedule
                    ? `The next episode of PAIR UP OR LEAVE is scheduled to stream on ${formattedSchedule}. Subscribe to receive instant notifications.`
                    : "Catch all past episodes, uncensored confessionals, and exclusive contestant highlights on our official YouTube channel."}
                </p>

                <div
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                    justifyContent: "center",
                  }}
                >
                  <a
                    href={channelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      background: "#E51B3E",
                      color: "#FFFFFF",
                      padding: "0.75rem 1.35rem",
                      borderRadius: 12,
                      fontWeight: 800,
                      fontSize: "0.875rem",
                      textDecoration: "none",
                      boxShadow: "0 4px 14px rgba(229, 27, 62, 0.35)",
                      transition: "transform 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                    }}
                  >
                    <YouTubeIcon size={18} />
                    <span>Subscribe on YouTube</span>
                    <ExternalLink size={14} />
                  </a>

                  <button
                    type="button"
                    onClick={handleVoteClick}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      background: "rgba(255, 255, 255, 0.12)",
                      border: "1px solid rgba(255, 225, 232, 0.25)",
                      color: "#FFFFFF",
                      padding: "0.75rem 1.35rem",
                      borderRadius: 12,
                      fontWeight: 700,
                      fontSize: "0.875rem",
                      cursor: "pointer",
                    }}
                  >
                    <Vote size={16} color="#FF5475" />
                    <span>Support Candidates</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action Bar Beneath Player */}
          <div
            style={{
              padding: "1rem 0.75rem 0.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            {/* Left: Broadcast Information */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: "rgba(255, 225, 232, 0.12)",
                  border: "1px solid rgba(255, 225, 232, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <YouTubeIcon size={20} color="#FF5475" />
              </div>
              <div>
                <div
                  style={{
                    color: "#FFFFFF",
                    fontWeight: 700,
                    fontSize: "0.875rem",
                    lineHeight: 1.3,
                  }}
                >
                  Pair Up or Leave Official Channel
                </div>
                <div
                  style={{
                    color: "rgba(255, 225, 232, 0.7)",
                    fontSize: "0.75rem",
                  }}
                >
                  {OFFICIAL_YOUTUBE_HANDLE} • Official Live Partner
                </div>
              </div>
            </div>

            {/* Right: Action Buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              {videoId && (
                <a
                  href={fallbackWatchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    color: "#FFE1E8",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    textDecoration: "none",
                    padding: "0.5rem 0.75rem",
                    borderRadius: 8,
                    background: "rgba(255, 255, 255, 0.08)",
                    border: "1px solid rgba(255, 225, 232, 0.15)",
                    transition: "background 0.15s ease",
                  }}
                >
                  <span>Watch on YouTube</span>
                  <ExternalLink size={13} />
                </a>
              )}

              <a
                href={channelUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  background: "#E51B3E",
                  color: "#FFFFFF",
                  fontSize: "0.8125rem",
                  fontWeight: 800,
                  padding: "0.5rem 0.95rem",
                  borderRadius: 8,
                  textDecoration: "none",
                  boxShadow: "0 2px 8px rgba(229, 27, 62, 0.35)",
                }}
              >
                <YouTubeIcon size={15} />
                <span>Visit Channel</span>
              </a>

              <button
                type="button"
                onClick={handleVoteClick}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  background: "#FFE1E8",
                  color: "#7A0C2E",
                  fontSize: "0.8125rem",
                  fontWeight: 800,
                  padding: "0.5rem 0.95rem",
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <Vote size={15} color="#7A0C2E" />
                <span>Cast Votes</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
