import { Helmet } from "react-helmet-async";
import { HeroSection } from "@/components/home/HeroSection";
import { LiveRankingSection } from "@/components/home/LiveRankingSection";
import { FeaturedCandidates } from "@/components/home/FeaturedCandidates";
import { StatsSection } from "@/components/home/StatsSection";
import { HowItWorksSection } from "@/components/home/HowItWorksSection";
import { LiveResultsPreview } from "@/components/home/LiveResultsPreview";
import { WhyVoteSection } from "@/components/home/WhyVoteSection";
import { FinalCTASection } from "@/components/home/FinalCTASection";
import { SITE_URL } from "@/lib/utils";

export function HomePage() {
  return (
    <>
      <Helmet>
        <title>Pair Up or Leave — Vote for Your Favorite Couples & Candidates</title>
        <meta
          name="description"
          content="Pair Up or Leave is the official voting platform. Support your favorite couples and candidates with secure Stripe payments. $1/vote for individuals, $2/vote for couples. No account required."
        />
        <meta property="og:title" content="Pair Up or Leave — Vote for Your Favorite Couples & Candidates" />
        <meta property="og:description" content="Support your favorite couples and candidates. $1/vote for individuals, $2/vote for couples. Secure payments via Stripe." />
        <meta property="og:url" content={`${SITE_URL}/`} />
        <link rel="canonical" href={`${SITE_URL}/`} />
      </Helmet>

      <main id="main-content" style={{ paddingBottom: "3.5rem" }}>
        {/* 1. Hero */}
        <HeroSection />

        {/* 2. Live Ranking immediately after Hero */}
        <LiveRankingSection />

        {/* 3. Featured Candidates (1 card per row on mobile) */}
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
