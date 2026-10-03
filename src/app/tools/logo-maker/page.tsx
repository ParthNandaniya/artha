import type { Metadata } from "next";
import { LogoMakerTool } from "./client";
import { ToolJsonLd } from "@/components/tools/tool-jsonld";
import { FREE_TOOLS } from "@/lib/free-tools";

export const metadata: Metadata = {
  title: "Free AI Logo Maker",
  description: "Enter your company name and get 4 professional AI-generated logo variants in different styles — minimal, modern, tech, and playful.",
  keywords: ["ai logo maker", "free logo generator", "logo design ai", "company logo maker", "startup logo", "brand logo generator"],
  openGraph: {
    title: "Free AI Logo Maker | Artha",
    description: "Enter your company name and get 4 professional AI-generated logo variants in different styles.",
    url: "https://artha.run/tools/logo-maker",
    siteName: "Artha",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free AI Logo Maker | Artha",
    description: "Enter your company name and get 4 professional AI-generated logo variants in different styles.",
  },
  alternates: { canonical: "https://artha.run/tools/logo-maker" },
};

const tool = FREE_TOOLS.find((t) => t.slug === "logo-maker");

export default function LogoMakerPage() {
  return (
    <>
      <ToolJsonLd
        name="Free AI Logo Maker"
        description="Enter your company name and get 4 professional AI-generated logo variants in different styles."
        url="https://artha.run/tools/logo-maker"
        faqs={tool?.faqs}
      />
      <LogoMakerTool />
    </>
  );
}
