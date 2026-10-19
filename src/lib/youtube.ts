/**
 * YouTube integration utilities for PAIR UP OR LEAVE.
 * Handles strict URL parsing, ID validation, embed URL generation, and fallback channels.
 */

export const OFFICIAL_YOUTUBE_CHANNEL = "https://youtube.com/@pairuporleave";
export const OFFICIAL_YOUTUBE_HANDLE = "@pairuporleave";

/**
 * Validates that an ID is a genuine 11-character YouTube video ID.
 * Standard YouTube video IDs are 11 characters comprising [a-zA-Z0-9_-].
 */
export function isValidYouTubeId(id?: string | null): boolean {
  if (!id) return false;
  return /^[a-zA-Z0-9_-]{11}$/.test(id.trim());
}

export interface YouTubeParseResult {
  videoId: string | null;
  isValid: boolean;
  isChannelUrl: boolean;
  error: string | null;
}

/**
 * Parses and extracts a YouTube video ID from various user-provided URL formats or bare IDs.
 *
 * Supported formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://m.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/live/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube-nocookie.com/embed/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - Bare 11-character video ID: e.g. "dQw4w9WgXcQ"
 */
export function extractYouTubeVideoId(input?: string | null): YouTubeParseResult {
  if (!input || !input.trim()) {
    return {
      videoId: null,
      isValid: false,
      isChannelUrl: false,
      error: "No video URL or ID provided.",
    };
  }

  const trimmed = input.trim();

  // 1. Detect if the user pasted a channel URL instead of a video URL
  if (
    trimmed.includes("/@") ||
    trimmed.includes("/channel/") ||
    trimmed.includes("/c/") ||
    trimmed.includes("/user/") ||
    trimmed.match(/youtube\.com\/@[^/?]+/i)
  ) {
    return {
      videoId: null,
      isValid: false,
      isChannelUrl: true,
      error: "This is a YouTube Channel URL, not a broadcast/video URL. Please paste a specific video or live broadcast URL (e.g., https://youtube.com/live/VIDEO_ID).",
    };
  }

  // 2. Check if the string itself is already a raw 11-character video ID
  if (isValidYouTubeId(trimmed)) {
    return {
      videoId: trimmed,
      isValid: true,
      isChannelUrl: false,
      error: null,
    };
  }

  // 3. Parse via URL regex matching known YouTube patterns
  try {
    // Pattern for youtube.com/watch?v=ID or /shorts/ID or /live/ID or /embed/ID
    const patterns = [
      // /watch?v=ID
      /(?:https?:\/\/)?(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})/i,
      // /live/ID
      /(?:https?:\/\/)?(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/live\/([a-zA-Z0-9_-]{11})/i,
      // /embed/ID
      /(?:https?:\/\/)?(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})/i,
      // /shorts/ID
      /(?:https?:\/\/)?(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/shorts\/([a-zA-Z0-9_-]{11})/i,
      // /v/ID
      /(?:https?:\/\/)?(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/v\/([a-zA-Z0-9_-]{11})/i,
      // youtu.be/ID
      /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/i,
    ];

    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match && match[1] && isValidYouTubeId(match[1])) {
        return {
          videoId: match[1],
          isValid: true,
          isChannelUrl: false,
          error: null,
        };
      }
    }
  } catch {
    // Fallback if parsing fails
  }

  return {
    videoId: null,
    isValid: false,
    isChannelUrl: false,
    error: "Invalid YouTube URL or ID. Please ensure the link is a valid YouTube video or live broadcast.",
  };
}

export interface YouTubeEmbedOptions {
  autoplay?: boolean;
  mute?: boolean;
  enablejsapi?: boolean;
  playsinline?: boolean;
  controls?: boolean;
}

/**
 * Builds the privacy-friendly YouTube embed URL using youtube-nocookie.com.
 * Supports configurable autoplay, mute (required for unprompted browser autoplay),
 * playsinline (for mobile Safari/Chrome), and enablejsapi (for iframe postMessage controls).
 */
export function buildYouTubeEmbedUrl(
  videoId: string,
  options?: YouTubeEmbedOptions
): string {
  if (!isValidYouTubeId(videoId)) return "";
  const params = new URLSearchParams({
    autoplay: options?.autoplay ? "1" : "0",
    mute: options?.mute ? "1" : "0",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    enablejsapi: options?.enablejsapi ? "1" : "0",
    origin: typeof window !== "undefined" ? window.location.origin : "https://pairuporleave.com",
  });
  if (options?.controls === false) {
    params.set("controls", "0");
  }
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
}

/**
 * Returns a high-quality video thumbnail URL from YouTube CDN.
 */
export function getYouTubeThumbnailUrl(videoId: string): string {
  if (!isValidYouTubeId(videoId)) return "";
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

/**
 * Returns the direct YouTube watch URL for fallbacks or external navigation.
 */
export function getYouTubeWatchUrl(videoId: string): string {
  if (!isValidYouTubeId(videoId)) return OFFICIAL_YOUTUBE_CHANNEL;
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}
