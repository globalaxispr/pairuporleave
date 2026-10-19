import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import {
  Radio,
  Calendar,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Save,
  Play,
  Eye,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { YouTubeIcon } from "@/components/ui/YouTubeIcon";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AutoVideoOverlay } from "@/components/video/AutoVideoOverlay";
import {
  fetchLiveShowSettings,
  updateLiveShowSettings,
  type LiveShowSettings,
  type LiveShowStatus,
  DEFAULT_LIVE_SHOW_SETTINGS,
} from "@/lib/supabase";
import {
  extractYouTubeVideoId,
  buildYouTubeEmbedUrl,
  getYouTubeThumbnailUrl,
  OFFICIAL_YOUTUBE_CHANNEL,
  OFFICIAL_YOUTUBE_HANDLE,
} from "@/lib/youtube";

export function AdminLiveShowPage() {
  const [settings, setSettings] = useState<LiveShowSettings>(DEFAULT_LIVE_SHOW_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Form local state
  const [isEnabled, setIsEnabled] = useState(true);
  const [autoOpenOverlay, setAutoOpenOverlay] = useState(false);
  const [status, setStatus] = useState<LiveShowStatus>("offline");
  const [videoUrlInput, setVideoUrlInput] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [channelUrl, setChannelUrl] = useState(OFFICIAL_YOUTUBE_CHANNEL);

  // Interactive preview state
  const [previewPlaying, setPreviewPlaying] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchLiveShowSettings();
        setSettings(data);
        setIsEnabled(data.is_enabled);
        setAutoOpenOverlay(Boolean(data.auto_open_overlay));
        setStatus(data.status);
        setVideoUrlInput(data.video_url || data.video_id || "");
        setTitle(data.title || "");
        setDescription(data.description || "");
        setScheduledTime(
          data.scheduled_start_time
            ? new Date(data.scheduled_start_time).toISOString().slice(0, 16)
            : ""
        );
        setChannelUrl(data.channel_url || OFFICIAL_YOUTUBE_CHANNEL);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  // Real-time validation of the video URL input
  const validation = extractYouTubeVideoId(videoUrlInput);
  const parsedVideoId = validation.videoId;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);

    // If a video URL was entered, ensure it parses to a valid ID
    if (videoUrlInput.trim() && !parsedVideoId) {
      setSaving(false);
      setSaveMessage({
        type: "error",
        text: validation.error || "Please enter a valid YouTube video URL or 11-character video ID.",
      });
      return;
    }

    try {
      const payload: Partial<LiveShowSettings> = {
        is_enabled: isEnabled,
        auto_open_overlay: autoOpenOverlay,
        status: status,
        video_id: parsedVideoId || null,
        video_url: videoUrlInput.trim() || null,
        title: title.trim() || DEFAULT_LIVE_SHOW_SETTINGS.title,
        description: description.trim() || null,
        scheduled_start_time: scheduledTime ? new Date(scheduledTime).toISOString() : null,
        channel_url: channelUrl.trim() || OFFICIAL_YOUTUBE_CHANNEL,
      };

      const result = await updateLiveShowSettings(payload);

      if (result.success) {
        setSettings((prev) => ({ ...prev, ...payload }));
        setSaveMessage({
          type: "success",
          text: result.error
            ? result.error
            : "YouTube Live Show settings updated successfully! Changes are live on the homepage.",
        });
      } else {
        setSaveMessage({
          type: "error",
          text: result.error || "Failed to update settings.",
        });
      }
    } catch (err: any) {
      setSaveMessage({
        type: "error",
        text: err?.message || "An unexpected error occurred while saving.",
      });
    } finally {
      setSaving(false);
    }
  };

  const previewEmbedUrl = parsedVideoId
    ? buildYouTubeEmbedUrl(parsedVideoId, { autoplay: true })
    : "";
  const previewThumbnail = parsedVideoId
    ? getYouTubeThumbnailUrl(parsedVideoId)
    : null;

  return (
    <AdminLayout>
      <Helmet>
        <title>YouTube Live Management — Pair Up or Leave Admin</title>
      </Helmet>

      <div style={{ maxWidth: 1200, margin: "0 auto", paddingBottom: "3rem" }}>
        {/* Top Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <span style={{ fontSize: "0.8125rem", color: "#6B6870", fontWeight: 600 }}>Admin</span>
              <span style={{ color: "#F0DCE2" }}>/</span>
              <span style={{ fontSize: "0.8125rem", color: "#7A0C2E", fontWeight: 700 }}>YouTube Live</span>
            </div>
            <h1
              style={{
                fontSize: "1.875rem",
                fontWeight: 800,
                color: "#24131A",
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <YouTubeIcon size={30} color="#E51B3E" />
              <span>YouTube Live Show Management</span>
            </h1>
            <p style={{ color: "#6B6870", margin: "0.375rem 0 0", fontSize: "0.9375rem" }}>
              Control the homepage live broadcast experience, active streams, upcoming events, and official YouTube links.
            </p>
          </div>

          {/* Current Live Status Pill */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.625rem",
              padding: "0.5rem 1rem",
              borderRadius: 12,
              background: "#FFFFFF",
              border: "1px solid #F0DCE2",
              boxShadow: "0 2px 8px rgba(74, 6, 28, 0.04)",
            }}
          >
            <span style={{ fontSize: "0.8125rem", color: "#6B6870", fontWeight: 600 }}>Live State:</span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.25rem 0.625rem",
                borderRadius: 9999,
                fontSize: "0.75rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                background:
                  status === "live"
                    ? "rgba(229, 27, 62, 0.12)"
                    : status === "scheduled"
                    ? "rgba(245, 158, 11, 0.12)"
                    : "rgba(107, 104, 112, 0.12)",
                color:
                  status === "live"
                    ? "#E51B3E"
                    : status === "scheduled"
                    ? "#B45309"
                    : "#6B6870",
              }}
            >
              {status === "live" && (
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#E51B3E",
                  }}
                />
              )}
              {status}
            </span>
          </div>
        </div>

        {/* Feedback / Save Banner */}
        {saveMessage && (
          <div
            style={{
              padding: "1rem 1.25rem",
              borderRadius: 12,
              marginBottom: "1.75rem",
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              background:
                saveMessage.type === "success"
                  ? "rgba(34, 197, 94, 0.1)"
                  : "rgba(239, 68, 68, 0.1)",
              border: `1px solid ${
                saveMessage.type === "success" ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"
              }`,
              color: saveMessage.type === "success" ? "#15803D" : "#B91C1C",
              fontSize: "0.875rem",
              lineHeight: 1.5,
            }}
          >
            {saveMessage.type === "success" ? (
              <CheckCircle2 size={20} style={{ flexShrink: 0, marginTop: 1 }} />
            ) : (
              <AlertCircle size={20} style={{ flexShrink: 0, marginTop: 1 }} />
            )}
            <div>{saveMessage.text}</div>
          </div>
        )}

        {/* Two-Column Layout: Form (Left) & Realtime Preview (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Form Controls */}
          <div className="lg:col-span-7">
            <form
              onSubmit={handleSave}
              style={{
                background: "#FFFFFF",
                border: "1px solid #F0DCE2",
                borderRadius: 20,
                padding: "2rem",
                boxShadow: "0 4px 20px rgba(74, 6, 28, 0.04)",
                display: "flex",
                flexDirection: "column",
                gap: "1.75rem",
              }}
            >
              {/* 1. Homepage Section Visibility Switch */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1rem 1.25rem",
                  borderRadius: 14,
                  background: isEnabled ? "#FFF8FA" : "#F9F9FB",
                  border: "1px solid #F0DCE2",
                }}
              >
                <div>
                  <label
                    htmlFor="enable-toggle"
                    style={{
                      display: "block",
                      fontSize: "0.9375rem",
                      fontWeight: 800,
                      color: "#24131A",
                      cursor: "pointer",
                    }}
                  >
                    Enable Homepage "Watch The Show" Section
                  </label>
                  <p style={{ fontSize: "0.8125rem", color: "#6B6870", margin: "0.25rem 0 0" }}>
                    When toggled off, the live section is completely hidden from public visitors.
                  </p>
                </div>
                <input
                  id="enable-toggle"
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                  style={{
                    width: 22,
                    height: 22,
                    accentColor: "#E51B3E",
                    cursor: "pointer",
                  }}
                />
              </div>

              {/* 2. Auto-Open Video on Website Switch */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  padding: "1.25rem",
                  borderRadius: 14,
                  background: autoOpenOverlay ? "#FFF5F7" : "#F9F9FB",
                  border: autoOpenOverlay ? "1.5px solid #FF5475" : "1px solid #F0DCE2",
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <label
                        htmlFor="auto-overlay-toggle"
                        style={{
                          display: "block",
                          fontSize: "0.9375rem",
                          fontWeight: 800,
                          color: "#24131A",
                          cursor: "pointer",
                        }}
                      >
                        Auto-Open Video on Website
                      </label>
                      <span
                        style={{
                          fontSize: "0.6875rem",
                          fontWeight: 800,
                          padding: "0.15rem 0.5rem",
                          borderRadius: 6,
                          background: autoOpenOverlay ? "#FFE1E8" : "#EDECEF",
                          color: autoOpenOverlay ? "#7A0C2E" : "#6B6870",
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                        }}
                      >
                        {autoOpenOverlay ? "Overlay Enabled" : "Overlay Disabled"}
                      </span>
                    </div>
                    <p style={{ fontSize: "0.8125rem", color: "#6B6870", margin: "0.35rem 0 0", lineHeight: 1.5 }}>
                      When visitors enter the website, automatically open this configured video in a cinema overlay modal with autoplay (muted by default per browser autoplay policy with one-click sound enablement).
                    </p>
                  </div>

                  <input
                    id="auto-overlay-toggle"
                    type="checkbox"
                    checked={autoOpenOverlay}
                    onChange={(e) => setAutoOpenOverlay(e.target.checked)}
                    style={{
                      width: 22,
                      height: 22,
                      accentColor: "#E51B3E",
                      cursor: "pointer",
                      marginTop: 2,
                    }}
                  />
                </div>

                {/* Auto-Open Overlay Actions and Details */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingTop: "0.75rem",
                    borderTop: "1px dashed rgba(240, 220, 226, 0.8)",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                  }}
                >
                  <div style={{ fontSize: "0.75rem", color: "#7A0C2E", fontWeight: 600 }}>
                    {autoOpenOverlay
                      ? "✓ Overlay triggers once per visitor browser session (sessionStorage protected)."
                      : "• When disabled, the video only renders inside the homepage section."}
                  </div>

                  {parsedVideoId && (
                    <button
                      type="button"
                      onClick={() => {
                        window.dispatchEvent(
                          new CustomEvent("pairup:preview-overlay", {
                            detail: {
                              ...settings,
                              is_enabled: isEnabled,
                              auto_open_overlay: true,
                              status: status,
                              video_id: parsedVideoId,
                              video_url: videoUrlInput.trim(),
                              title: title.trim() || DEFAULT_LIVE_SHOW_SETTINGS.title,
                              description: description.trim() || null,
                              channel_url: channelUrl.trim() || OFFICIAL_YOUTUBE_CHANNEL,
                            },
                          })
                        );
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.375rem",
                        padding: "0.35rem 0.75rem",
                        borderRadius: 8,
                        background: "#7A0C2E",
                        color: "#FFFFFF",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        border: "none",
                        cursor: "pointer",
                        boxShadow: "0 2px 6px rgba(122, 12, 46, 0.25)",
                      }}
                    >
                      <Sparkles size={12} color="#FF5475" />
                      <span>Test Video Overlay Modal</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 3. Broadcast Status Selector (3 States) */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 800,
                    color: "#24131A",
                    marginBottom: "0.625rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Broadcast Status
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* LIVE */}
                  <button
                    type="button"
                    onClick={() => setStatus("live")}
                    style={{
                      padding: "1rem",
                      borderRadius: 12,
                      border: status === "live" ? "2px solid #E51B3E" : "1px solid #F0DCE2",
                      background: status === "live" ? "rgba(229, 27, 62, 0.06)" : "#FFFFFF",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.375rem" }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "#E51B3E",
                        }}
                      />
                      <span style={{ fontWeight: 800, fontSize: "0.875rem", color: "#E51B3E" }}>
                        LIVE
                      </span>
                    </div>
                    <p style={{ fontSize: "0.75rem", color: "#6B6870", margin: 0, lineHeight: 1.4 }}>
                      Active broadcast. Displays pulsing red LIVE badge.
                    </p>
                  </button>

                  {/* SCHEDULED */}
                  <button
                    type="button"
                    onClick={() => setStatus("scheduled")}
                    style={{
                      padding: "1rem",
                      borderRadius: 12,
                      border: status === "scheduled" ? "2px solid #B45309" : "1px solid #F0DCE2",
                      background: status === "scheduled" ? "rgba(245, 158, 11, 0.06)" : "#FFFFFF",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.375rem" }}>
                      <Calendar size={13} color="#B45309" />
                      <span style={{ fontWeight: 800, fontSize: "0.875rem", color: "#B45309" }}>
                        SCHEDULED
                      </span>
                    </div>
                    <p style={{ fontSize: "0.75rem", color: "#6B6870", margin: 0, lineHeight: 1.4 }}>
                      Upcoming stream. Shows scheduled date & reminder.
                    </p>
                  </button>

                  {/* OFFLINE */}
                  <button
                    type="button"
                    onClick={() => setStatus("offline")}
                    style={{
                      padding: "1rem",
                      borderRadius: 12,
                      border: status === "offline" ? "2px solid #7A0C2E" : "1px solid #F0DCE2",
                      background: status === "offline" ? "rgba(122, 12, 46, 0.06)" : "#FFFFFF",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.375rem" }}>
                      <Radio size={13} color="#7A0C2E" />
                      <span style={{ fontWeight: 800, fontSize: "0.875rem", color: "#7A0C2E" }}>
                        OFFLINE
                      </span>
                    </div>
                    <p style={{ fontSize: "0.75rem", color: "#6B6870", margin: 0, lineHeight: 1.4 }}>
                      No active stream. Shows channel showroom or episode.
                    </p>
                  </button>
                </div>
              </div>

              {/* 3. YouTube Video URL or ID */}
              <div>
                <label
                  htmlFor="video-url"
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 800,
                    color: "#24131A",
                    marginBottom: "0.5rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  YouTube Broadcast URL or Video ID
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    id="video-url"
                    type="text"
                    value={videoUrlInput}
                    onChange={(e) => setVideoUrlInput(e.target.value)}
                    placeholder="https://youtube.com/live/VIDEO_ID or https://www.youtube.com/watch?v=VIDEO_ID"
                    style={{
                      width: "100%",
                      padding: "0.85rem 1rem",
                      borderRadius: 12,
                      border: `1.5px solid ${
                        !videoUrlInput.trim()
                          ? "#F0DCE2"
                          : parsedVideoId
                          ? "#22C55E"
                          : "#EF4444"
                      }`,
                      fontSize: "0.9375rem",
                      color: "#24131A",
                      outline: "none",
                      background: "#FFFFFF",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
                    }}
                  />
                </div>

                {/* Validation Status Notice */}
                {videoUrlInput.trim() && (
                  <div style={{ marginTop: "0.5rem" }}>
                    {parsedVideoId ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          color: "#15803D",
                          fontSize: "0.8125rem",
                          fontWeight: 600,
                        }}
                      >
                        <CheckCircle2 size={16} />
                        <span>
                          Verified YouTube Video ID: <code>{parsedVideoId}</code> (Embed Ready via youtube-nocookie)
                        </span>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "0.5rem",
                          color: "#B91C1C",
                          fontSize: "0.8125rem",
                          lineHeight: 1.4,
                        }}
                      >
                        <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>{validation.error}</span>
                      </div>
                    )}
                  </div>
                )}
                <p style={{ fontSize: "0.75rem", color: "#6B6870", margin: "0.375rem 0 0" }}>
                  Accepts standard links (<code>youtube.com/watch?v=...</code>), live links (<code>youtube.com/live/...</code>), shortlinks (<code>youtu.be/...</code>), or raw 11-char IDs. Channel links are automatically detected and flagged.
                </p>
              </div>

              {/* 4. Broadcast Title */}
              <div>
                <label
                  htmlFor="broadcast-title"
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 800,
                    color: "#24131A",
                    marginBottom: "0.5rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Section Title / Heading
                </label>
                <input
                  id="broadcast-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="PAIR UP OR LEAVE — Official Live Show"
                  style={{
                    width: "100%",
                    padding: "0.85rem 1rem",
                    borderRadius: 12,
                    border: "1.5px solid #F0DCE2",
                    fontSize: "0.9375rem",
                    color: "#24131A",
                  }}
                />
              </div>

              {/* 5. Broadcast Description */}
              <div>
                <label
                  htmlFor="broadcast-desc"
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 800,
                    color: "#24131A",
                    marginBottom: "0.5rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Description (Optional)
                </label>
                <textarea
                  id="broadcast-desc"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tune into the official live stream, follow the contestant drama in real time, and vote for your favorite couples before eliminations."
                  style={{
                    width: "100%",
                    padding: "0.85rem 1rem",
                    borderRadius: 12,
                    border: "1.5px solid #F0DCE2",
                    fontSize: "0.9375rem",
                    color: "#24131A",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
              </div>

              {/* 6. Scheduled Broadcast Time (when scheduled) */}
              {status === "scheduled" && (
                <div
                  style={{
                    padding: "1.25rem",
                    background: "rgba(245, 158, 11, 0.06)",
                    border: "1px solid rgba(245, 158, 11, 0.25)",
                    borderRadius: 14,
                  }}
                >
                  <label
                    htmlFor="scheduled-time"
                    style={{
                      display: "block",
                      fontSize: "0.875rem",
                      fontWeight: 800,
                      color: "#92400E",
                      marginBottom: "0.5rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Scheduled Stream Date & Time
                  </label>
                  <input
                    id="scheduled-time"
                    type="datetime-local"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.75rem 1rem",
                      borderRadius: 10,
                      border: "1px solid #F0DCE2",
                      fontSize: "0.9375rem",
                      color: "#24131A",
                      background: "#FFFFFF",
                    }}
                  />
                  <p style={{ fontSize: "0.75rem", color: "#B45309", margin: "0.375rem 0 0" }}>
                    Visitors will see this date/time formatted in their local timezone.
                  </p>
                </div>
              )}

              {/* 7. Official YouTube Channel URL */}
              <div>
                <label
                  htmlFor="channel-url"
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 800,
                    color: "#24131A",
                    marginBottom: "0.5rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Official YouTube Channel Link
                </label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    id="channel-url"
                    type="url"
                    value={channelUrl}
                    onChange={(e) => setChannelUrl(e.target.value)}
                    placeholder="https://youtube.com/@pairuporleave"
                    style={{
                      flex: 1,
                      padding: "0.85rem 1rem",
                      borderRadius: 12,
                      border: "1.5px solid #F0DCE2",
                      fontSize: "0.9375rem",
                      color: "#24131A",
                    }}
                  />
                  <a
                    href={channelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 1.25rem",
                      borderRadius: 12,
                      background: "#FFE1E8",
                      color: "#7A0C2E",
                      fontWeight: 700,
                      fontSize: "0.875rem",
                      textDecoration: "none",
                      border: "1px solid #F0DCE2",
                    }}
                  >
                    <ExternalLink size={16} />
                  </a>
                </div>
              </div>

              {/* Submit Buttons */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: "0.75rem",
                  borderTop: "1px solid #F0DCE2",
                  paddingTop: "1.5rem",
                  marginTop: "0.5rem",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setIsEnabled(settings.is_enabled);
                    setAutoOpenOverlay(Boolean(settings.auto_open_overlay));
                    setStatus(settings.status);
                    setVideoUrlInput(settings.video_url || settings.video_id || "");
                    setTitle(settings.title || "");
                    setDescription(settings.description || "");
                    setScheduledTime(
                      settings.scheduled_start_time
                        ? new Date(settings.scheduled_start_time).toISOString().slice(0, 16)
                        : ""
                    );
                    setSaveMessage(null);
                  }}
                  style={{
                    padding: "0.85rem 1.25rem",
                    borderRadius: 12,
                    background: "#F9F9FB",
                    border: "1px solid #F0DCE2",
                    color: "#6B6870",
                    fontWeight: 700,
                    fontSize: "0.875rem",
                    cursor: "pointer",
                  }}
                >
                  Reset
                </button>

                <button
                  type="submit"
                  disabled={saving || loading}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.85rem 1.75rem",
                    borderRadius: 12,
                    background: "#E51B3E",
                    color: "#FFFFFF",
                    fontWeight: 800,
                    fontSize: "0.9375rem",
                    border: "none",
                    cursor: (saving || loading) ? "not-allowed" : "pointer",
                    boxShadow: "0 2px 10px rgba(229, 27, 62, 0.35)",
                    opacity: (saving || loading) ? 0.7 : 1,
                  }}
                >
                  {saving ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      <span>Saving to Supabase...</span>
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      <span>Save Live Show Settings</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Live Interactive Public Preview */}
          <div className="lg:col-span-5">
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #F0DCE2",
                borderRadius: 20,
                padding: "1.5rem",
                boxShadow: "0 4px 20px rgba(74, 6, 28, 0.04)",
                position: "sticky",
                top: "2rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "1rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Eye size={18} color="#7A0C2E" />
                  <span style={{ fontWeight: 800, fontSize: "0.9375rem", color: "#24131A" }}>
                    Live Preview
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      padding: "0.2rem 0.5rem",
                      borderRadius: 6,
                      background: autoOpenOverlay ? "#FFE1E8" : "#EDECEF",
                      color: autoOpenOverlay ? "#7A0C2E" : "#6B6870",
                    }}
                  >
                    {autoOpenOverlay ? "Auto-Overlay: ON" : "Auto-Overlay: OFF"}
                  </span>
                  <span
                    style={{
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      padding: "0.2rem 0.5rem",
                      borderRadius: 6,
                      background: isEnabled ? "#DCFCE7" : "#FEE2E2",
                      color: isEnabled ? "#15803D" : "#B91C1C",
                    }}
                  >
                    {isEnabled ? "Homepage: ON" : "Homepage: OFF"}
                  </span>
                </div>
              </div>

              {/* Preview Container replicating Homepage frame */}
              <div
                style={{
                  background: "#4A061C",
                  borderRadius: 16,
                  padding: "0.625rem",
                  boxShadow: "0 10px 25px rgba(74, 6, 28, 0.2)",
                  border: "1px solid rgba(240, 220, 226, 0.2)",
                }}
              >
                {/* 16:9 Video Box */}
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    paddingTop: "56.25%",
                    background: "#1A0209",
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  {previewPlaying && parsedVideoId ? (
                    <iframe
                      src={previewEmbedUrl}
                      title="Preview Player"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        border: "none",
                      }}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : parsedVideoId ? (
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        backgroundImage: previewThumbnail
                          ? `linear-gradient(180deg, rgba(26, 2, 9, 0.2) 0%, rgba(26, 2, 9, 0.8) 100%), url(${previewThumbnail})`
                          : "linear-gradient(135deg, #4A061C 0%, #24030D 100%)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                      }}
                      onClick={() => setPreviewPlaying(true)}
                    >
                      <button
                        type="button"
                        aria-label="Test play preview"
                        style={{
                          width: 52,
                          height: 52,
                          borderRadius: "50%",
                          background: "#E51B3E",
                          border: "2px solid #FFFFFF",
                          color: "#FFFFFF",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 4px 14px rgba(0,0,0,0.5)",
                          cursor: "pointer",
                        }}
                      >
                        <Play size={22} fill="#FFFFFF" style={{ marginLeft: 3 }} />
                      </button>
                    </div>
                  ) : (
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
                        color: "rgba(255, 225, 232, 0.7)",
                        padding: "1rem",
                        textAlign: "center",
                      }}
                    >
                      <YouTubeIcon size={36} color="#E51B3E" style={{ marginBottom: "0.5rem" }} />
                      <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#FFFFFF" }}>
                        Offline Studio Showroom
                      </span>
                      <span style={{ fontSize: "0.6875rem", marginTop: 4 }}>
                        Paste a valid YouTube broadcast URL to preview video player
                      </span>
                    </div>
                  )}
                </div>

                {/* Preview Meta Bar */}
                <div style={{ padding: "0.75rem 0.5rem 0.25rem" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.5rem",
                    }}
                  >
                    <div
                      style={{
                        color: "#FFFFFF",
                        fontWeight: 700,
                        fontSize: "0.8125rem",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {title || DEFAULT_LIVE_SHOW_SETTINGS.title}
                    </div>
                    <span
                      style={{
                        fontSize: "0.6875rem",
                        fontWeight: 800,
                        color: status === "live" ? "#E51B3E" : "#FFE1E8",
                        textTransform: "uppercase",
                      }}
                    >
                      {status}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.6875rem",
                      color: "rgba(255, 225, 232, 0.7)",
                      marginTop: 2,
                    }}
                  >
                    {OFFICIAL_YOUTUBE_HANDLE}
                  </div>
                </div>
              </div>

              {/* Preview helper guide */}
              <div
                style={{
                  marginTop: "1.25rem",
                  padding: "0.875rem",
                  borderRadius: 10,
                  background: "#FFF8FA",
                  border: "1px solid #F0DCE2",
                  fontSize: "0.8125rem",
                  color: "#6B6870",
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 700, color: "#24131A", marginBottom: "0.25rem" }}>
                  Broadcast Tips:
                </div>
                <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.75rem" }}>
                  <li>Embedding must be enabled in YouTube Studio advanced settings.</li>
                  <li>Clicking the preview player tests playback within the privacy-enhanced iframe domain.</li>
                  <li>No code deployment is needed when changing broadcast URLs.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Embedded instance of AutoVideoOverlay for admin live testing & preview */}
      <AutoVideoOverlay />
    </AdminLayout>
  );
}
