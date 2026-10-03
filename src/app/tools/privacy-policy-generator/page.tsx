import type { Metadata } from "next";
import { PrivacyPolicyGeneratorTool } from "./client";
import { ToolJsonLd } from "@/components/tools/tool-jsonld";
import { FREE_TOOLS } from "@/lib/free-tools";

export const metadata: Metadata = {
  title: "Free AI Privacy Policy & Terms of Service Generator",
  description:
    "Enter your company details and get a legally-structured privacy policy and terms of service, GDPR and CCPA aware.",
  keywords: [
    "privacy policy generator",
    "terms of service generator",
    "free privacy policy",
    "gdpr privacy policy",
    "ccpa compliant",
    "website legal pages",
  ],
  openGraph: {
    title: "Free AI Privacy Policy & Terms of Service Generator | Artha",
    description:
      "Enter your company details and get a legally-structured privacy policy and terms of service, GDPR and CCPA aware.",
    url: "https://artha.run/tools/privacy-policy-generator",
    siteName: "Artha",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free AI Privacy Policy & Terms of Service Generator | Artha",
    description:
      "Enter your company details and get a legally-structured privacy policy and terms of service, GDPR and CCPA aware.",
  },
  alternates: {
    canonical: "https://artha.run/tools/privacy-policy-generator",
  },
};

const tool = FREE_TOOLS.find((t) => t.slug === "privacy-policy-generator");

export default function PrivacyPolicyGeneratorPage() {
  return (
    <>
      <ToolJsonLd
        name="Free AI Privacy Policy & Terms of Service Generator"
        description="Enter your company details and get a legally-structured privacy policy and terms of service, GDPR and CCPA aware."
        url="https://artha.run/tools/privacy-policy-generator"
        faqs={tool?.faqs}
      />
      <PrivacyPolicyGeneratorTool />
    </>
  );
}
