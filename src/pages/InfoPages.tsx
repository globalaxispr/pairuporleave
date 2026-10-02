import { Helmet } from "react-helmet-async";
import { Mail, Shield, FileText } from "lucide-react";
import { SITE_URL } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Shared styling helpers
// ─────────────────────────────────────────────────────────────────────────────
const sectionTitle = {
  fontSize: "1.0625rem",
  fontWeight: 800,
  color: "#24131A",
  marginBottom: "0.5rem",
  marginTop: "1.75rem",
} as const;

const bodyText = {
  color: "#4B4550",
  lineHeight: 1.75,
  fontSize: "0.9375rem",
  margin: "0 0 0.75rem",
} as const;

const pageWrap = {
  minHeight: "75vh",
  background: "#FFFFFF",
  padding: "3rem 1rem 5rem",
} as const;

const innerWrap = {
  maxWidth: 720,
  margin: "0 auto",
} as const;

const eyebrowBadge = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
  background: "#FFE1E8",
  padding: "0.25rem 0.875rem",
  borderRadius: 9999,
  marginBottom: "1rem",
} as const;

const eyebrowText = {
  fontSize: "0.75rem",
  fontWeight: 800,
  color: "#7A0C2E",
} as const;

const pageTitle = {
  fontSize: "2rem",
  fontWeight: 900,
  color: "#24131A",
  margin: "0 0 0.375rem",
} as const;

const lastUpdated = {
  fontSize: "0.8125rem",
  color: "#9CA3AF",
  marginBottom: "2rem",
} as const;

