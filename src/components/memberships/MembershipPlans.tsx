import { Check, Sparkles, ExternalLink, ShieldCheck, Crown, Gem, Flame } from "lucide-react";
import { YouTubeIcon } from "@/components/ui/YouTubeIcon";
import { OFFICIAL_YOUTUBE_CHANNEL } from "@/lib/youtube";

const YOUTUBE_MEMBERSHIP_JOIN_URL = "https://www.youtube.com/@pairuporleave/join";

interface MembershipTier {
  id: string;
  name: string;
  price: string;
  badge: string;
  badgeBg: string;
  badgeColor: string;
  cardBorder: string;
  glowColor: string;
  accentGradient: string;
  popular?: boolean;
  tagline: string;
  icon: typeof Crown;
  features: string[];
}

const MEMBERSHIP_TIERS: MembershipTier[] = [
  {
    id: "basic",
    name: "BASIC",
    price: "$3.99",
    badge: "Official Fan",
    badgeBg: "rgba(194, 120, 3, 0.15)",
    badgeColor: "#B45309",
    cardBorder: "rgba(194, 120, 3, 0.35)",
    glowColor: "rgba(194, 120, 3, 0.15)",
    accentGradient: "linear-gradient(135deg, #B45309 0%, #D97706 100%)",
    tagline: "Essential access & member perks",
    icon: Flame,
    features: [
      "Loyalty badges next to your name",
      "Custom emoji in live chats & comments",
      "Members-only Shorts",
      "Members-only exclusive videos",
    ],
  },
  {
    id: "vip",
    name: "VIP",
    price: "$9.99",
    badge: "Most Popular",
    badgeBg: "rgba(139, 92, 246, 0.18)",
    badgeColor: "#7C3AED",
    cardBorder: "rgba(139, 92, 246, 0.45)",
    glowColor: "rgba(139, 92, 246, 0.22)",
    accentGradient: "linear-gradient(135deg, #7C3AED 0%, #9333EA 100%)",
    popular: true,
    tagline: "Full access to live streams & chats",
    icon: Crown,
    features: [
      "Everything in BASIC",
      "Members-only live streams",
      "Members-only live chats & Q&A",
    ],
  },
  {
    id: "elite",
    name: "ELITE",
    price: "$14.99",
    badge: "Insider Access",
    badgeBg: "rgba(245, 158, 11, 0.18)",
    badgeColor: "#D97706",
    cardBorder: "rgba(245, 158, 11, 0.45)",
    glowColor: "rgba(245, 158, 11, 0.25)",
    accentGradient: "linear-gradient(135deg, #D97706 0%, #F59E0B 100%)",
    tagline: "Early video premieres & leaks",
    icon: Sparkles,
    features: [
      "Everything in VIP",
      "Early access to new videos & episodes",
    ],
  },
  {
    id: "diamond",
    name: "DIAMOND",
    price: "$19.99",
    badge: "Ultimate Patron",
    badgeBg: "rgba(6, 182, 212, 0.18)",
    badgeColor: "#0284C7",
    cardBorder: "rgba(6, 182, 212, 0.5)",
    glowColor: "rgba(6, 182, 212, 0.25)",
    accentGradient: "linear-gradient(135deg, #0284C7 0%, #06B6D4 100%)",
    tagline: "Direct creator recognition & shout-outs",
    icon: Gem,
    features: [
      "Everything in ELITE",
      "Official Member shout-outs during broadcasts",
    ],
  },
];

interface MembershipPlansProps {
  heading?: string;
  subheading?: string;
}

