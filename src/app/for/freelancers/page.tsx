import { NicheLandingPage } from "@/components/landing/niche-landing-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Marketing for Freelancers — Artha",
  description: "Stop marketing yourself. Let AI handle your website, outreach, and lead generation — so you can focus on client work.",
};

export default function FreelancersPage() {
  return (
    <NicheLandingPage
      niche="freelancers"
      headline="Stop marketing yourself."
      subheadline="You're great at your craft — but finding clients is a full-time job. Artha handles your website, outreach emails, and lead generation so you can focus on delivering great work."
      ctaText="Build my freelance brand"
      placeholder="e.g. A freelance UX designer helping B2B SaaS companies improve conversion rates"
      benefits={[
        { title: "Professional website in minutes", desc: "AI builds a portfolio-ready site with your services, testimonials placeholder, and contact form." },
        { title: "Automated outreach", desc: "Artha finds potential clients and sends personalized emails on your behalf — you just reply to interested ones." },
        { title: "Lead tracking", desc: "See who's interested, who replied, and who converted — all in one dashboard." },
        { title: "Content that attracts clients", desc: "AI creates and posts thought leadership content to build your authority." },
      ]}
      socialProof="Join 100+ freelancers using Artha to find clients"
    />
  );
}
