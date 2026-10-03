import { NicheLandingPage } from "@/components/landing/niche-landing-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Marketing for Consultants — Artha",
  description: "Your AI marketing team — website, email outreach, and content on autopilot. Built for consultants who'd rather consult than market.",
};

export default function ConsultantsPage() {
  return (
    <NicheLandingPage
      niche="consultants"
      headline="Your AI marketing team."
      subheadline="You're an expert — but marketing yourself takes time you don't have. Artha builds your online presence, finds potential clients, and handles outreach automatically."
      ctaText="Build my consulting brand"
      placeholder="e.g. A management consulting practice helping mid-market companies optimize their operations"
      benefits={[
        { title: "Professional web presence", desc: "AI creates a polished consulting site with your expertise, services, and professional email." },
        { title: "Automated client outreach", desc: "Artha researches potential clients in your niche and sends personalized outreach emails." },
        { title: "Thought leadership content", desc: "AI drafts and posts content that establishes your authority in your field." },
        { title: "Revenue tracking", desc: "Accept payments, track clients, and manage your consulting pipeline — all from one dashboard." },
      ]}
      socialProof="Join consultants using Artha to grow their practice"
    />
  );
}
