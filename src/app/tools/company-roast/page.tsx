import type { Metadata } from "next";
import { CompanyRoastTool } from "./client";
import { ToolJsonLd } from "@/components/tools/tool-jsonld";
import { FREE_TOOLS } from "@/lib/free-tools";

export const metadata: Metadata = {
  title: "Free AI Company Roast Generator — Roast Any Startup",
  description:
    "Enter any company URL and get a savage, funny, data-backed roast. We deep-research the company, read the reviews, check the competition, and deliver a brutal but fair takedown.",
  keywords: [
    "company roast",
    "startup roast",
    "roast generator",
    "company roast ai",
    "roast my startup",
    "funny company review",
    "startup criticism",
    "company analysis",
  ],
  openGraph: {
    title: "Free AI Company Roast Generator | Artha",
    description:
      "Enter any company URL and get a savage, data-backed roast. Every joke grounded in real research.",
    url: "https://artha.run/tools/company-roast",
    siteName: "Artha",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free AI Company Roast Generator | Artha",
    description:
      "Enter any company URL and get a savage, data-backed roast. Every joke grounded in real research.",
  },
  alternates: { canonical: "https://artha.run/tools/company-roast" },
};

const tool = FREE_TOOLS.find((t) => t.slug === "company-roast");

export default function CompanyRoastPage() {
  return (
    <>
      <ToolJsonLd
        name="Free AI Company Roast Generator"
        description="Enter any company URL and get a savage, funny, data-backed roast. We deep-research the company and deliver a brutal but fair takedown."
        url="https://artha.run/tools/company-roast"
        faqs={tool?.faqs}
      />
      <CompanyRoastTool />
    </>
  );
}
