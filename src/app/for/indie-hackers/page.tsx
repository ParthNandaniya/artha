import { NicheLandingPage } from "@/components/landing/niche-landing-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Validate Startup Ideas in 3 Minutes — Artha",
  description: "From idea to landing page, market research, and first outreach — in minutes. Built for indie hackers who move fast.",
};

export default function IndieHackersPage() {
  return (
    <NicheLandingPage
      niche="indie-hackers"
      headline="Validate ideas in 3 minutes."
      subheadline="Stop spending weeks on landing pages and market research. Describe your idea, and Artha builds everything — website, research, outreach — so you can test fast and move on."
      ctaText="Test my idea"
      placeholder="e.g. A SaaS tool that helps podcasters automatically create show notes and social posts"
      benefits={[
        { title: "Idea to landing page in 3 minutes", desc: "AI generates your site, market research, mission doc, and task queue — from a single prompt." },
        { title: "Real market validation", desc: "Artha researches competitors, finds potential customers, and sends outreach — so you get signal, not just a pretty page." },
        { title: "Test multiple ideas fast", desc: "Spin up 2 companies on the free plan. See which one gets traction before going all-in." },
        { title: "Nightly autopilot", desc: "Subscribe and Artha runs one task every night — finding leads, posting content, sending outreach — while you build." },
      ]}
      socialProof="Built for the Indie Hackers community"
    />
  );
}
