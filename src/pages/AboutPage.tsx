import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Users, Heart, ShieldCheck, Trophy, ArrowRight, Vote } from "lucide-react";
import { SITE_URL } from "@/lib/utils";

export function AboutPage() {
  return (
    <>
      <Helmet>
        <title>About Pair Up or Leave — More Than a Vote. It's a Moment.</title>
        <meta
          name="description"
          content="Pair Up or Leave brings people together through competition, connection, and the excitement of choosing your favorite candidate or couple."
        />
        <meta property="og:title" content="About Pair Up or Leave" />
        <meta
          property="og:description"
          content="More Than a Vote. It's a Moment. Discover the story, community, and values behind Pair Up or Leave."
        />
        <meta property="og:url" content={`${SITE_URL}/about`} />
        <link rel="canonical" href={`${SITE_URL}/about`} />
      </Helmet>

      <main id="main-content" style={{ minHeight: "85vh", background: "#FFFFFF" }}>
        {/* ========================================================
            1. ABOUT HERO
           ======================================================== */}
        <section
          style={{
            background: "linear-gradient(180deg, #FFF8FA 0%, #FFFFFF 100%)",
            borderBottom: "1px solid #F0DCE2",
            padding: "4rem 1.25rem 4.5rem",
            position: "relative",
            overflow: "hidden",
          }}
          aria-label="About Hero"
        >
          <div className="container-max">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.1fr 0.9fr",
                gap: "3.5rem",
                alignItems: "center",
              }}
              className="about-hero-grid"
            >
              {/* Left text */}
              <div>
                {/* Eyebrow */}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    background: "#FFE1E8",
                    border: "1px solid #F0DCE2",
                    padding: "0.25rem 0.875rem",
                    borderRadius: 99,
                    marginBottom: "1rem",
                  }}
                >
                  <Heart size={13} color="#7A0C2E" />
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 800,
                      color: "#7A0C2E",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    ABOUT PAIR UP OR LEAVE
                  </span>
                </div>

                {/* Headline */}
                <h1
                  className="reveal-fade-up"
                  style={{
                    fontSize: "clamp(2.5rem, 5vw, 3.75rem)",
                    fontWeight: 900,
                    color: "#24131A",
                    lineHeight: 1.15,
                    letterSpacing: "-0.03em",
                    margin: "0 0 1.25rem",
                  }}
                >
                  More Than a Vote.<br />
                  <span className="text-gradient-burgundy">It's a Moment.</span>
                </h1>

                {/* Supporting Text */}
                <p
                  className="reveal-fade-up stagger-1"
                  style={{
                    fontSize: "1.125rem",
                    color: "#6B6870",
                    lineHeight: 1.65,
                    marginBottom: "2rem",
                    maxWidth: 520,
                  }}
                >
                  Pair Up or Leave brings people together through competition, connection, and the excitement of choosing your favorite.
                </p>

                {/* Action buttons */}
                <div
                  className="reveal-fade-up stagger-2"
                  style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}
                >
                  <Link to="/candidates">
                    <button className="btn-vote" style={{ minHeight: 48, padding: "0.75rem 1.75rem" }}>
                      <Vote size={18} />
                      EXPLORE CANDIDATES
                    </button>
                  </Link>
                  <Link to="/ranking">
                    <button className="btn-outline" style={{ minHeight: 48, padding: "0.75rem 1.75rem" }}>
                      <Trophy size={18} />
                      VIEW LIVE RANKING
                    </button>
                  </Link>
                </div>
              </div>

              {/* Right Image Composition */}
              <div className="reveal-scale stagger-1">
                <div
                  style={{
                    borderRadius: 24,
                    overflow: "hidden",
                    border: "1.5px solid #F0DCE2",
                    boxShadow: "0 16px 40px rgba(74, 6, 28, 0.08)",
                    aspectRatio: "4/3",
                    position: "relative",
                  }}
                >
                  <img
                    src="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1000&q=80"
                    alt="Event crowd cheering and celebrating together"
                    width={800}
                    height={600}
                    loading="lazy"
                    decoding="async"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      background: "linear-gradient(180deg, rgba(36,19,26,0) 0%, rgba(36,19,26,0.85) 100%)",
                      padding: "1.5rem 1.25rem 1rem",
                      color: "#FFFFFF",
                    }}
                  >
                    <div style={{ fontSize: "0.875rem", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "#FFE1E8" }}>
                      The Spirit of the Event
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "rgba(255,255,255,0.85)" }}>
                      Every vote powers the momentum of the season.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================
            2. EVENT STORY: Where Competition Meets Connection
           ======================================================== */}
        <section className="section" style={{ background: "#FFFFFF", borderBottom: "1px solid #F0DCE2" }}>
          <div className="container-max" style={{ maxWidth: 860 }}>
            <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
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
                Our Purpose
              </div>
              <h2
                style={{
                  fontSize: "clamp(2rem, 4.5vw, 2.75rem)",
                  fontWeight: 900,
                  color: "#24131A",
                  letterSpacing: "-0.03em",
                  margin: "0 0 1rem",
                }}
              >
                Where Competition Meets Connection
              </h2>
            </div>

            <div
              style={{
                fontSize: "1.125rem",
                color: "#24131A",
                lineHeight: 1.8,
                display: "flex",
                flexDirection: "column",
                gap: "1.25rem",
              }}
            >
              <p style={{ margin: 0 }}>
                Pair Up or Leave is designed around one simple idea: give people a reason to connect, choose, compete, and participate.
              </p>
              <p style={{ margin: 0, color: "#6B6870" }}>
                Every candidate brings a story. Every vote adds momentum. And every ranking update makes the experience more exciting.
              </p>
              <p style={{ margin: 0, color: "#6B6870" }}>
                Whether you're supporting a dedicated individual candidate at $1 per vote or an inspiring couple team at $2 per vote, your participation is backed by transparent Stripe verification and instant leaderboard updates.
              </p>
            </div>
          </div>
        </section>

        {/* ========================================================
            3. EVENT PHOTOGRAPHY: The Experience
           ======================================================== */}
        <section className="section" style={{ background: "#FFF8FA", borderBottom: "1px solid #F0DCE2" }}>
          <div className="container-max">
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
                THE EXPERIENCE
              </div>
              <h2
                style={{
                  fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
                  fontWeight: 800,
                  color: "#24131A",
                  margin: 0,
                  letterSpacing: "-0.02em",
                }}
              >
                Moments That Define the Competition
              </h2>
            </div>

            {/* Editorial Gallery Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(12, 1fr)",
                gap: "1.25rem",
              }}
              className="about-gallery-grid"
            >
              {/* Image 1 (Large left) */}
              <div
                style={{
                  gridColumn: "span 7",
                  borderRadius: 20,
                  overflow: "hidden",
                  border: "1px solid #F0DCE2",
                  boxShadow: "0 6px 20px rgba(74, 6, 28, 0.05)",
                  aspectRatio: "16/10",
                }}
                className="gallery-item"
              >
                <img
                  src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1000&q=80"
                  alt="Friends celebrating together at the event"
                  width={640}
                  height={400}
                  loading="lazy"
                  decoding="async"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>

              {/* Image 2 (Right top) */}
              <div
                style={{
                  gridColumn: "span 5",
                  borderRadius: 20,
                  overflow: "hidden",
                  border: "1px solid #F0DCE2",
                  boxShadow: "0 6px 20px rgba(74, 6, 28, 0.05)",
                  aspectRatio: "16/10",
                }}
                className="gallery-item"
              >
                <img
                  src="https://images.unsplash.com/photo-1543807535-eceef0bc6599?auto=format&fit=crop&w=800&q=80"
                  alt="Couple sharing a genuine connected moment"
                  width={480}
                  height={300}
                  loading="lazy"
                  decoding="async"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>

              {/* Image 3 (Bottom Left) */}
              <div
                style={{
                  gridColumn: "span 5",
                  borderRadius: 20,
                  overflow: "hidden",
                  border: "1px solid #F0DCE2",
                  boxShadow: "0 6px 20px rgba(74, 6, 28, 0.05)",
                  aspectRatio: "16/10",
                }}
                className="gallery-item"
              >
                <img
                  src="https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=800&q=80"
                  alt="Audience cheering during live vote announcement"
                  width={480}
                  height={300}
                  loading="lazy"
                  decoding="async"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>

              {/* Image 4 (Bottom Right) */}
              <div
                style={{
                  gridColumn: "span 7",
                  borderRadius: 20,
                  overflow: "hidden",
                  border: "1px solid #F0DCE2",
                  boxShadow: "0 6px 20px rgba(74, 6, 28, 0.05)",
                  aspectRatio: "16/10",
                }}
                className="gallery-item"
              >
                <img
                  src="https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1000&q=80"
                  alt="Atmospheric stage celebration and energy"
                  width={640}
                  height={400}
                  loading="lazy"
                  decoding="async"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================
            4. OUR VALUES
           ======================================================== */}
        <section className="section" style={{ background: "#FFFFFF", borderBottom: "1px solid #F0DCE2" }}>
          <div className="container-max">
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
                Core Principles
              </div>
              <h2
                style={{
                  fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
                  fontWeight: 800,
                  color: "#24131A",
                  margin: 0,
                  letterSpacing: "-0.02em",
                }}
              >
                The Values Guiding Us
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  icon: Heart,
                  title: "Connection",
                  desc: "Creating moments that bring people together.",
                  bg: "#FFE1E8",
                  color: "#7A0C2E",
                },
                {
                  icon: Vote,
                  title: "Participation",
                  desc: "Giving everyone a chance to be part of the experience.",
                  bg: "#FFF3F5",
                  color: "#E51B3E",
                },
                {
                  icon: ShieldCheck,
                  title: "Fair Play",
                  desc: "Keeping the competition clear, transparent and accountable.",
                  bg: "#FFE1E8",
                  color: "#7A0C2E",
                },
                {
                  icon: Users,
                  title: "Community",
                  desc: "Celebrating the people who make the event meaningful.",
                  bg: "#FFF3F5",
                  color: "#E51B3E",
                },
              ].map((val) => (
                <div
                  key={val.title}
                  style={{
                    background: "#FFFFFF",
                    border: "1px solid #F0DCE2",
                    borderRadius: 16,
                    padding: "2rem 1.5rem",
                    boxShadow: "0 4px 16px rgba(74, 6, 28, 0.04)",
                  }}
                  className="card-shadow"
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 14,
                      background: val.bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: "1.25rem",
                      border: "1px solid #F0DCE2",
                    }}
                  >
                    <val.icon size={24} color={val.color} />
                  </div>
                  <h3
                    style={{
                      fontSize: "1.125rem",
                      fontWeight: 800,
                      color: "#24131A",
                      marginBottom: "0.5rem",
                    }}
                  >
                    {val.title}
                  </h3>
                  <p
                    style={{
                      fontSize: "0.9375rem",
                      color: "#6B6870",
                      lineHeight: 1.6,
                      margin: 0,
                    }}
                  >
                    {val.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========================================================
            5. FINAL CTA
           ======================================================== */}
        <section
          style={{
            background: "linear-gradient(135deg, #4A061C 0%, #7A0C2E 100%)",
            padding: "4rem 1.25rem",
            color: "#FFFFFF",
            textAlign: "center",
          }}
          aria-label="Make your choice"
        >
          <div className="container-max" style={{ maxWidth: 640 }}>
            <h2
              style={{
                fontSize: "clamp(2rem, 5vw, 3rem)",
                fontWeight: 900,
                color: "#FFFFFF",
                letterSpacing: "-0.03em",
                margin: "0 0 1rem",
              }}
            >
              Ready to Make Your Choice?
            </h2>
            <p
              style={{
                fontSize: "1.125rem",
                color: "rgba(255, 243, 245, 0.85)",
                lineHeight: 1.65,
                margin: "0 0 2rem",
              }}
            >
              Explore the candidates and cast your vote.
            </p>
            <div
              style={{
                display: "flex",
                gap: "1rem",
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <Link to="/candidates">
                <button
                  className="btn-vote"
                  style={{ minHeight: 48, padding: "0.75rem 2rem", fontSize: "1rem" }}
                >
                  <Vote size={18} />
                  EXPLORE CANDIDATES
                </button>
              </Link>
              <Link to="/ranking">
                <button
                  style={{
                    background: "rgba(255,255,255,0.1)",
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderRadius: 12,
                    padding: "0.75rem 2rem",
                    fontSize: "1rem",
                    color: "#ffffff",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    minHeight: 48,
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.2)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)";
                  }}
                >
                  VIEW LIVE RANKING
                  <ArrowRight size={16} />
                </button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <style>{`
        @media (max-width: 1024px) {
          .about-hero-grid {
            grid-template-columns: 1fr !important;
            gap: 2.5rem !important;
          }
        }
        @media (max-width: 768px) {
          .about-gallery-grid > div {
            grid-column: span 12 !important;
          }
        }
      `}</style>
    </>
  );
}
