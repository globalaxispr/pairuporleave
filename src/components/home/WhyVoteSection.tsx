import { Shield, Heart, Users, Lock } from "lucide-react";

const benefits = [
  {
    icon: Heart,
    title: "Instant Vote Counting",
    description:
      "Every vote is processed and reflected in the standings within seconds of payment confirmation.",
    color: "#E51B3E",
    bg: "#FFE1E8",
  },
  {
    icon: Shield,
    title: "Secure & Transparent",
    description:
      "Payments handled by Stripe. No double counting. Every vote is backed by a verified payment.",
    color: "#7A0C2E",
    bg: "#FFF3F5",
  },
  {
    icon: Users,
    title: "No Account Required",
    description:
      "Vote without creating an account. No passwords, no registration. Just choose and pay.",
    color: "#E51B3E",
    bg: "#FFE1E8",
  },
  {
    icon: Lock,
    title: "No Vote Limit",
    description:
      "Support your candidate as much as you want. $1/vote for individuals, $2/vote for couples. Cast as many as you like.",
    color: "#7A0C2E",
    bg: "#FFF3F5",
  },
];

export function WhyVoteSection() {
  return (
    <section
      className="section"
      style={{
        background: "linear-gradient(180deg, #FFF8FA 0%, #ffffff 100%)",
      }}
      aria-label="Platform benefits"
    >
      <div className="container-max">
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <h2
            style={{
              fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
              fontWeight: 800,
              color: "#24131A",
              margin: "0 0 0.75rem",
              letterSpacing: "-0.02em",
            }}
          >
            Why Vote on Pair Up or Leave?
          </h2>
          <p style={{ fontSize: "1.0625rem", color: "#6B6870", maxWidth: 440, margin: "0 auto" }}>
            A platform designed for fairness, simplicity, and transparency.
          </p>
        </div>

        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {benefits.map((b) => (
            <div
              key={b.title}
              style={{
                background: "#ffffff",
                border: "1px solid #F0DCE2",
                borderRadius: 20,
                padding: "1.75rem 1.5rem",
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
              }}
              className="card-shadow"
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(74,6,28,0.08)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                (e.currentTarget as HTMLElement).style.boxShadow = "";
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: b.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "1.25rem",
                }}
              >
                <b.icon size={24} color={b.color} />
              </div>
              <h3
                style={{
                  fontSize: "1.0625rem",
                  fontWeight: 700,
                  color: "#24131A",
                  margin: "0 0 0.5rem",
                }}
              >
                {b.title}
              </h3>
              <p
                style={{
                  fontSize: "0.9375rem",
                  color: "#6B6870",
                  margin: 0,
                  lineHeight: 1.65,
                }}
              >
                {b.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
