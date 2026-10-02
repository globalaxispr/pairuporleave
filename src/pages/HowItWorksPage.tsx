import { Helmet } from "react-helmet-async";
import { HowItWorksSection } from "@/components/home/HowItWorksSection";
import { FinalCTASection } from "@/components/home/FinalCTASection";
import { Lock, DollarSign, Heart, Shield } from "lucide-react";
import { SITE_URL } from "@/lib/utils";

const faqs = [
  {
    q: "Do I need an account to vote?",
    a: "No. You can vote without creating any account. Just choose a candidate or couple, select how many votes you want, and pay via Stripe Checkout.",
  },
  {
    q: "How much does a vote cost?",
    a: "$1.00 per vote for individual candidates, and $2.00 per vote for couple entries. There is no maximum limit. You can purchase as many votes as you'd like.",
  },
  {
    q: "How are votes counted and verified?",
    a: "Votes are processed instantly via Stripe webhooks. Each successful transaction updates the candidate's total in real time. We audit all transactions against our secure vote ledger.",
  },
  {
    q: "Can I vote for more than one candidate?",
    a: "Yes. You can vote for multiple candidates across as many separate transactions as you wish.",
  },
  {
    q: "Is my payment information safe?",
    a: "Completely. Payments are processed by Stripe, a PCI Level 1 certified payment processor. We never see or store your credit card details.",
  },
];

export function HowItWorksPage() {
  return (
    <>
      <Helmet>
        <title>How It Works — Pair Up or Leave</title>
        <meta name="description" content="Learn how voting works on Pair Up or Leave. $1 for individuals, $2 for couples. No account required. Secure payments via Stripe." />
        <meta property="og:title" content="How It Works — Pair Up or Leave" />
        <meta property="og:description" content="Everything you need to know about voting on Pair Up or Leave. $1/vote for individuals, $2/vote for couples. No account required. Payments via Stripe." />
        <meta property="og:url" content={`${SITE_URL}/how-it-works`} />
        <link rel="canonical" href={`${SITE_URL}/how-it-works`} />
      </Helmet>

      <main id="main-content" style={{ background: "#ffffff" }}>
        {/* Clean Light Hero */}
        <div
          style={{
            background: "linear-gradient(180deg, #FFF8FA 0%, #FFFFFF 100%)",
            borderBottom: "1px solid #F0DCE2",
            padding: "3.25rem 1rem 3.5rem",
            color: "#24131A",
          }}
        >
          <div className="container-max" style={{ textAlign: "center" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                background: "#FFE1E8",
                border: "1px solid #F0DCE2",
                padding: "0.25rem 0.875rem",
                borderRadius: 9999,
                marginBottom: "0.875rem",
              }}
            >
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  color: "#7A0C2E",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                VOTING GUIDE
              </span>
            </div>
            <h1
              className="reveal-fade-up"
              style={{
                fontSize: "clamp(2rem, 5.5vw, 3.25rem)",
                fontWeight: 900,
                color: "#24131A",
                margin: "0 0 0.5rem",
                letterSpacing: "-0.03em",
              }}
            >
              How It Works
            </h1>
            <p
              className="reveal-fade-up stagger-1"
              style={{
                fontSize: "1.0625rem",
                color: "#6B6870",
                margin: "0 auto",
                maxWidth: 480,
                lineHeight: 1.6,
              }}
            >
              Voting on Pair Up or Leave is simple, secure, and transparent.
            </p>
          </div>
        </div>

        <HowItWorksSection />

        {/* Key facts */}
        <section className="section" style={{ background: "#FFF8FA" }}>
          <div className="container-max">
            <h2 style={{ textAlign: "center", fontSize: "2rem", fontWeight: 800, color: "#24131A", marginBottom: "2.5rem", letterSpacing: "-0.02em" }}>
              Key Facts
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.5rem" }}>
              {[
                { icon: DollarSign, title: "$1 Ind / $2 Couple", desc: "Clear, transparent pricing. No hidden fees.", color: "#7A0C2E", bg: "#FFE1E8" },
                { icon: Lock, title: "No Account Needed", desc: "Vote without registration or login.", color: "#E51B3E", bg: "#FFF3F5" },
                { icon: Shield, title: "Stripe Secured", desc: "PCI-compliant payments via Stripe.", color: "#7A0C2E", bg: "#FFE1E8" },
                { icon: Heart, title: "Instant Counting", desc: "Votes appear within seconds of confirmation.", color: "#E51B3E", bg: "#FFF3F5" },
              ].map((f) => (
                <div key={f.title} className="card-shadow" style={{ background: "#fff", border: "1px solid #F0DCE2", borderRadius: 16, padding: "1.5rem" }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: f.bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1rem" }}>
                    <f.icon size={22} color={f.color} />
                  </div>
                  <h3 style={{ fontSize: "1.0625rem", fontWeight: 700, color: "#24131A", marginBottom: "0.375rem" }}>{f.title}</h3>
                  <p style={{ fontSize: "0.9rem", color: "#6B6870", margin: 0 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="section" style={{ background: "#ffffff" }}>
          <div className="container-max" style={{ maxWidth: 720 }}>
            <h2 style={{ textAlign: "center", fontSize: "2rem", fontWeight: 800, color: "#24131A", marginBottom: "2.5rem", letterSpacing: "-0.02em" }}>
              Frequently Asked Questions
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {faqs.map((faq) => (
                <div key={faq.q} style={{ background: "#FFF8FA", border: "1px solid #F0DCE2", borderRadius: 16, padding: "1.25rem 1.5rem" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#24131A", margin: "0 0 0.5rem" }}>{faq.q}</h3>
                  <p style={{ fontSize: "0.9375rem", color: "#6B6870", margin: 0, lineHeight: 1.7 }}>{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <FinalCTASection />
      </main>
    </>
  );
}
