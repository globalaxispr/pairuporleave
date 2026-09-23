import { Users, Vote, Trophy } from "lucide-react";

const steps = [
  {
    num: "01",
    icon: Users,
    title: "Choose",
    description: "Browse the candidates and find the one you want to support.",
    color: "#7A0C2E",
    bg: "#FFE1E8",
  },
  {
    num: "02",
    icon: Vote,
    title: "Vote",
    description: "Choose how many votes you want to cast. Individual candidates cost $1 per vote, and couples cost $2 per vote.",
    color: "#E51B3E",
    bg: "#FFF3F5",
  },
  {
    num: "03",
    icon: Trophy,
    title: "Watch the Ranking",
    description: "Your votes are counted and the live ranking updates as the competition moves forward.",
    color: "#7A0C2E",
    bg: "#FFE1E8",
  },
];

export function HowItWorksSection() {
  return (
    <section
      className="section"
      style={{ background: "#FFF8FA", borderBottom: "1px solid #F0DCE2" }}
      id="how-it-works"
      aria-label="How voting works"
    >
      <div className="container-max">
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              background: "#FFE1E8",
              color: "#7A0C2E",
              borderRadius: 9999,
              padding: "0.25rem 0.875rem",
              fontSize: "0.75rem",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: "0.75rem",
            }}
          >
            How Voting Works
          </div>
          <h2
            style={{
              fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
              fontWeight: 800,
              color: "#24131A",
              margin: "0 0 0.75rem",
              letterSpacing: "-0.02em",
            }}
          >
            Simple. Transparent. Real-Time.
          </h2>
          <p style={{ fontSize: "1.0625rem", color: "#6B6870", maxWidth: 480, margin: "0 auto" }}>
            Cast your votes in three easy steps with secure, instant verification.
          </p>
        </div>

        {/* 3 Steps Grid */}
        <div
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
          style={{ position: "relative" }}
        >
          {steps.map((step) => (
            <div
              key={step.num}
              style={{
                background: "#ffffff",
                border: "1px solid #F0DCE2",
                borderRadius: 16,
                padding: "2.25rem 1.75rem",
                position: "relative",
                overflow: "hidden",
                boxShadow: "0 4px 20px rgba(74, 6, 28, 0.04)",
              }}
              className="reveal-fade-up"
            >
              {/* Big background number */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: "0.75rem",
                  right: "1.25rem",
                  fontSize: "4.5rem",
                  fontWeight: 900,
                  color: "#FFF0F3",
                  lineHeight: 1,
                  userSelect: "none",
                  zIndex: 0,
                }}
              >
                {step.num}
              </div>

              <div style={{ position: "relative", zIndex: 1 }}>
                {/* Functional Icon */}
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: step.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "1.25rem",
                    border: "1px solid #F0DCE2",
                  }}
                >
                  <step.icon size={24} color={step.color} />
                </div>

                <h3
                  style={{
                    fontSize: "1.25rem",
                    fontWeight: 800,
                    color: "#24131A",
                    marginBottom: "0.5rem",
                  }}
                >
                  {step.title}
                </h3>

                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "#6B6870",
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
