import { useState, useCallback } from "react";
import { Copy, Check, Share2 } from "lucide-react";
import { SITE_URL } from "@/lib/utils";

interface CandidateShareButtonsProps {
  candidateId: string;
  candidateName: string;
  isCouple?: boolean;
  compact?: boolean;
}

// WhatsApp SVG Brand Icon
function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
    </svg>
  );
}

export function CandidateShareButtons({
  candidateId,
  candidateName,
  isCouple = true,
  compact = false,
}: CandidateShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const cleanName = candidateName.replace(/\s+/g, " ").trim();
  const shareUrl = `${SITE_URL}/candidate/${candidateId}`;
  const shareText = isCouple
    ? `Vote for ${cleanName} on PAIR UP OR LEAVE! 🌟 Help send them to the Reality Show. Cast your verified vote here: ${shareUrl}`
    : `Vote for ${cleanName} on PAIR UP OR LEAVE! 🌟 Cast your verified vote here: ${shareUrl}`;

  const handleCopyLink = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = shareUrl;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("Failed to copy share link:", err);
    }
  }, [shareUrl]);

  const handleWhatsAppShare = useCallback(() => {
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  }, [shareText]);

  const handleNativeShare = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `Vote for ${cleanName} — PAIR UP OR LEAVE`,
          text: `Support ${cleanName} in the official PAIR UP OR LEAVE reality show competition!`,
          url: shareUrl,
        });
        return;
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.log("Native share dismissed or failed, falling back to WhatsApp share");
        } else {
          return;
        }
      }
    }
    handleWhatsAppShare();
  }, [cleanName, shareUrl, handleWhatsAppShare]);

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={handleWhatsAppShare}
          title={`Share ${cleanName} on WhatsApp`}
          aria-label={`Share ${cleanName} on WhatsApp`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.35rem",
            width: "100%",
            minWidth: 0,
            minHeight: 42,
            padding: "0 0.5rem",
            borderRadius: 10,
            background: "#25D366",
            color: "#FFFFFF",
            border: "1.5px solid #25D366",
            fontSize: "0.75rem",
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 2px 6px rgba(37, 211, 102, 0.2)",
            transition: "transform 0.15s ease, filter 0.15s ease",
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <WhatsAppIcon size={16} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Share
          </span>
        </button>

        <button
          type="button"
          onClick={handleCopyLink}
          title={copied ? "Link Copied!" : "Copy Share Link"}
          aria-label={`Copy share link for ${cleanName}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.35rem",
            width: "100%",
            minWidth: 0,
            minHeight: 42,
            padding: "0 0.5rem",
            borderRadius: 10,
            background: copied ? "#DCFCE7" : "#FFF8FA",
            color: copied ? "#15803D" : "#7A0C2E",
            border: `1.5px solid ${copied ? "#86EFAC" : "#F0DCE2"}`,
            fontSize: "0.75rem",
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          {copied ? <Check size={15} color="#15803D" style={{ flexShrink: 0 }} /> : <Copy size={15} style={{ flexShrink: 0 }} />}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {copied ? "Copied" : "Copy"}
          </span>
        </button>
      </>
    );
  }

  return (
    <div
      style={{
        marginTop: "1.25rem",
        padding: "1rem 1.25rem",
        borderRadius: 16,
        background: "#FFF8FA",
        border: "1px solid #F0DCE2",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Share2 size={16} color="#7A0C2E" />
          <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#24131A" }}>
            Share & Rally Votes
          </span>
        </div>
        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#6B6870" }}>
          WhatsApp Preview Ready
        </span>
      </div>

      <div style={{ display: "flex", gap: "0.625rem", flexWrap: "wrap" }}>
        {/* WhatsApp Share Button */}
        <button
          type="button"
          onClick={handleWhatsAppShare}
          style={{
            flex: "1 1 160px",
            minHeight: 44,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            padding: "0.625rem 1.125rem",
            borderRadius: 12,
            background: "#25D366",
            color: "#FFFFFF",
            fontSize: "0.875rem",
            fontWeight: 800,
            border: "none",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(37, 211, 102, 0.25)",
            transition: "transform 0.15s ease, filter 0.15s ease",
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <WhatsAppIcon size={19} />
          <span>Share on WhatsApp</span>
        </button>

        {/* Native OS Share (When supported on iOS/Android) */}
        <button
          type="button"
          onClick={handleNativeShare}
          style={{
            flex: "0 1 auto",
            minHeight: 44,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.375rem",
            padding: "0.625rem 0.875rem",
            borderRadius: 12,
            background: "#FFFFFF",
            color: "#7A0C2E",
            border: "1.5px solid #F0DCE2",
            fontSize: "0.875rem",
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          title="Share via other apps"
          aria-label="Share via other apps"
        >
          <Share2 size={16} />
          <span>More</span>
        </button>

        {/* Copy Link Button */}
        <button
          type="button"
          onClick={handleCopyLink}
          style={{
            flex: "1 1 140px",
            minHeight: 44,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            padding: "0.625rem 1rem",
            borderRadius: 12,
            background: copied ? "#DCFCE7" : "#FFFFFF",
            color: copied ? "#15803D" : "#7A0C2E",
            border: `1.5px solid ${copied ? "#22C55E" : "#F0DCE2"}`,
            fontSize: "0.875rem",
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          {copied ? (
            <>
              <Check size={16} color="#15803D" />
              <span>Link Copied!</span>
            </>
          ) : (
            <>
              <Copy size={16} />
              <span>Copy Link</span>
            </>
          )}
        </button>
      </div>

      <div style={{ fontSize: "0.75rem", color: "#6B6870", lineHeight: 1.4 }}>
        WhatsApp preview includes candidate portrait, names, and official PAIR UP OR LEAVE voting link.
      </div>
    </div>
  );
}
