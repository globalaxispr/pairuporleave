import { Link } from "react-router-dom";
import { ShieldCheck, Mail } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      style={{
        background: "#4A061C",
        color: "#FFE1E8",
        borderTop: "1px solid rgba(240, 220, 226, 0.15)",
        position: "relative",
      }}
      role="contentinfo"
      className="reveal-fade-up"
    >
      <div className="container-max" style={{ padding: "4rem 1.25rem 2.5rem" }}>
        {/* Main 4-Column Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8 mb-12">
          {/* Column 1: Brand & Description */}
          <div>
            <Link
              to="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none",
                marginBottom: "1.25rem",
              }}
              aria-label="Pair Up or Leave Home"
            >
              <picture>
                <source srcSet="/logo.webp" type="image/webp" />
                <img
                  src="/logo@2x.png"
                  alt="Pair Up or Leave"
                  style={{
                    height: 44,
                    width: "auto",
                    objectFit: "contain",
                    display: "block",
                  }}
                />
              </picture>
            </Link>
            <p
              style={{
                color: "rgba(255, 243, 245, 0.85)",
                fontSize: "0.9375rem",
                lineHeight: 1.6,
                margin: "0 0 1.25rem",
                maxWidth: 290,
              }}
            >
              A live voting competition built around people, choices and unforgettable moments.
            </p>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 225, 232, 0.15)",
                padding: "0.45rem 0.85rem",
                borderRadius: 10,
                fontSize: "0.8125rem",
                color: "#FFE1E8",
              }}
            >
              <ShieldCheck size={16} color="#FF5475" />
              <span>Payments verified via Stripe</span>
            </div>
          </div>

          {/* Column 2: Explore */}
          <div>
            <h4
              style={{
                fontSize: "0.8125rem",
                fontWeight: 800,
                color: "#FFE1E8",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: "1.25rem",
              }}
            >
              Explore
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {[
                { label: "Candidates", to: "/candidates" },
                { label: "Ranking", to: "/ranking" },
                { label: "Results", to: "/results" },
                { label: "About", to: "/about" },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  style={{
                    color: "rgba(255, 255, 255, 0.82)",
                    textDecoration: "none",
                    fontSize: "0.9375rem",
                    transition: "color 0.15s ease",
                    minHeight: 28,
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.color = "#FFFFFF";
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.color = "rgba(255, 255, 255, 0.82)";
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Column 3: How It Works */}
          <div>
            <h4
              style={{
                fontSize: "0.8125rem",
                fontWeight: 800,
                color: "#FFE1E8",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: "1.25rem",
              }}
            >
              How It Works
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {[
                { label: "How Voting Works", to: "/how-it-works" },
                { label: "Individual Voting ($1/vote)", to: "/how-it-works" },
                { label: "Couple Voting ($2/vote)", to: "/how-it-works" },
                { label: "FAQ", to: "/how-it-works#faq" },
              ].map((item, idx) => (
                <Link
                  key={idx}
                  to={item.to}
                  style={{
                    color: "rgba(255, 255, 255, 0.82)",
                    textDecoration: "none",
                    fontSize: "0.9375rem",
                    transition: "color 0.15s ease",
                    minHeight: 28,
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.color = "#FFFFFF";
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.color = "rgba(255, 255, 255, 0.82)";
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Column 4: Connect & Inquiries */}
          <div>
            <h4
              style={{
                fontSize: "0.8125rem",
                fontWeight: 800,
                color: "#FFE1E8",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: "1.25rem",
              }}
            >
              Support & Connect
            </h4>
            <p
              style={{
                color: "rgba(255, 243, 245, 0.8)",
                fontSize: "0.875rem",
                lineHeight: 1.5,
                margin: "0 0 1rem",
              }}
            >
              Questions about candidates, rules, or voting?
            </p>
            <a
              href="mailto:support@pairuporleave.com"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                color: "#FFFFFF",
                background: "rgba(255, 255, 255, 0.1)",
                border: "1px solid rgba(255, 225, 232, 0.2)",
                borderRadius: 10,
                padding: "0.625rem 1rem",
                fontSize: "0.875rem",
                fontWeight: 700,
                textDecoration: "none",
                transition: "all 0.15s ease",
                minHeight: 44,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255, 255, 255, 0.18)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255, 255, 255, 0.1)";
              }}
            >
              <Mail size={16} color="#FF5475" />
              support@pairuporleave.com
            </a>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Legal */}
        <div
          style={{
            borderTop: "1px solid rgba(255, 225, 232, 0.15)",
            paddingTop: "2rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            fontSize: "0.875rem",
            color: "rgba(255, 225, 232, 0.75)",
          }}
          className="sm:flex-row"
        >
          <div>© {currentYear} Pair Up or Leave. All rights reserved.</div>

          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
            <Link
              to="/privacy"
              style={{
                color: "rgba(255, 225, 232, 0.8)",
                textDecoration: "none",
                transition: "color 0.15s ease",
                minHeight: 44,
                display: "inline-flex",
                alignItems: "center",
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "#FFFFFF"; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "rgba(255, 225, 232, 0.8)"; }}
            >
              Privacy Policy
            </Link>
            <Link
              to="/terms"
              style={{
                color: "rgba(255, 225, 232, 0.8)",
                textDecoration: "none",
                transition: "color 0.15s ease",
                minHeight: 44,
                display: "inline-flex",
                alignItems: "center",
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "#FFFFFF"; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "rgba(255, 225, 232, 0.8)"; }}
            >
              Terms of Service
            </Link>
            <Link
              to="/contact"
              style={{
                color: "rgba(255, 225, 232, 0.8)",
                textDecoration: "none",
                transition: "color 0.15s ease",
                minHeight: 44,
                display: "inline-flex",
                alignItems: "center",
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "#FFFFFF"; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "rgba(255, 225, 232, 0.8)"; }}
            >
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
