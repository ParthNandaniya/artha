import type { Metadata } from "next";
import { SeoAuditTool } from "./client";
import { ToolJsonLd } from "@/components/tools/tool-jsonld";
import { FREE_TOOLS } from "@/lib/free-tools";

export const metadata: Metadata = {
  title: "Free AI SEO Audit",
  description: "Enter any URL and get a detailed SEO analysis with title/meta review, keyword suggestions, and actionable recommendations — not just scores, actual fixes.",
  keywords: ["seo audit tool", "free seo checker", "website seo analysis", "seo analyzer", "site audit", "seo recommendations"],
  openGraph: {
    title: "Free AI SEO Audit | Artha",
    description: "Enter any URL and get a detailed SEO analysis with title/meta review, keyword suggestions, and actionable recommendations.",
    url: "https://artha.run/tools/seo-audit",
    siteName: "Artha",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free AI SEO Audit | Artha",
    description: "Enter any URL and get a detailed SEO analysis with title/meta review, keyword suggestions, and actionable recommendations.",
  },
  alternates: { canonical: "https://artha.run/tools/seo-audit" },
};

const tool = FREE_TOOLS.find((t) => t.slug === "seo-audit");

export default function SeoAuditPage() {
  return (
    <>
      <ToolJsonLd
        name="Free AI SEO Audit"
        description="Enter any URL and get a detailed SEO analysis with title/meta review, keyword suggestions, and actionable recommendations."
        url="https://artha.run/tools/seo-audit"
        faqs={tool?.faqs}
      />
      <SeoAuditTool />
    </>
  );
}
