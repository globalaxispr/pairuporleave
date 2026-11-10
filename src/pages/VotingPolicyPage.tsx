import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ShieldCheck, ArrowLeft, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { SITE_URL } from "@/lib/utils";

const pageWrap: React.CSSProperties = {
  minHeight: "100vh",
  background: "#FFFFFF",
  paddingTop: "6rem",
  paddingBottom: "5rem",
  paddingLeft: "1.25rem",
  paddingRight: "1.25rem",
};

const innerWrap: React.CSSProperties = {
  maxWidth: 820,
  margin: "0 auto",
};

const eyebrowBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
  background: "#FFF3F5",
  border: "1px solid #F0DCE2",
  borderRadius: 99,
  padding: "0.35rem 0.85rem",
  marginBottom: "1.25rem",
};

const eyebrowText: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 800,
  letterSpacing: "0.08em",
  color: "#7A0C2E",
  textTransform: "uppercase",
};

const pageTitle: React.CSSProperties = {
  fontSize: "clamp(2rem, 4vw, 2.75rem)",
  fontWeight: 900,
  color: "#24131A",
  letterSpacing: "-0.03em",
  lineHeight: 1.15,
  margin: "0 0 0.75rem",
};

const lastUpdated: React.CSSProperties = {
  fontSize: "0.875rem",
  color: "#6B6870",
  margin: "0 0 2rem",
};

const summaryBox: React.CSSProperties = {
  background: "linear-gradient(180deg, #FFF8FA 0%, #FFF3F5 100%)",
  border: "1.5px solid #F0DCE2",
  borderRadius: 16,
  padding: "1.25rem 1.5rem",
  marginBottom: "2.5rem",
  boxShadow: "0 4px 16px rgba(74, 6, 28, 0.04)",
};

const sectionTitle: React.CSSProperties = {
  fontSize: "1.25rem",
  fontWeight: 800,
  color: "#24131A",
  letterSpacing: "-0.02em",
  marginTop: "2.25rem",
  marginBottom: "0.75rem",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
};

const bodyText: React.CSSProperties = {
  fontSize: "1rem",
  lineHeight: 1.7,
  color: "#4B4850",
  margin: "0 0 1rem",
};

