import { Helmet } from "react-helmet-async";
import { HowItWorksSection } from "@/components/home/HowItWorksSection";
import { FinalCTASection } from "@/components/home/FinalCTASection";
import { Lock, DollarSign, Heart, Shield } from "lucide-react";
import { IS_PLATFORM_SERVICE_FEE_ENABLED } from "@/lib/supabase";
import { SITE_URL } from "@/lib/utils";

const faqs = [
  {
    q: "Do I need an account to vote?",
    a: "No. You can vote without creating any account. Just choose a candidate or couple, select how many votes you want, and pay via Stripe Checkout.",
  },
  {
    q: "How much does a vote cost?",
    a: IS_PLATFORM_SERVICE_FEE_ENABLED
      ? "$1.00 base per vote for individual candidates ($1.34 total for 1 vote including the mandatory platform service fee) and $2.00 base per vote for couple entries ($2.37 total for 1 vote including the mandatory platform service fee). An itemized breakdown is shown before checkout, and the platform service fee never increases the number of votes credited."
      : "$1.00 per vote for individual candidates and $2.00 per vote for couple entries. The complete total is shown before checkout.",
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
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.a,
      },
    })),
  };

  return (
    <>
      <Helmet>
        <title>How Voting Works, Pricing & FAQ — Pair Up or Leave</title>
        <meta name="description" content={IS_PLATFORM_SERVICE_FEE_ENABLED ? "Learn how voting works on Pair Up or Leave. $1/vote base ($1.34 total for 1 vote w/ service fee) for individuals, $2/vote base ($2.37 total for 1 vote w/ service fee) for couples. Secure payments via Stripe." : "Learn how voting works on Pair Up or Leave: choose your candidate, select votes ($1 individual / $2 couple), and pay securely via Stripe."} />
        <meta property="og:title" content="How Voting Works, Pricing & FAQ — Pair Up or Leave" />
        <meta property="og:description" content={IS_PLATFORM_SERVICE_FEE_ENABLED ? "Everything you need to know about voting on Pair Up or Leave. $1/vote base ($1.34 total for 1 vote w/ fee) for individuals, $2/vote base ($2.37 total for 1 vote w/ fee) for couples." : "Everything you need to know about voting on Pair Up or Leave. $1/vote for individuals, $2/vote for couples."} />
        <meta property="og:url" content={`${SITE_URL}/how-it-works`} />
        <meta property="og:image" content={`${SITE_URL}/og-image.jpg`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="How Voting Works, Pricing & FAQ — Pair Up or Leave" />
        <meta name="twitter:description" content="Simple 3-step voting on Pair Up or Leave: $1/vote for individuals, $2/vote for couples via Stripe." />
        <meta name="twitter:image" content={`${SITE_URL}/og-image.jpg`} />
        <link rel="canonical" href={`${SITE_URL}/how-it-works`} />
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
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
                { icon: DollarSign, title: IS_PLATFORM_SERVICE_FEE_ENABLED ? "$1 Ind / $2 Couple Base" : "$1 Ind / $2 Couple", desc: IS_PLATFORM_SERVICE_FEE_ENABLED ? "Upfront all-in pricing: $1.34 total for 1 Ind vote ($1 base + $0.34 service fee); $2.37 for 1 Couple vote." : "Transparent pricing: $1.00 per vote for individual candidates and $2.00 per vote for couple entries.", color: "#7A0C2E", bg: "#FFE1E8" },
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
        <section id="faq" className="section" style={{ background: "#ffffff" }}>
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