export function MembershipPlans({
  heading = "Official YouTube Channel Memberships",
  subheading = "Unlock exclusive confessionals, members-only live chats, loyalty badges, and priority access directly on our official YouTube channel.",
}: MembershipPlansProps) {
  return (
    <section
      id="youtube-memberships"
      aria-label="YouTube Channel Membership Plans"
      style={{
        background: "linear-gradient(180deg, #FFF8FA 0%, #FFFFFF 100%)",
        borderTop: "1px solid #F0DCE2",
        borderBottom: "1px solid #F0DCE2",
        padding: "4.5rem 1rem",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background ambient glow */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "15%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "1100px",
          maxWidth: "100%",
          height: "450px",
          background: "radial-gradient(circle, rgba(229, 27, 62, 0.06) 0%, rgba(255, 225, 232, 0) 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div className="container-max" style={{ position: "relative", zIndex: 1, maxWidth: 1240, margin: "0 auto" }}>
        {/* Header Block */}
        <div style={{ maxWidth: 840, margin: "0 auto 3.5rem", textAlign: "center" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "rgba(229, 27, 62, 0.1)",
              border: "1px solid rgba(229, 27, 62, 0.25)",
              color: "#E51B3E",
              padding: "0.35rem 0.95rem",
              borderRadius: 9999,
              fontSize: "0.75rem",
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: "1rem",
            }}
          >
            <YouTubeIcon size={14} color="#E51B3E" />
            <span>PAIR UP OR LEAVE — EXCLUSIVE CLUB</span>
          </div>

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
            {heading}
          </h2>

          <p
            style={{
              fontSize: "clamp(1rem, 1.8vw, 1.125rem)",
              color: "#6B6870",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {subheading}
          </p>
        </div>

        {/* 4-Tier Cards Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "1.5rem",
            alignItems: "stretch",
          }}
        >
          {MEMBERSHIP_TIERS.map((tier) => {
            const Icon = tier.icon;
            return (
              <div
                key={tier.id}
                style={{
                  background: tier.popular
                    ? "linear-gradient(180deg, #FFFFFF 0%, #FFF5F7 100%)"
                    : "#FFFFFF",
                  border: `2px solid ${tier.cardBorder}`,
                  borderRadius: 22,
                  padding: "2rem 1.5rem",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  position: "relative",
                  boxShadow: tier.popular
                    ? `0 14px 35px -5px ${tier.glowColor}, 0 4px 15px rgba(74, 6, 28, 0.05)`
                    : "0 4px 20px rgba(74, 6, 28, 0.04)",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
                  (e.currentTarget as HTMLElement).style.boxShadow = `0 18px 40px -5px ${tier.glowColor}`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                  (e.currentTarget as HTMLElement).style.boxShadow = tier.popular
                    ? `0 14px 35px -5px ${tier.glowColor}, 0 4px 15px rgba(74, 6, 28, 0.05)`
                    : "0 4px 20px rgba(74, 6, 28, 0.04)";
                }}
              >
                {/* Top Badge (if popular / highlighted) */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      padding: "0.25rem 0.65rem",
                      borderRadius: 8,
                      background: tier.badgeBg,
                      color: tier.badgeColor,
                      fontSize: "0.6875rem",
                      fontWeight: 800,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                    }}
                  >
                    <Icon size={12} />
                    <span>{tier.badge}</span>
                  </div>

                  <span style={{ fontSize: "0.75rem", color: "#6B6870", fontWeight: 600 }}>
                    Monthly Pass
                  </span>
                </div>

                {/* Tier Name & Price */}
                <div>
                  <h3
                    style={{
                      fontSize: "1.375rem",
                      fontWeight: 900,
                      color: "#24131A",
                      letterSpacing: "-0.02em",
                      margin: "0 0 0.25rem",
                    }}
                  >
                    {tier.name}
                  </h3>
                  <p style={{ fontSize: "0.8125rem", color: "#6B6870", margin: "0 0 1.25rem", minHeight: 38 }}>
                    {tier.tagline}
                  </p>

                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem", marginBottom: "1.75rem" }}>
                    <span
                      style={{
                        fontSize: "2.5rem",
                        fontWeight: 900,
                        color: "#24131A",
                        lineHeight: 1,
                        letterSpacing: "-0.03em",
                      }}
                    >
                      {tier.price}
                    </span>
                    <span style={{ fontSize: "0.875rem", color: "#6B6870", fontWeight: 600 }}>/ month</span>
                  </div>

                  {/* Feature Checklist */}
                  <ul
                    style={{
                      listStyle: "none",
                      padding: 0,
                      margin: "0 0 2rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    {tier.features.map((feature, i) => (
                      <li
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "0.625rem",
                          fontSize: "0.875rem",
                          color: "#24131A",
                          lineHeight: 1.45,
                        }}
                      >
                        <span
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: "50%",
                            background: tier.badgeBg,
                            color: tier.badgeColor,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            marginTop: 2,
                          }}
                        >
                          <Check size={11} strokeWidth={3} />
                        </span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Join CTA Button directly to YouTube */}
                <div>
                  <a
                    href={YOUTUBE_MEMBERSHIP_JOIN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem",
                      width: "100%",
                      padding: "0.875rem 1rem",
                      borderRadius: 12,
                      background: tier.popular ? "#E51B3E" : "#7A0C2E",
                      color: "#FFFFFF",
                      fontSize: "0.875rem",
                      fontWeight: 800,
                      textDecoration: "none",
                      boxShadow: tier.popular
                        ? "0 4px 14px rgba(229, 27, 62, 0.35)"
                        : "0 4px 14px rgba(122, 12, 46, 0.25)",
                      transition: "opacity 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.opacity = "0.92";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.opacity = "1";
                    }}
                  >
                    <YouTubeIcon size={16} />
                    <span>Become a YouTube Member</span>
                    <ExternalLink size={13} />
                  </a>

                  <div
                    style={{
                      textAlign: "center",
                      fontSize: "0.6875rem",
                      color: "#6B6870",
                      marginTop: "0.625rem",
                    }}
                  >
                    Billed via YouTube • Cancel anytime
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footnote reassurance */}
        <div
          style={{
            marginTop: "3rem",
            padding: "1.25rem 1.5rem",
            borderRadius: 16,
            background: "#FFFFFF",
            border: "1px solid #F0DCE2",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <ShieldCheck size={20} color="#15803D" />
            <div style={{ fontSize: "0.8125rem", color: "#6B6870" }}>
              YouTube Memberships are hosted, authenticated, and billed directly through your Google/YouTube account.
              Voting points on the competition website remain separate and are purchased via secure Stripe checkout.
            </div>
          </div>

          <a
            href={OFFICIAL_YOUTUBE_CHANNEL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              color: "#7A0C2E",
              fontWeight: 700,
              fontSize: "0.8125rem",
              textDecoration: "none",
            }}
          >
            <span>Visit @pairuporleave on YouTube</span>
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </section>
  );
}
