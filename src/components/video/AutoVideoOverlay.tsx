import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { X, Volume2, VolumeX, ExternalLink, Radio, Calendar, Sparkles } from "lucide-react";
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
  getYouTubeWatchUrl,
  isValidYouTubeId,
  OFFICIAL_YOUTUBE_CHANNEL,
  OFFICIAL_YOUTUBE_HANDLE,
} from "@/lib/youtube";

export const OVERLAY_DISMISSED_KEY = "pairup_video_overlay_dismissed";

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export function AutoVideoOverlay() {
  const location = useLocation();
  const [settings, setSettings] = useState<LiveShowSettings>(DEFAULT_LIVE_SHOW_SETTINGS);
  const [isOpen, setIsOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [soundHintVisible, setSoundHintVisible] = useState(true);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<any>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const isApiLoadedRef = useRef(false);

  // Send command to YouTube iframe via postMessage (reliable & works without external script loading)
  const sendIframeCommand = useCallback((command: string, args: any[] = []) => {
    try {
      const iframe = iframeRef.current;
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          JSON.stringify({
            event: "command",
            func: command,
            args,
          }),
          "*"
        );
      }
    } catch {
      // Ignore cross-origin warnings
    }
  }, []);

  // Close overlay handler: stops playback, unmounts iframe, restores normal interaction
  const handleClose = useCallback(() => {
    // Save dismissal to current browser tab session
    if (!isPreviewMode) {
      try {
        sessionStorage.setItem(OVERLAY_DISMISSED_KEY, "true");
      } catch {
        // Storage access may be blocked in strict private browsing
      }
    }

    setIsOpen(false);
    setIsDismissed(true);
    setIsPreviewMode(false);

    // Destroy YT player instance if bound
    if (playerRef.current && typeof playerRef.current.destroy === "function") {
      try {
        playerRef.current.destroy();
      } catch {
        // silent
      }
      playerRef.current = null;
    }

    // Restore body scroll
    document.body.style.overflow = "";

    // Restore focus
    if (previouslyFocusedElementRef.current && typeof previouslyFocusedElementRef.current.focus === "function") {
      previouslyFocusedElementRef.current.focus();
    }
  }, [isPreviewMode]);

  // Sound toggle handler (Unmute / Mute)
  const handleToggleSound = useCallback(() => {
    if (isMuted) {
      // Unmute: direct user gesture allows sound immediately
      sendIframeCommand("unMute");
      sendIframeCommand("setVolume", [100]);
      if (playerRef.current && typeof playerRef.current.unMute === "function") {
        try {
          playerRef.current.unMute();
          playerRef.current.setVolume(100);
        } catch {
          // silent
        }
      }
      setIsMuted(false);
      setSoundHintVisible(false);
    } else {
      // Mute
      sendIframeCommand("mute");
      if (playerRef.current && typeof playerRef.current.mute === "function") {
        try {
          playerRef.current.mute();
        } catch {
          // silent
        }
      }
      setIsMuted(true);
    }
  }, [isMuted, sendIframeCommand]);

  const hasCheckedRef = useRef(false);

  // Subscribe to realtime broadcast updates on mount
  useEffect(() => {
    const channel = supabase
      .channel("auto-video-overlay-realtime")
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
              auto_open_overlay: updated.auto_open_overlay !== undefined ? Boolean(updated.auto_open_overlay) : prev.auto_open_overlay,
            }));
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // Initial check on public landing (never re-triggers on internal route changes)
  useEffect(() => {
    // Never auto-trigger inside /admin routes
    if (location.pathname.startsWith("/admin")) {
      return;
    }

    // Check if dismissed in this tab session
    try {
      if (sessionStorage.getItem(OVERLAY_DISMISSED_KEY) === "true") {
        setIsDismissed(true);
        return;
      }
    } catch {
      // ignore
    }

    // Prevent duplicate triggers across internal React route changes
    if (hasCheckedRef.current) {
      return;
    }
    hasCheckedRef.current = true;

    let isMounted = true;

    async function checkAndOpen() {
      try {
        const data = await fetchLiveShowSettings();
        if (!isMounted) return;
        setSettings(data);

        const { videoId } = extractYouTubeVideoId(data.video_id || data.video_url);

        // Required conditions for automatic overlay:
        // 1. Live show section is enabled
        // 2. Auto-open overlay option is enabled by admin
        // 3. Valid 11-char YouTube video ID is configured
        if (data.is_enabled && data.auto_open_overlay && isValidYouTubeId(videoId)) {
          // Store previously focused element for accessibility focus restoration
          if (document.activeElement instanceof HTMLElement) {
            previouslyFocusedElementRef.current = document.activeElement;
          }
          setIsOpen(true);
          document.body.style.overflow = "hidden";
        }
      } catch (err) {
        console.warn("[AutoVideoOverlay] Failed to load settings:", err);
      }
    }

    void checkAndOpen();

    return () => {
      isMounted = false;
    };
  }, [location.pathname]);

  // Support on-demand preview event (used by Admin Live Show page for instant testing)
  useEffect(() => {
    const handlePreviewEvent = (e: Event) => {
      const customEvent = e as CustomEvent<LiveShowSettings | undefined>;
      if (customEvent.detail) {
        setSettings(customEvent.detail);
      }
      setIsPreviewMode(true);
      setIsMuted(true);
      setSoundHintVisible(true);
      if (document.activeElement instanceof HTMLElement) {
        previouslyFocusedElementRef.current = document.activeElement;
      }
      setIsOpen(true);
      document.body.style.overflow = "hidden";
    };

    window.addEventListener("pairup:preview-overlay", handlePreviewEvent);
    return () => {
      window.removeEventListener("pairup:preview-overlay", handlePreviewEvent);
    };
  }, []);

  // Keyboard accessibility: Escape key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  // Load YouTube IFrame Player API script only when overlay opens (lazy & performant)
  useEffect(() => {
    if (!isOpen) return;

    // Focus close button on open
    setTimeout(() => {
      if (closeButtonRef.current) {
        closeButtonRef.current.focus();
      }
    }, 150);

    // If script not yet added, load it dynamically
    if (typeof window !== "undefined" && !window.YT && !isApiLoadedRef.current) {
      isApiLoadedRef.current = true;
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  }, [isOpen]);

  // Auto-hide sound reminder after 9 seconds if untouched
  useEffect(() => {
    if (!isOpen || !soundHintVisible) return;
    const timer = setTimeout(() => {
      setSoundHintVisible(false);
    }, 9000);
    return () => clearTimeout(timer);
  }, [isOpen, soundHintVisible]);

  // If closed or dismissed, unmount completely
  if (!isOpen || isDismissed) {
    return null;
  }

  const { videoId } = extractYouTubeVideoId(settings.video_id || settings.video_url);

  // If video configuration fails or is invalid, do not show
  if (!videoId || !isValidYouTubeId(videoId)) {
    return null;
  }

  const isLive = settings.status === "live";
  const isScheduled = settings.status === "scheduled";

  // Build embed URL with autoplay=1, mute=1, enablejsapi=1, playsinline=1
  const embedUrl = buildYouTubeEmbedUrl(videoId, {
    autoplay: true,
    mute: true,
    enablejsapi: true,
    playsinline: true,
  });

  const watchUrl = getYouTubeWatchUrl(videoId);
  const channelUrl = settings.channel_url || OFFICIAL_YOUTUBE_CHANNEL;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-overlay-title"
      className="overlay-backdrop-animate"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(18, 4, 11, 0.85)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
      onClick={(e) => {
        // Outside click on backdrop closes overlay
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      {/* Modal Dialog Card */}
      <div
        className="overlay-modal-animate"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "1040px",
          background: "linear-gradient(180deg, #2D0512 0%, #170208 100%)",
          border: "1px solid rgba(240, 220, 226, 0.22)",
          borderRadius: 24,
          boxShadow: isLive
            ? "0 25px 70px -10px rgba(0, 0, 0, 0.85), 0 0 50px rgba(229, 27, 62, 0.35)"
            : "0 25px 70px -10px rgba(0, 0, 0, 0.85), 0 0 40px rgba(122, 12, 46, 0.3)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.875rem 1.25rem",
            borderBottom: "1px solid rgba(240, 220, 226, 0.12)",
            background: "rgba(36, 4, 15, 0.6)",
            gap: "0.75rem",
          }}
        >
          {/* Left: Status Badge & Show Title */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
            {/* Status Badge */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.25rem 0.65rem",
                borderRadius: 9999,
                fontSize: "0.6875rem",
                fontWeight: 800,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                background: isLive ? "#E51B3E" : "rgba(255, 255, 255, 0.12)",
                color: "#FFFFFF",
                boxShadow: isLive ? "0 0 14px rgba(229, 27, 62, 0.6)" : "none",
                flexShrink: 0,
              }}
            >
              {isLive ? (
                <>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "#FFFFFF",
                      animation: "pulse-red 1.4s infinite",
                    }}
                  />
                  <span>LIVE BROADCAST</span>
                </>
              ) : isScheduled ? (
                <>
                  <Calendar size={12} />
                  <span>UPCOMING STREAM</span>
                </>
              ) : (
                <>
                  <YouTubeIcon size={12} />
                  <span>FEATURED SHOW</span>
                </>
              )}
            </div>

            {/* Video Title */}
            <h2
              id="video-overlay-title"
              style={{
                fontSize: "0.9375rem",
                fontWeight: 700,
                color: "#FFFFFF",
                margin: 0,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {settings.title || "PAIR UP OR LEAVE — Official Broadcast"}
            </h2>
          </div>

          {/* Right: Sound Control & Close Button */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
            {/* Sound Toggle Button */}
            <button
              type="button"
              onClick={handleToggleSound}
              aria-label={isMuted ? "Enable sound (unmute video)" : "Mute video sound"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.45rem 0.85rem",
                borderRadius: 10,
                fontSize: "0.75rem",
                fontWeight: 800,
                background: isMuted ? "#E51B3E" : "rgba(255, 255, 255, 0.15)",
                color: "#FFFFFF",
                border: isMuted ? "1px solid rgba(255, 255, 255, 0.3)" : "1px solid rgba(240, 220, 226, 0.2)",
                cursor: "pointer",
                boxShadow: isMuted ? "0 2px 10px rgba(229, 27, 62, 0.45)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              {isMuted ? (
                <>
                  <VolumeX size={15} />
                  <span>Enable Sound</span>
                </>
              ) : (
                <>
                  <Volume2 size={15} />
                  <span>Mute</span>
                </>
              )}
            </button>

            {/* Close Button */}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={handleClose}
              aria-label="Close video overlay"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "rgba(255, 255, 255, 0.1)",
                border: "1px solid rgba(255, 255, 255, 0.18)",
                color: "#FFFFFF",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(229, 27, 62, 0.3)";
                (e.currentTarget as HTMLElement).style.borderColor = "#E51B3E";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255, 255, 255, 0.1)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(255, 255, 255, 0.18)";
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Video Player 16:9 Cinema Container */}
        <div
          style={{
            position: "relative",
            width: "100%",
            paddingTop: "56.25%", // Strict 16:9 aspect ratio prevents CLS
            background: "#000000",
          }}
        >
          <iframe
            ref={iframeRef}
            id="pairup-youtube-overlay-iframe"
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

          {/* Floating Sound Hint Pill (Only when muted and visible) */}
          {isMuted && soundHintVisible && (
            <div
              style={{
                position: "absolute",
                bottom: "1rem",
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(26, 2, 9, 0.9)",
                backdropFilter: "blur(8px)",
                border: "1px solid rgba(255, 84, 117, 0.4)",
                borderRadius: 9999,
                padding: "0.45rem 1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                color: "#FFE1E8",
                fontSize: "0.8125rem",
                fontWeight: 600,
                boxShadow: "0 4px 18px rgba(0, 0, 0, 0.6)",
                cursor: "pointer",
                zIndex: 10,
              }}
              onClick={handleToggleSound}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleToggleSound();
                }
              }}
            >
              <VolumeX size={16} color="#FF5475" />
              <span>Playing muted per browser standards. </span>
              <span style={{ color: "#FFFFFF", fontWeight: 800, textDecoration: "underline" }}>
                Click to unmute 🔊
              </span>
            </div>
          )}
        </div>

        {/* Bottom Action Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.75rem 1.25rem",
            background: "rgba(24, 2, 10, 0.8)",
            borderTop: "1px solid rgba(240, 220, 226, 0.12)",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          {/* Channel branding */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <YouTubeIcon size={18} color="#FF5475" />
            <span style={{ color: "rgba(255, 225, 232, 0.85)", fontSize: "0.8125rem", fontWeight: 600 }}>
              PAIR UP OR LEAVE Official • {OFFICIAL_YOUTUBE_HANDLE}
            </span>
          </div>

          {/* Action CTAs */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap" }}>
            <a
              href={watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                color: "#FFE1E8",
                fontSize: "0.8125rem",
                fontWeight: 600,
                textDecoration: "none",
                padding: "0.4rem 0.75rem",
                borderRadius: 8,
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                transition: "background 0.15s ease",
              }}
            >
              <span>Watch on YouTube</span>
              <ExternalLink size={13} />
            </a>

            <button
              type="button"
              onClick={handleClose}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                background: "rgba(255, 255, 255, 0.12)",
                color: "#FFFFFF",
                fontSize: "0.8125rem",
                fontWeight: 700,
                padding: "0.4rem 0.95rem",
                borderRadius: 8,
                border: "1px solid rgba(240, 220, 226, 0.2)",
                cursor: "pointer",
              }}
            >
              <span>Continue to Website</span>
              <span>→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