const divider = {
  borderTop: "1px solid #F0DCE2",
  margin: "2rem 0 0",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT PAGE
// ─────────────────────────────────────────────────────────────────────────────
export function ContactPage() {
  return (
    <>
      <Helmet>
        <title>Contact Us — Pair Up or Leave</title>
        <meta name="description" content="Get in touch with the Pair Up or Leave team. Questions about candidates, voting rules, Stripe payments, or the competition? We're here to help." />
        <meta property="og:title" content="Contact Us — Pair Up or Leave" />
        <meta property="og:description" content="Get in touch with Pair Up or Leave support. Questions about voting, payments, or the competition answered within 24 hours." />
        <meta property="og:url" content={`${SITE_URL}/contact`} />
        <link rel="canonical" href={`${SITE_URL}/contact`} />
      </Helmet>
      <main style={pageWrap} id="main-content">
        <div style={innerWrap}>
          <div style={eyebrowBadge}>
            <Mail size={14} color="#7A0C2E" />
            <span style={eyebrowText}>SUPPORT &amp; INQUIRIES</span>
          </div>
          <h1 style={pageTitle}>Contact Pair Up or Leave</h1>
          <p style={{ ...bodyText, marginBottom: "2rem" }}>
            Have questions about candidates, couple entries, voting rules, or Stripe payment
            verification? Our support team is here to assist.
          </p>

          <div
            style={{
              background: "#FFF8FA",
              border: "1px solid #F0DCE2",
              borderRadius: 16,
              padding: "1.5rem",
              marginBottom: "2rem",
            }}
          >
            <div style={{ fontWeight: 800, color: "#24131A", marginBottom: "0.5rem" }}>
              Email Support
            </div>
            <a
              href="mailto:support@pairuporleave.com"
              style={{ color: "#E51B3E", fontWeight: 700, fontSize: "1.125rem", textDecoration: "none" }}
            >
              support@pairuporleave.com
            </a>
            <div style={{ fontSize: "0.8125rem", color: "#6B6870", marginTop: "0.5rem" }}>
              Typical response time: Under 24 hours. We are available Monday–Friday.
            </div>
          </div>

          <h2 style={sectionTitle}>What we can help with</h2>
          <ul style={{ ...bodyText, paddingLeft: "1.25rem" }}>
            <li>Questions about voting rules or how the contest works</li>
            <li>Payment or Stripe checkout issues</li>
            <li>Questions about a specific candidate or couple entry</li>
            <li>Reporting suspected fraud or abuse</li>
            <li>Media or partnership inquiries</li>
            <li>General feedback about the platform</li>
          </ul>

          <div style={divider} />
          <p style={{ ...bodyText, marginTop: "1.5rem", fontSize: "0.8125rem", color: "#9CA3AF" }}>
            For payment disputes, please also contact your card issuer directly. Stripe handles all
            payment processing and retains transaction records.
          </p>
        </div>
      </main>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVACY POLICY PAGE
// ─────────────────────────────────────────────────────────────────────────────
export function PrivacyPage() {
  return (
    <>
      <Helmet>
        <title>Privacy Policy — Pair Up or Leave</title>
        <meta name="description" content="Read the Pair Up or Leave Privacy Policy. We explain what data is collected during voting, how Stripe handles payments, and your rights as a user." />
        <meta property="og:title" content="Privacy Policy — Pair Up or Leave" />
        <meta property="og:description" content="Pair Up or Leave is committed to voter privacy. Read our full Privacy Policy to understand how we handle your data." />
        <meta property="og:url" content={`${SITE_URL}/privacy`} />
        <link rel="canonical" href={`${SITE_URL}/privacy`} />
      </Helmet>
      <main style={pageWrap} id="main-content">
        <div style={innerWrap}>
          <div style={eyebrowBadge}>
            <Shield size={14} color="#7A0C2E" />
            <span style={eyebrowText}>PRIVACY &amp; SECURITY</span>
          </div>
          <h1 style={pageTitle}>Privacy Policy</h1>
          <p style={lastUpdated}>Last updated: September 2026</p>

          <p style={bodyText}>
            Pair Up or Leave ("we", "us", or "our") is committed to protecting your privacy. This
            Privacy Policy describes how we collect, use, and handle information when you use our
            voting platform at pairuporleave.com (the "Platform"). By using the Platform, you agree
            to the practices described in this policy.
          </p>

          {/* 1 */}
          <h2 style={sectionTitle}>1. Information We Collect</h2>
          <p style={bodyText}>
            <strong>Voting transactions:</strong> When you cast votes, we record the candidate or
            couple you voted for, the number of votes purchased, and the transaction amount. We do
            not require you to create an account or provide a name to vote.
          </p>
          <p style={bodyText}>
            <strong>Payment information:</strong> All payments are processed exclusively through
            Stripe Checkout. We do not collect, store, or have access to your credit card number,
            CVV, or full billing details. Stripe receives and stores payment data directly according
            to their own privacy policy and PCI-DSS compliance standards.
          </p>
          <p style={bodyText}>
            <strong>Technical data:</strong> Like most web services, our hosting provider may
            automatically log standard server data such as IP addresses, browser type, pages
            visited, and access timestamps. This data is used solely for security monitoring and
            service reliability. We do not use it to identify individual users.
          </p>
          <p style={bodyText}>
            <strong>Cookies and local storage:</strong> The Platform uses browser local storage to
            maintain application state (such as session data during the voting flow). This is
            strictly functional. We do not use tracking cookies, advertising cookies, or third-party
            analytics cookies that would require your consent under GDPR or similar regulations.
          </p>

          {/* 2 */}
          <h2 style={sectionTitle}>2. How We Use Information</h2>
          <p style={bodyText}>We use the information we collect exclusively to:</p>
          <ul style={{ ...bodyText, paddingLeft: "1.25rem" }}>
            <li>Process and verify your vote payments via Stripe</li>
            <li>Accurately tally and display vote counts on the live leaderboard</li>
            <li>Maintain the integrity and fairness of the competition</li>
            <li>Investigate and prevent fraudulent transactions or abuse</li>
            <li>Respond to support inquiries you send us directly</li>
          </ul>

          {/* 3 */}
          <h2 style={sectionTitle}>3. Payment Processing via Stripe</h2>
          <p style={bodyText}>
            All payment processing is handled by Stripe, Inc. When you proceed to checkout, you are
            redirected to a Stripe-hosted payment page. Stripe's privacy policy governs how your
            payment data is handled. We receive a confirmation from Stripe once your payment is
            successful, including the vote quantity and candidate reference — but never your raw
            financial data.
          </p>
          <p style={bodyText}>
            Stripe is a PCI-DSS Level 1 certified payment processor. For more information, visit{" "}
            <a
              href="https://stripe.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#E51B3E" }}
            >
              stripe.com/privacy
            </a>
            .
          </p>

          {/* 4 */}
          <h2 style={sectionTitle}>4. Data Sharing</h2>
          <p style={bodyText}>
            We do not sell, rent, or share your personal data with advertisers or third-party
            marketing companies. We may share data only in the following limited circumstances:
          </p>
          <ul style={{ ...bodyText, paddingLeft: "1.25rem" }}>
            <li>
              <strong>Stripe:</strong> For payment processing as described above.
            </li>
            <li>
              <strong>Hosting providers:</strong> Infrastructure providers who host the Platform and
              database, bound by appropriate data processing agreements.
            </li>
            <li>
              <strong>Legal obligations:</strong> If required by law, court order, or to protect the
              rights, safety, or property of the Platform, its users, or the public.
            </li>
          </ul>

          {/* 5 */}
          <h2 style={sectionTitle}>5. Data Retention</h2>
          <p style={bodyText}>
            Vote transaction records are retained for the duration of the competition and for a
            reasonable period thereafter to ensure accuracy and resolve any disputes. Payment
            receipt confirmations received from Stripe are retained as required by our financial
            record-keeping obligations. We do not retain unnecessary data beyond its useful purpose.
          </p>

          {/* 6 */}
          <h2 style={sectionTitle}>6. Security</h2>
          <p style={bodyText}>
            We implement industry-standard security measures to protect the Platform and its data,
            including HTTPS encryption in transit and secure database access controls. However, no
            system is completely infallible. You acknowledge that your use of the Platform is at
            your own risk.
          </p>

          {/* 7 */}
          <h2 style={sectionTitle}>7. Children's Privacy</h2>
          <p style={bodyText}>
            The Platform is not intended for use by individuals under the age of 18. We do not
            knowingly collect information from minors. If you believe a minor has used the Platform,
            please contact us and we will take appropriate action.
          </p>

          {/* 8 */}
          <h2 style={sectionTitle}>8. Your Rights</h2>
          <p style={bodyText}>
            Because the Platform does not require account creation and collects minimal identifying
            information, most data cannot be attributed to a specific individual. If you have a
            specific data request or concern, please contact us at{" "}
            <a href="mailto:support@pairuporleave.com" style={{ color: "#E51B3E" }}>
              support@pairuporleave.com
            </a>{" "}
            and we will respond appropriately.
          </p>

          {/* 9 */}
          <h2 style={sectionTitle}>9. Changes to This Policy</h2>
          <p style={bodyText}>
            We may update this Privacy Policy from time to time. Changes will be posted on this
            page with an updated "Last updated" date. Continued use of the Platform after any
            changes constitutes acceptance of the updated policy.
          </p>

          {/* 10 */}
          <h2 style={sectionTitle}>10. Contact</h2>
          <p style={bodyText}>
            If you have any questions about this Privacy Policy, please contact us at:{" "}
            <a href="mailto:support@pairuporleave.com" style={{ color: "#E51B3E" }}>
              support@pairuporleave.com
            </a>
          </p>

          <div style={divider} />
          <p style={{ ...bodyText, marginTop: "1.5rem", fontSize: "0.8125rem", color: "#9CA3AF" }}>
            Pair Up or Leave · support@pairuporleave.com
          </p>
        </div>
      </main>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TERMS OF SERVICE PAGE
// ─────────────────────────────────────────────────────────────────────────────
export function TermsPage() {
  return (
    <>
      <Helmet>
        <title>Terms of Service — Pair Up or Leave</title>
        <meta name="description" content="Read the Pair Up or Leave Terms of Service. Covers voting rules, pricing ($1/vote individuals, $2/vote couples), ranking, points, penalties, prohibited conduct and more." />
        <meta property="og:title" content="Terms of Service — Pair Up or Leave" />
        <meta property="og:description" content="Full Terms of Service for the Pair Up or Leave voting competition platform." />
        <meta property="og:url" content={`${SITE_URL}/terms`} />
        <link rel="canonical" href={`${SITE_URL}/terms`} />
      </Helmet>
      <main style={pageWrap} id="main-content">
        <div style={innerWrap}>
          <div style={eyebrowBadge}>
            <FileText size={14} color="#7A0C2E" />
            <span style={eyebrowText}>LEGAL TERMS</span>
          </div>
          <h1 style={pageTitle}>Terms of Service</h1>
          <p style={lastUpdated}>Last updated: September 2026</p>

          <p style={bodyText}>
            Please read these Terms of Service ("Terms") carefully before using the Pair Up or
            Leave platform ("Platform," "we," "us," or "our"). By accessing or using the Platform
            you agree to be bound by these Terms. If you do not agree, do not use the Platform.
          </p>

          {/* 1 */}
          <h2 style={sectionTitle}>1. The Platform</h2>
          <p style={bodyText}>
            Pair Up or Leave is a live online voting competition. Participants ("voters") can
            purchase votes for individual candidates or couple entries. Votes directly affect each
            candidate's standing on the public leaderboard. The Platform is intended for
            entertainment and community engagement purposes.
          </p>

          {/* 2 */}
          <h2 style={sectionTitle}>2. Eligibility</h2>
          <p style={bodyText}>
            You must be at least 18 years of age to use the Platform and purchase votes. By using
            the Platform you represent that you meet this requirement. We reserve the right to
            refuse service to anyone for any reason.
          </p>

          {/* 3 */}
          <h2 style={sectionTitle}>3. Voting Rules &amp; Pricing</h2>
          <p style={bodyText}>
            <strong>Individual candidates:</strong> Each vote costs $1.00 USD. The candidate
            receives exactly the number of votes purchased.
          </p>
          <p style={bodyText}>
            <strong>Couple entries:</strong> Each vote costs $2.00 USD. The couple receives exactly
            the number of votes purchased.
          </p>
          <p style={bodyText}>
            There is no maximum vote purchase limit per transaction. You may vote for the same
            candidate or couple multiple times. Votes are non-transferable between candidates.
          </p>

          {/* 4 */}
          <h2 style={sectionTitle}>4. Payment</h2>
          <p style={bodyText}>
            All payments are processed securely through Stripe Checkout. You will be redirected to
            a Stripe-hosted payment page to complete your transaction. By proceeding to payment you
            agree to Stripe's terms of service. The Platform does not store your payment card
            details.
          </p>
          <p style={bodyText}>
            All charges are in USD. You are responsible for any applicable bank fees or currency
            conversion charges imposed by your financial institution.
          </p>

          {/* 5 */}
          <h2 style={sectionTitle}>5. Vote Confirmation &amp; Finality</h2>
          <p style={bodyText}>
            Votes are credited to a candidate's score only after Stripe confirms the payment via
            secure webhook. This typically occurs within seconds of a successful transaction. Once
            confirmed and posted to the leaderboard, votes are permanent and cannot be transferred
            or reversed.
          </p>

          {/* 6 */}
          <h2 style={sectionTitle}>6. Rankings &amp; Score System</h2>
          <p style={bodyText}>
            A candidate's overall score is calculated as:
          </p>
          <p
            style={{
              background: "#FFF8FA",
              border: "1px solid #F0DCE2",
              borderRadius: 10,
              padding: "0.75rem 1rem",
              fontFamily: "monospace",
              fontSize: "0.9375rem",
              color: "#24131A",
              marginBottom: "0.75rem",
            }}
          >
            Score = Paid Votes + Points Added − Penalty Points
          </p>
          <p style={bodyText}>
            The Platform administrators may award points to recognise
            exceptional engagement or correct administrative errors. Administrators may also apply{" "}
            <strong>penalty points</strong> in response to confirmed rule violations. All
            administrative adjustments are strictly audited to ensure competition integrity. A candidate's score
            cannot fall below zero.
          </p>

          {/* 7 */}
          <h2 style={sectionTitle}>7. Candidate Participation</h2>
          <p style={bodyText}>
            Candidates and couple entries are registered by Platform administrators. Candidates
            agree to participate in good faith and comply with any rules communicated to them
            directly. Administrators reserve the right to pause or remove a candidate's voting
            eligibility at any time for rule violations or other operational reasons.
          </p>

          {/* 8 */}
          <h2 style={sectionTitle}>8. Prohibited Conduct</h2>
          <p style={bodyText}>The following are strictly prohibited:</p>
          <ul style={{ ...bodyText, paddingLeft: "1.25rem" }}>
            <li>Purchasing votes using stolen, fraudulent, or unauthorised payment methods</li>
            <li>Initiating chargebacks or payment disputes to reverse legitimate vote transactions</li>
            <li>
              Using automated bots, scripts, or other tools to manipulate vote counts or access the
              Platform
            </li>
            <li>Attempting to exploit or circumvent any part of the voting or payment system</li>
            <li>Impersonating any candidate, administrator, or other person</li>
            <li>Coordinating vote manipulation schemes or abuse of the bonus/penalty system</li>
            <li>Harassing, threatening, or abusing candidates, voters, or Platform staff</li>
          </ul>
          <p style={bodyText}>
            Violations may result in vote cancellation, permanent ban from the Platform, and/or
            referral to relevant authorities.
          </p>

          {/* 9 */}
          <h2 style={sectionTitle}>9. Refunds &amp; Payment Disputes</h2>
          <p style={bodyText}>
            All vote purchases are <strong>final and non-refundable</strong> once confirmed. Because
            votes are immediately credited to a candidate's live score, we cannot offer refunds
            after confirmation. If you experience a technical error during checkout that resulted in
            a charge without a vote being recorded, please contact us at{" "}
            <a href="mailto:support@pairuporleave.com" style={{ color: "#E51B3E" }}>
              support@pairuporleave.com
            </a>{" "}
            within 48 hours and we will investigate.
          </p>
          <p style={bodyText}>
            Fraudulent chargebacks will result in the immediate cancellation of any associated votes
            and a permanent ban from the Platform.
          </p>

          {/* 10 */}
          <h2 style={sectionTitle}>10. Competition Modifications</h2>
          <p style={bodyText}>
            We reserve the right to modify the competition format, extend or shorten the competition
            period, add or remove candidates, adjust pricing, or discontinue the Platform at any
            time. We will make reasonable efforts to communicate significant changes to voters in
            advance. No compensation is owed for changes to the competition format.
          </p>

          {/* 11 */}
          <h2 style={sectionTitle}>11. Intellectual Property</h2>
          <p style={bodyText}>
            All content on the Platform, including but not limited to text, graphics, logos, and
            design elements, is the property of Pair Up or Leave or used with permission. You may
            not reproduce, distribute, or create derivative works from Platform content without
            written permission.
          </p>

          {/* 12 */}
          <h2 style={sectionTitle}>12. Disclaimer of Warranties</h2>
          <p style={bodyText}>
            The Platform is provided "as is" without warranties of any kind, express or implied. We
            do not guarantee uninterrupted access, error-free operation, or that voting results will
            remain unchanged in the event of fraud investigation. To the fullest extent permitted by
            law, we disclaim all warranties.
          </p>

          {/* 13 */}
          <h2 style={sectionTitle}>13. Limitation of Liability</h2>
          <p style={bodyText}>
            To the fullest extent permitted by applicable law, Pair Up or Leave shall not be liable
            for any indirect, incidental, special, consequential, or punitive damages arising from
            your use of the Platform, including but not limited to loss of votes, data, or
            goodwill. Our total liability to you for any claim shall not exceed the amount you paid
            for votes in the 30 days preceding the claim.
          </p>

          {/* 14 */}
          <h2 style={sectionTitle}>14. Changes to These Terms</h2>
          <p style={bodyText}>
            We may update these Terms from time to time. Updated Terms will be posted on this page
            with a revised "Last updated" date. Continued use of the Platform after any changes
            constitutes acceptance of the revised Terms.
          </p>

          {/* 15 */}
          <h2 style={sectionTitle}>15. Contact</h2>
          <p style={bodyText}>
            If you have questions about these Terms, please contact us at:{" "}
            <a href="mailto:support@pairuporleave.com" style={{ color: "#E51B3E" }}>
              support@pairuporleave.com
            </a>
          </p>

          <div style={divider} />
          <p style={{ ...bodyText, marginTop: "1.5rem", fontSize: "0.8125rem", color: "#9CA3AF" }}>
            Pair Up or Leave · support@pairuporleave.com
          </p>
        </div>
      </main>
    </>
  );
}
