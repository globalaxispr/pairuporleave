import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate, useLocation } from "react-router-dom";
import { Zap, Mail, Lock, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export function AdminLoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/admin";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);

    const { error: err } = await signIn(email, password);
    if (err) {
      setError(err);
      setLoading(false);
    } else {
      navigate(from, { replace: true });
    }
  }

  return (
    <>
      <Helmet>
        <title>Admin Login — Pair Up or Leave</title>
      </Helmet>

      <main
        style={{
          minHeight: "100vh",
          background: "linear-gradient(135deg, #4A061C 0%, #7A0C2E 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            borderRadius: 24,
            border: "1px solid #F0DCE2",
            padding: "2.5rem",
            width: "100%",
            maxWidth: 420,
            boxShadow: "0 20px 60px rgba(74,6,28,0.25)",
          }}
        >
          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
            <picture>
              <source srcSet="/logo.webp" type="image/webp" />
              <img
                src="/logo@2x.png"
                alt="Pair Up or Leave"
                style={{
                  height: 52,
                  width: "auto",
                  margin: "0 auto 1rem",
                  display: "block",
                  objectFit: "contain",
                }}
              />
            </picture>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#24131A", margin: "0 0 0.25rem" }}>
              Admin Login
            </h1>
            <p style={{ fontSize: "0.9375rem", color: "#6B6870", margin: 0 }}>
              Pair Up or Leave Administration
            </p>
          </div>

          {/* Development Mode Notice */}
          {import.meta.env.DEV && (
            <div
              style={{
                background: "#FEF3C7",
                border: "1px solid #FCD34D",
                borderRadius: 10,
                padding: "0.625rem 0.875rem",
                marginBottom: "1.25rem",
                fontSize: "0.75rem",
                color: "#92400E",
                lineHeight: 1.4,
              }}
              role="note"
            >
              <strong>Development Mode:</strong> Demo login fallback is active for local testing only. It is strictly disabled in production.
            </div>
          )}

          <form onSubmit={(e) => { void handleSubmit(e); }}>
            {/* Email */}
            <div style={{ marginBottom: "1rem" }}>
              <label htmlFor="admin-email" style={{ display: "block", fontWeight: 600, fontSize: "0.875rem", color: "#374151", marginBottom: "0.5rem" }}>
                Email Address
              </label>
              <div style={{ position: "relative" }}>
                <Mail size={16} color="#9CA3AF" style={{ position: "absolute", left: "0.875rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <input
                  type="email"
                  id="admin-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  className="input-field"
                  style={{ paddingLeft: "2.5rem" }}
                  aria-label="Admin email address"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label htmlFor="admin-password" style={{ display: "block", fontWeight: 600, fontSize: "0.875rem", color: "#374151", marginBottom: "0.5rem" }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <Lock size={16} color="#9CA3AF" style={{ position: "absolute", left: "0.875rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <input
                  type="password"
                  id="admin-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="input-field"
                  style={{ paddingLeft: "2.5rem" }}
                  aria-label="Admin password"
                  autoComplete="current-password"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "0.75rem 1rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}
                role="alert"
              >
                <AlertCircle size={15} color="#DC2626" />
                <span style={{ fontSize: "0.875rem", color: "#DC2626" }}>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn-primary"
              style={{ width: "100%", justifyContent: "center", opacity: loading ? 0.8 : 1 }}
              disabled={loading}
              id="admin-login-btn"
            >
              {loading ? (
                <>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  Signing In...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      </main>
    </>
  );
}
