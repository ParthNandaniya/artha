import type { Metadata } from "next";
import { InvoiceGeneratorTool } from "./client";
import { ToolJsonLd } from "@/components/tools/tool-jsonld";
import { FREE_TOOLS } from "@/lib/free-tools";

export const metadata: Metadata = {
  title: "Free AI Invoice Generator",
  description:
    "Enter your business and client details to get a professional, ready-to-use invoice.",
  keywords: [
    "invoice generator",
    "free invoice",
    "invoice template",
    "ai invoice",
    "professional invoice",
    "invoice maker",
    "create invoice online",
  ],
  openGraph: {
    title: "Free AI Invoice Generator | Artha",
    description:
      "Enter your business and client details to get a professional, ready-to-use invoice.",
    url: "https://artha.run/tools/invoice-generator",
    siteName: "Artha",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free AI Invoice Generator | Artha",
    description:
      "Enter your business and client details to get a professional, ready-to-use invoice.",
  },
  alternates: { canonical: "https://artha.run/tools/invoice-generator" },
};

const tool = FREE_TOOLS.find((t) => t.slug === "invoice-generator");

export default function InvoiceGeneratorPage() {
  return (
    <>
      <ToolJsonLd
        name="Free AI Invoice Generator"
        description="Enter your business and client details to get a professional, ready-to-use invoice."
        url="https://artha.run/tools/invoice-generator"
        faqs={tool?.faqs}
      />
      <InvoiceGeneratorTool />
    </>
  );
}
