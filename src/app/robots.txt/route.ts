import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = 86400;

// AI crawlers we explicitly allow on public content.
// Explicit per-agent rules help agent-readiness scanners detect AI bot rules.
const AI_BOTS = [
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
  "Bytespider",
  "CCBot",
  "cohere-ai",
  "Meta-ExternalAgent",
  "Meta-ExternalFetcher",
  "DuckAssistBot",
  "MistralAI-User",
  "YouBot",
  "Amazonbot",
  "Diffbot",
  "ImagesiftBot",
  "Timpibot",
  "omgili",
];

const DISALLOW = ["/checkout/", "/api/", "/dashboard/", "/ops/"];

function block(userAgent: string, extra: string[] = []): string {
  const lines: string[] = [`User-agent: ${userAgent}`, "Allow: /"];
  for (const path of DISALLOW) lines.push(`Disallow: ${path}`);
  for (const line of extra) lines.push(line);
  return lines.join("\n");
}

export async function GET() {
  const sections: string[] = [];

  // Generic crawler block + Cloudflare Content Signals (search=yes, ai-input=yes, ai-train=yes)
  sections.push(
    block("*", [
      // Cloudflare Content-Signal proposal — advertise what the content may be used for.
      // search: appear in search results; ai-input: used as input to AI features;
      // ai-train: used to train AI models.
      "Content-Signal: search=yes, ai-input=yes, ai-train=yes",
    ])
  );

  // Explicit per-AI-bot sections so scanners detect AI bot rules.
  for (const bot of AI_BOTS) {
    sections.push(block(bot));
  }

  const body = [
    "# artha.run — robots.txt",
    "# Agent-readable: see /llms.txt, /llms-full.txt, /index.md, /agents.json",
    "",
    sections.join("\n\n"),
    "",
    "Sitemap: https://artha.run/sitemap.xml",
    "Sitemap: https://artha.run/sitemap-companies.xml",
    "Sitemap: https://tryartha.com/sitemap.xml",
    "Host: https://artha.run",
    "",
  ].join("\n");

  return new NextResponse(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
