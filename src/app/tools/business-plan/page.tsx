import type { Metadata } from "next";
import { BusinessPlanTool } from "./client";
import { ToolJsonLd } from "@/components/tools/tool-jsonld";
import { FREE_TOOLS } from "@/lib/free-tools";

export const metadata: Metadata = {
  title: "Free AI Business Plan Generator",
  description: "Get a mission document with vision, problem/solution, target audience, value prop, and a 90-day strategy — specific and opinionated, not generic.",
  keywords: ["business plan generator", "ai business plan", "startup plan", "mission statement generator", "free business plan", "90 day strategy"],
  openGraph: {
    title: "Free AI Business Plan Generator | Artha",
    description: "Get a mission document with vision, problem/solution, target audience, value prop, and a 90-day strategy.",
    url: "https://artha.run/tools/business-plan",
    siteName: "Artha",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free AI Business Plan Generator | Artha",
    description: "Get a mission document with vision, problem/solution, target audience, value prop, and a 90-day strategy.",
  },
  alternates: { canonical: "https://artha.run/tools/business-plan" },
};

const tool = FREE_TOOLS.find((t) => t.slug === "business-plan");

export default function BusinessPlanPage() {
  return (
    <>
      <ToolJsonLd
        name="Free AI Business Plan Generator"
        description="Get a mission document with vision, problem/solution, target audience, value prop, and a 90-day strategy."
        url="https://artha.run/tools/business-plan"
        faqs={tool?.faqs}
      />
      <BusinessPlanTool />
    </>
  );
}
