import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { Helmet, HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/contexts/AuthContext";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ProtectedRoute } from "@/components/admin/ProtectedRoute";

// Public pages
import { HomePage } from "@/pages/HomePage";
import { CandidatesPage } from "@/pages/CandidatesPage";
import { CandidateProfilePage } from "@/pages/CandidateProfilePage";
import { ResultsPage } from "@/pages/ResultsPage";
import { HowItWorksPage } from "@/pages/HowItWorksPage";
import { AboutPage } from "@/pages/AboutPage";
import { VoteSuccessPage } from "@/pages/VoteSuccessPage";
import { VoteCancelPage } from "@/pages/VoteCancelPage";
import { RankingPage } from "@/pages/RankingPage";
import { MobileStickyVote } from "@/components/layout/MobileStickyVote";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { ContactPage, PrivacyPage, TermsPage } from "@/pages/InfoPages";

// Admin pages
import { AdminLoginPage } from "@/pages/admin/AdminLoginPage";
import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";
import { AdminCandidatesPage } from "@/pages/admin/AdminCandidatesPage";
import { AdminPaymentsPage } from "@/pages/admin/AdminPaymentsPage";
import { AdminAnalyticsPage } from "@/pages/admin/AdminAnalyticsPage";
import { AdminLedgerPage } from "@/pages/admin/AdminLedgerPage";

// Layout wrapper for public pages
function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
      <Footer />
      <MobileStickyVote />
    </>
  );
}

// Branded 404 page
function NotFoundPage() {
  return (
    <>
      <Helmet>
        <title>Page Not Found — Pair Up or Leave</title>
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      <main
      id="main-content"
      style={{
        minHeight: "72vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        textAlign: "center",
        padding: "4rem 1.5rem",
        background: "#FFFFFF",
      }}
    >
      {/* Eyebrow badge */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          background: "#FFE1E8",
          border: "1px solid #F0DCE2",
          padding: "0.25rem 0.875rem",
          borderRadius: 9999,
          marginBottom: "1.25rem",
        }}
      >
        <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#7A0C2E", letterSpacing: "0.08em" }}>
          PAGE NOT FOUND
        </span>
      </div>

      {/* 404 number */}
      <div
        style={{
          fontSize: "clamp(5rem, 18vw, 9rem)",
          fontWeight: 900,
          color: "#7A0C2E",
          lineHeight: 1,
          marginBottom: "0.75rem",
          letterSpacing: "-0.04em",
        }}
        aria-hidden="true"
      >
        404
      </div>

      <h1
        style={{
          fontSize: "clamp(1.25rem, 3vw, 1.75rem)",
          fontWeight: 800,
          color: "#24131A",
          margin: "0 0 0.75rem",
          letterSpacing: "-0.02em",
        }}
      >
        Looks like this page took a wrong turn.
      </h1>

      <p
        style={{
          fontSize: "1rem",
          color: "#6B6870",
          maxWidth: 420,
          lineHeight: 1.6,
          margin: "0 0 2.25rem",
        }}
      >
        The page you're looking for doesn't exist or may have moved.
      </p>

      {/* CTAs */}
      <div style={{ display: "flex", gap: "0.875rem", flexWrap: "wrap", justifyContent: "center" }}>
        <Link
          to="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "#E51B3E",
            color: "#FFFFFF",
            fontWeight: 800,
            fontSize: "0.9375rem",
            padding: "0.75rem 1.5rem",
            borderRadius: 12,
            textDecoration: "none",
            minHeight: 48,
            boxShadow: "0 2px 8px rgba(229, 27, 62, 0.3)",
          }}
        >
          ← Back Home
        </Link>
        <Link
          to="/candidates"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "#FFE1E8",
            color: "#7A0C2E",
            fontWeight: 800,
            fontSize: "0.9375rem",
            padding: "0.75rem 1.5rem",
            borderRadius: 12,
            textDecoration: "none",
            minHeight: 48,
            border: "1.5px solid #F0DCE2",
          }}
        >
          Explore Candidates
        </Link>
      </div>
    </main>
    </>
  );
}

export default function App() {
  return (
    <HelmetProvider>
      <AuthProvider>
        <BrowserRouter>
          <ScrollToTop />
          <a
            href="#main-content"
            style={{
              position: "absolute",
              top: "-40px",
              left: 0,
              background: "#7A0C2E",
              color: "#fff",
              padding: "0.5rem 1rem",
              zIndex: 999,
              textDecoration: "none",
              fontWeight: 600,
            }}
            onFocus={(e) => { (e.target as HTMLElement).style.top = "0"; }}
            onBlur={(e) => { (e.target as HTMLElement).style.top = "-40px"; }}
          >
            Skip to main content
          </a>

          <Routes>
            {/* Public routes */}
            <Route
              path="/"
              element={
                <PublicLayout>
                  <HomePage />
                </PublicLayout>
              }
            />
            <Route
              path="/candidates"
              element={
                <PublicLayout>
                  <CandidatesPage />
                </PublicLayout>
              }
            />
            <Route
              path="/candidate/:id"
              element={
                <PublicLayout>
                  <CandidateProfilePage />
                </PublicLayout>
              }
            />
            <Route
              path="/ranking"
              element={
                <PublicLayout>
                  <RankingPage />
                </PublicLayout>
              }
            />
            <Route
              path="/results"
              element={
                <PublicLayout>
                  <ResultsPage />
                </PublicLayout>
              }
            />
            <Route
              path="/how-it-works"
              element={
                <PublicLayout>
                  <HowItWorksPage />
                </PublicLayout>
              }
            />
            <Route
              path="/about"
              element={
                <PublicLayout>
                  <AboutPage />
                </PublicLayout>
              }
            />
            <Route
              path="/vote/success"
              element={
                <PublicLayout>
                  <VoteSuccessPage />
                </PublicLayout>
              }
            />
            <Route
              path="/vote/cancel"
              element={
                <PublicLayout>
                  <VoteCancelPage />
                </PublicLayout>
              }
            />
            <Route
              path="/contact"
              element={
                <PublicLayout>
                  <ContactPage />
                </PublicLayout>
              }
            />
            <Route
              path="/privacy"
              element={
                <PublicLayout>
                  <PrivacyPage />
                </PublicLayout>
              }
            />
            <Route
              path="/terms"
              element={
                <PublicLayout>
                  <TermsPage />
                </PublicLayout>
              }
            />

            {/* Admin routes */}
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/candidates"
              element={
                <ProtectedRoute>
                  <AdminCandidatesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/ledger"
              element={
                <ProtectedRoute>
                  <AdminLedgerPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/payments"
              element={
                <ProtectedRoute>
                  <AdminPaymentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/analytics"
              element={
                <ProtectedRoute>
                  <AdminAnalyticsPage />
                </ProtectedRoute>
              }
            />

            {/* 404 */}
            <Route
              path="*"
              element={
                <PublicLayout>
                  <NotFoundPage />
                </PublicLayout>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </HelmetProvider>
  );
}
