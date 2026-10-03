import type { Metadata } from "next";
import { LandingPageTool } from "./client";
import { ToolJsonLd } from "@/components/tools/tool-jsonld";
import { FREE_TOOLS } from "@/lib/free-tools";

export const metadata: Metadata = {
  title: "Free AI Landing Page Generator",
  description: "Describe your product and get a fully designed landing page with hero, features, and CTA in 60 seconds — ready to deploy.",
  keywords: ["ai landing page generator", "free landing page builder", "landing page creator", "startup landing page", "product page generator", "website builder ai"],
  openGraph: {
    title: "Free AI Landing Page Generator | Artha",
    description: "Describe your product and get a fully designed landing page with hero, features, and CTA in 60 seconds.",
    url: "https://artha.run/tools/landing-page",
    siteName: "Artha",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free AI Landing Page Generator | Artha",
    description: "Describe your product and get a fully designed landing page with hero, features, and CTA in 60 seconds.",
  },
  alternates: { canonical: "https://artha.run/tools/landing-page" },
};

const tool = FREE_TOOLS.find((t) => t.slug === "landing-page");

export default function LandingPagePage() {
  return (
    <>
      <ToolJsonLd
        name="Free AI Landing Page Generator"
        description="Describe your product and get a fully designed landing page with hero, features, and CTA in 60 seconds."
        url="https://artha.run/tools/landing-page"
        faqs={tool?.faqs}
      />
      <LandingPageTool />
    </>
  );
}
