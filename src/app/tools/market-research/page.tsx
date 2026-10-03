import type { Metadata } from "next";
import { MarketResearchTool } from "./client";
import { ToolJsonLd } from "@/components/tools/tool-jsonld";
import { FREE_TOOLS } from "@/lib/free-tools";

export const metadata: Metadata = {
  title: "Free AI Market Research",
  description: "Enter your business idea and get a competitive landscape report with real competitors, market size, gaps, and trends in 30 seconds.",
  keywords: ["market research tool", "ai market research", "competitive analysis", "market size", "competitor research", "free market research"],
  openGraph: {
    title: "Free AI Market Research | Artha",
    description: "Enter your business idea and get a competitive landscape report with real competitors, market size, gaps, and trends in 30 seconds.",
    url: "https://artha.run/tools/market-research",
    siteName: "Artha",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free AI Market Research | Artha",
    description: "Enter your business idea and get a competitive landscape report with real competitors, market size, gaps, and trends in 30 seconds.",
  },
  alternates: { canonical: "https://artha.run/tools/market-research" },
};

const tool = FREE_TOOLS.find((t) => t.slug === "market-research");

export default function MarketResearchPage() {
  return (
    <>
      <ToolJsonLd
        name="Free AI Market Research"
        description="Enter your business idea and get a competitive landscape report with real competitors, market size, gaps, and trends."
        url="https://artha.run/tools/market-research"
        faqs={tool?.faqs}
      />
      <MarketResearchTool />
    </>
  );
}