export function VotingPolicyPage() {
  return (
    <>
      <Helmet>
        <title>Voting Policy — All Votes Are Final | PAIR UP OR LEAVE</title>
        <meta
          name="description"
          content="Official PAIR UP OR LEAVE Voting Policy. All votes are final once payment is confirmed and credited. Understand refund, dispute, cancellation, and deadline policies."
        />
        <meta property="og:title" content="Voting Policy — All Votes Are Final | PAIR UP OR LEAVE" />
        <meta
          property="og:description"
          content="Review the official voting rules, refund exceptions, dispute process, and deadline integrity for PAIR UP OR LEAVE."
        />
        <meta property="og:url" content={`${SITE_URL}/voting-policy`} />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={`${SITE_URL}/voting-policy`} />
      </Helmet>

      <main style={pageWrap} id="main-content">
        <div style={innerWrap}>
          {/* Breadcrumb / Back Link */}
          <div style={{ marginBottom: "1.5rem" }}>
            <Link
              to="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                color: "#7A0C2E",
                fontSize: "0.875rem",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              <ArrowLeft size={16} />
              Back to Home
            </Link>
          </div>

          <div style={eyebrowBadge}>
            <ShieldCheck size={14} color="#7A0C2E" />
            <span style={eyebrowText}>OFFICIAL COMPETITION POLICY</span>
          </div>

          <h1 style={pageTitle}>Voting Policy — All Votes Are Final</h1>
          <p style={lastUpdated}>Effective Date: November 2026 · Official Rules</p>

          {/* Quick Notice Summary Box */}
          <div style={summaryBox} role="region" aria-label="Policy Summary">
            <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
              <AlertCircle size={20} color="#E51B3E" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 800, color: "#7A0C2E", fontSize: "0.9375rem", marginBottom: "0.25rem" }}>
                  Important Purchase Disclosure
                </div>
                <p style={{ margin: 0, fontSize: "0.875rem", color: "#4B4850", lineHeight: 1.55 }}>
                  All votes are final once payment has been successfully processed and credited. Because votes are digital
                  participation purchases that immediately update live competition leaderboards, completed purchases are
                  generally non-refundable, except where required by law or applicable payment network rules.
                </p>
              </div>
            </div>
          </div>

          {/* Section 1 */}
          <h2 style={sectionTitle}>
            <span>1. Finality of Votes</span>
          </h2>
          <p style={bodyText}>
            All votes are final once payment has been successfully processed and the corresponding votes have been
            credited to the selected participant. Votes immediately and irreversibly apply to the live competition
            standings.
          </p>

          {/* Section 2 */}
          <h2 style={sectionTitle}>
            <span>2. Refund Policy</span>
          </h2>
          <p style={bodyText}>
            Because votes are digital participation purchases that are credited after successful payment, completed and
            correctly fulfilled voting purchases are generally non-refundable.
          </p>
          <p style={bodyText}>
            Refunds or other remedies may still be provided where required by applicable law, payment network rules, or in
            cases such as unauthorized transactions, duplicate charges, or failure to deliver purchased votes.
          </p>

          {/* Section 3 */}
          <h2 style={sectionTitle}>
            <span>3. Vote Cancellation</span>
          </h2>
          <p style={bodyText}>
            Once votes have been successfully credited, voters cannot independently cancel, transfer, reverse, or
            reassign them to another participant.
          </p>

          {/* Section 4 */}
          <h2 style={sectionTitle}>
            <span>4. Payment Disputes</span>
          </h2>
          <p style={bodyText}>
            Unauthorized payments, duplicate charges, billing errors, and chargebacks will be reviewed by the platform
            administrator in accordance with applicable laws and payment processor requirements.
          </p>
          <p style={bodyText}>
            If you believe an unauthorized transaction or billing discrepancy occurred, please contact support promptly at{" "}
            <a
              href="mailto:support@pairuporleave.com"
              style={{ color: "#7A0C2E", fontWeight: 700, textDecoration: "underline" }}
            >
              support@pairuporleave.com
            </a>{" "}
            with your payment details and Stripe transaction reference.
          </p>

          {/* Section 5 */}
          <h2 style={sectionTitle}>
            <span>5. Vote Integrity</span>
          </h2>
          <p style={bodyText}>
            PAIR UP OR LEAVE maintains payment verification and vote-recording controls designed to prevent duplicate
            crediting and unauthorized score manipulation. Every purchased vote is anchored to an immutable ledger and
            authoritative Stripe payment verification.
          </p>

          {/* Section 6 */}
          <h2 style={sectionTitle}>
            <Clock size={18} color="#E51B3E" />
            <span>6. Voting Deadline</span>
          </h2>
          <p style={bodyText}>
            Voting closes on <strong>December 1, 2026, at 11:59 PM, America/New_York time</strong> (equivalent to
            December 2, 2026, at 04:59 UTC), unless the official competition schedule is changed by the organizer.
          </p>
          <p style={bodyText}>
            After the deadline passes, no new voting transactions will be accepted. Any valid checkout sessions created
            prior to the deadline remain eligible for automatic confirmation and crediting within standard grace periods.
          </p>

          {/* Section 7 */}
          <h2 style={sectionTitle}>
            <CheckCircle2 size={18} color="#15803D" />
            <span>7. Acceptance of Terms</span>
          </h2>
          <p style={bodyText}>
            By completing a voting purchase, the voter acknowledges the applicable Voting Policy and Terms and
            Conditions, subject to mandatory consumer protections.
          </p>

          {/* Navigation Links */}
          <div
            style={{
              marginTop: "3.5rem",
              paddingTop: "2rem",
              borderTop: "1px solid #F0DCE2",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <Link
              to="/terms"
              style={{
                color: "#7A0C2E",
                fontSize: "0.875rem",
                fontWeight: 700,
                textDecoration: "underline",
              }}
            >
              Terms of Service
            </Link>
            <Link
              to="/privacy"
              style={{
                color: "#7A0C2E",
                fontSize: "0.875rem",
                fontWeight: 700,
                textDecoration: "underline",
              }}
            >
              Privacy Policy
            </Link>
            <Link
              to="/candidates"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                background: "#7A0C2E",
                color: "#FFFFFF",
                padding: "0.625rem 1.25rem",
                borderRadius: 12,
                fontSize: "0.875rem",
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              View Candidates & Leaderboard
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

