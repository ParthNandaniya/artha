import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = 86400;

const DESCRIPTOR = {
  schema_version: "v1",
  name_for_humans: "Artha",
  name_for_model: "artha",
  description_for_humans:
    "AI company builder. Describe a business idea in one prompt; Artha generates a landing page, market research, company email, and recurring tasks.",
  description_for_model:
    "Artha helps founders launch and operate small companies. It provisions an isolated Postgres database per company, generates a landing page at {slug}.tryartha.com, a company inbox at {slug}@tryartha.com, and a recurring AI task plan. Public documentation and capabilities are machine-readable via llms.txt, llms-full.txt, and Markdown page alternates.",
  homepage: "https://artha.run",
  logo_url: "https://artha.run/icon.svg",
  legal_info_url: "https://artha.run/terms",
  privacy_policy_url: "https://artha.run/privacy",
  contact: {
    support_email: "support@artha.run",
    security_email: "security@artha.run",
  },
  discovery: {
    robots: "https://artha.run/robots.txt",
    sitemaps: [
      "https://artha.run/sitemap.xml",
      "https://artha.run/sitemap-companies.xml",
    ],
    llms_txt: "https://artha.run/llms.txt",
    llms_full_txt: "https://artha.run/llms-full.txt",
    security_txt: "https://artha.run/.well-known/security.txt",
  },
  content: {
    markdown_alternates: [
      { html: "https://artha.run/", markdown: "https://artha.run/index.md" },
      {
        html: "https://artha.run/pricing",
        markdown: "https://artha.run/pricing.md",
      },
      {
        html: "https://artha.run/privacy",
        markdown: "https://artha.run/privacy.md",
      },
      {
        html: "https://artha.run/terms",
        markdown: "https://artha.run/terms.md",
      },
    ],
  },
  policies: {
    ai_training: "allowed",
    ai_input: "allowed",
    search_indexing: "allowed",
  },
  bots_allowed: [
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "ClaudeBot",
    "Claude-User",
    "Claude-SearchBot",
    "anthropic-ai",
    "PerplexityBot",
    "Perplexity-User",
    "Google-Extended",
    "GoogleOther",
    "Applebot-Extended",
    "CCBot",
    "cohere-ai",
    "Meta-ExternalAgent",
    "DuckAssistBot",
    "MistralAI-User",
    "YouBot",
    "Amazonbot",
  ],
};

export async function GET() {
  return new NextResponse(JSON.stringify(DESCRIPTOR, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
      link: '</llms.txt>; rel="describedby"; type="text/plain"',
    },
  });
}
