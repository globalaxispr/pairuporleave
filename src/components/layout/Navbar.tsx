import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, Vote } from "lucide-react";

const desktopNavLinks = [
  { label: "Candidates", to: "/candidates" },
  { label: "Ranking", to: "/ranking" },
  { label: "Results", to: "/results" },
  { label: "About", to: "/about" },
];

const mobileNavLinks = [
  { label: "Home", to: "/" },
  { label: "Candidates", to: "/candidates" },
  { label: "Ranking", to: "/ranking" },
  { label: "Results", to: "/results" },
  { label: "How It Works", to: "/how-it-works" },
  { label: "About", to: "/about" },
  { label: "Contact", to: "/contact" },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const isActive = (to: string) =>
    to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);

  const handleVoteClick = () => {
    if (location.pathname === "/") {
      const el = document.getElementById("live-ranking");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }
    navigate("/candidates");
  };

  return (
    <>
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          background: scrolled
            ? "rgba(255, 255, 255, 0.97)"
            : "rgba(255, 255, 255, 0.98)",
          borderBottom: "1px solid #F0DCE2",
          backdropFilter: "blur(12px)",
          transition: "box-shadow 0.2s ease",
          boxShadow: scrolled ? "0 4px 16px rgba(74, 6, 28, 0.06)" : "none",
        }}
      >
        <div
          className="container-max"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.625rem 1rem",
            minHeight: 58,
          }}
        >
          {/* Logo (Left) */}
          <Link
            to="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.625rem",
              textDecoration: "none",
            }}
            aria-label="Pair Up or Leave Home"
          >
            <picture>
              <source srcSet="/logo.webp" type="image/webp" />
              <img
                src="/logo@2x.png"
                alt="Pair Up or Leave"
                width={150}
                height={38}
                decoding="async"
                style={{
                  height: 38,
                  width: "auto",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </picture>
          </Link>

          {/* Desktop Center Navigation (Visible on lg: 1024px+) */}
          <nav
            aria-label="Main navigation"
            className="hidden lg:flex items-center gap-1.5"
          >
            {desktopNavLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`nav-link ${isActive(link.to) ? "active" : ""}`}
                style={{
                  padding: "0.4rem 0.95rem",
                  fontSize: "0.9375rem",
                  fontWeight: isActive(link.to) ? 800 : 600,
                  borderRadius: 10,
                  transition: "all 0.15s ease",
                }}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Desktop Single Vote CTA (Visible on lg: 1024px+) */}
          <div className="hidden lg:flex items-center">
            <button
              className="btn-vote"
              onClick={handleVoteClick}
              style={{
                minHeight: 42,
                padding: "0.5rem 1.4rem",
                fontSize: "0.9375rem",
                fontWeight: 800,
                letterSpacing: "0.02em",
              }}
              aria-label="Vote now"
            >
              <Vote size={16} />
              VOTE NOW
            </button>
          </div>

          {/* Mobile Right Controls: ONLY the Hamburger Button (Hidden on lg: 1024px+) */}
          <div className="flex lg:hidden items-center">
            <button
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "0.5rem",
                color: "#1F2937",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 44,
                minHeight: 44,
              }}
            >
              {mobileOpen ? <X size={26} /> : <Menu size={26} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="lg:hidden"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 48,
            background: "rgba(0, 0, 0, 0.4)",
            backdropFilter: "blur(3px)",
          }}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile Slide-Over Navigation Panel */}
      <div
        className="lg:hidden"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
          width: "min(320px, 85vw)",
          background: "#FFFFFF",
          boxShadow: "-4px 0 24px rgba(0, 0, 0, 0.15)",
          transform: mobileOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          display: "flex",
          flexDirection: "column",
          padding: "1.25rem 1.25rem 2rem",
          overflowY: "auto",
        }}
        aria-label="Mobile navigation"
      >
        {/* Panel Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.5rem",
            paddingBottom: "0.75rem",
            borderBottom: "1px solid #F0DCE2",
          }}
        >
          <Link
            to="/"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}
            onClick={() => setMobileOpen(false)}
            aria-label="Pair Up or Leave Home"
          >
            <picture>
              <source srcSet="/logo.webp" type="image/webp" />
              <img
                src="/logo@2x.png"
                alt="Pair Up or Leave"
                width={126}
                height={32}
                loading="lazy"
                decoding="async"
                style={{
                  height: 32,
                  width: "auto",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </picture>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            style={{
              background: "#FFF3F5",
              border: "1px solid #F0DCE2",
              cursor: "pointer",
              padding: "0.375rem",
              color: "#7A0C2E",
              borderRadius: 8,
              minWidth: 40,
              minHeight: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Items (large touch targets >= 48px) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", flex: 1 }}>
          {mobileNavLinks.map((link) => {
            const active = isActive(link.to);
            return (
              <Link
                key={link.to}
                to={link.to}
                style={{
                  display: "flex",
                  alignItems: "center",
                  minHeight: 48,
                  padding: "0.75rem 1rem",
                  borderRadius: 12,
                  fontWeight: active ? 800 : 600,
                  fontSize: "1.0625rem",
                  color: active ? "#7A0C2E" : "#374151",
                  background: active ? "#FFE1E8" : "transparent",
                  border: active ? "1px solid #F0DCE2" : "1px solid transparent",
                  textDecoration: "none",
                  transition: "background 0.15s ease",
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Panel Bottom Single Vote CTA */}
        <div style={{ marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid #F0DCE2" }}>
          <button
            className="btn-vote"
            onClick={() => {
              navigate("/candidates");
              setMobileOpen(false);
            }}
            style={{
              width: "100%",
              justifyContent: "center",
              minHeight: 48,
              fontSize: "1rem",
              fontWeight: 800,
            }}
            aria-label="Vote now"
          >
            <Vote size={18} />
            Vote Now
          </button>
        </div>
      </div>

      {/* Header Fixed Spacer */}
      <div style={{ height: 56 }} aria-hidden="true" />
    </>
  );
}
