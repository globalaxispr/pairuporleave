import { Helmet } from "react-helmet-async";
import { HeroSection } from "@/components/home/HeroSection";
import { CompetitionCountdownSection } from "@/components/home/CompetitionCountdownSection";
import { LiveRankingSection } from "@/components/home/LiveRankingSection";
import { WatchTheShowSection } from "@/components/home/WatchTheShowSection";
import { MembershipPlans } from "@/components/memberships/MembershipPlans";
import { FeaturedCandidates } from "@/components/home/FeaturedCandidates";
import { StatsSection } from "@/components/home/StatsSection";
import { HowItWorksSection } from "@/components/home/HowItWorksSection";
import { LiveResultsPreview } from "@/components/home/LiveResultsPreview";
import { WhyVoteSection } from "@/components/home/WhyVoteSection";
import { FinalCTASection } from "@/components/home/FinalCTASection";
import { IS_PLATFORM_SERVICE_FEE_ENABLED } from "@/lib/supabase";
import { SITE_URL } from "@/lib/utils";

export function HomePage() {
  const description = IS_PLATFORM_SERVICE_FEE_ENABLED
    ? "Pair Up or Leave is the official voting platform. Support your favorite couples and candidates with secure Stripe payments. $1/vote base ($1.80 w/ service fee for 1 vote) for individuals, $2/vote base ($2.80 w/ service fee for 1 vote) for couples. No account required."
    : "Pair Up or Leave is the official voting platform. Support your favorite couples and candidates with secure Stripe payments. $1/vote for individuals, $2/vote for couples. No account required.";

  const websiteSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: "Pair Up or Leave",
        description,
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "Pair Up or Leave",
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/logo@2x.png`,
        sameAs: ["https://www.youtube.com/@pairuporleave"],
      },
    ],
  };

  return (
    <>
      <Helmet>
        <title>Pair Up or Leave — Official Live Voting Competition | Vote Now</title>
        <meta name="description" content={description} />
        <meta property="og:title" content="Pair Up or Leave — Official Live Voting Competition | Vote Now" />
        <meta
          property="og:description"
          content={
            IS_PLATFORM_SERVICE_FEE_ENABLED
              ? "Support your favorite couples and candidates. $1/vote base ($1.80 w/ fee) for individuals, $2/vote base ($2.80 w/ fee) for couples. Secure payments via Stripe."
              : "Support your favorite couples and candidates. $1/vote for individuals, $2/vote for couples. Secure payments via Stripe."
          }
        />
        <meta property="og:url" content={`${SITE_URL}/`} />
        <meta property="og:image" content={`${SITE_URL}/og-image.jpg`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Pair Up or Leave — Official Live Voting Competition | Vote Now" />
        <meta
          name="twitter:description"
          content="Support your favorite couples ($2/vote) and individual candidates ($1/vote). Watch the live show and track real-time rankings."
        />
        <meta name="twitter:image" content={`${SITE_URL}/og-image.jpg`} />
        <link rel="canonical" href={`${SITE_URL}/`} />
        <script type="application/ld+json">{JSON.stringify(websiteSchema)}</script>
      </Helmet>

      <main id="main-content" style={{ paddingBottom: "3.5rem" }}>
        {/* 1. Hero */}
        <HeroSection />

        {/* 2. Competition Countdown Timer */}
        <CompetitionCountdownSection />

        {/* 3. Live Ranking */}
        <LiveRankingSection />

        {/* 4. Watch The Show (YouTube Live Broadcast / Episode) */}
        <WatchTheShowSection />

        {/* 5. Official YouTube Channel Memberships */}
        <MembershipPlans />

        {/* 6. Featured Candidates (1 card per row on mobile) */}
        <FeaturedCandidates />

        {/* 4. Contest Stats */}
        <StatsSection />

        {/* 5. How It Works */}
        <HowItWorksSection />

        {/* 6. Results Preview */}
        <LiveResultsPreview />

        {/* 7. Why Vote */}
        <WhyVoteSection />

        {/* 8. Final CTA */}
        <FinalCTASection />
      </main>
    </>
  );
}
