import type { Metadata } from "next";
import { CompetitorAnalysisTool } from "./client";
import { ToolJsonLd } from "@/components/tools/tool-jsonld";
import { FREE_TOOLS } from "@/lib/free-tools";

export const metadata: Metadata = {
  title: "Free AI Competitor Analysis",
  description: "Enter your company and 1-2 competitors to get a detailed comparison matrix with strengths, weaknesses, and opportunities.",
  keywords: ["competitor analysis tool", "ai competitive analysis", "competitor comparison", "swot analysis", "competitive intelligence", "free competitor analysis"],
  openGraph: {
    title: "Free AI Competitor Analysis | Artha",
    description: "Enter your company and 1-2 competitors to get a detailed comparison matrix with strengths, weaknesses, and opportunities.",
    url: "https://artha.run/tools/competitor-analysis",
    siteName: "Artha",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free AI Competitor Analysis | Artha",
    description: "Enter your company and 1-2 competitors to get a detailed comparison matrix with strengths, weaknesses, and opportunities.",
  },
  alternates: { canonical: "https://artha.run/tools/competitor-analysis" },
};

const tool = FREE_TOOLS.find((t) => t.slug === "competitor-analysis");

export default function CompetitorAnalysisPage() {
  return (
    <>
      <ToolJsonLd
        name="Free AI Competitor Analysis"
        description="Enter your company and 1-2 competitors to get a detailed comparison matrix with strengths, weaknesses, and opportunities."
        url="https://artha.run/tools/competitor-analysis"
        faqs={tool?.faqs}
      />
      <CompetitorAnalysisTool />
    </>
  );
}
