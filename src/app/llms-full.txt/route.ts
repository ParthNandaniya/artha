import { NextResponse } from "next/server";
import { FREE_TOOLS } from "@/lib/free-tools";

export const dynamic = "force-static";
export const revalidate = 3600;

const CONTENT = `# Artha — full corpus

> Artha is an AI company builder. Describe your business idea in one prompt and Artha builds your company — market research, mission, landing page, email, and automated tasks — in minutes.

Each company gets an isolated database, a custom website at {slug}.tryartha.com, a dedicated email address ({slug}@tryartha.com), and an AI agent that runs recurring business tasks on autopilot.

## Core capabilities

- **One-prompt onboarding.** The user describes their idea in a single prompt. Artha runs a pipeline that produces a company mission, market research with competitor analysis, an initial landing page, a company email inbox, and a recurring task plan.
- **Per-company isolation.** Every project gets its own Neon Postgres database, subdomain on tryartha.com, company-scoped email address, and AI agent runtime.
- **Morning digest email.** A daily email summarising completed tasks, upcoming tasks, and site analytics from the past week.
- **Analytics.** First-party tracking on company sites (stored in \`site_analytics\` in the platform DB) surfaces unique visitors, pageviews, and event counts in the digest and dashboard.
- **Automations.** Recurring AI-run tasks cover sales outreach, community engagement, product review, competitive checks, churn monitoring, and analytics digests.
- **Monetisation.** Company sites can enable Stripe-powered pricing plans. The platform supports credits and subscription billing.

## Who Artha is for

Founders, solopreneurs, indie hackers, and early-stage builders who want to launch a company fast without hiring a team. Typical users:

- A domain expert (e.g. a dentist, lawyer, consultant) who wants a professional online presence in under an hour.
- An indie hacker who wants to validate an idea with a real website, analytics, and an outreach flow before committing engineering time.
- A non-technical founder who wants the "boring parts" (site, email, automations, analytics) handled so they can focus on talking to customers.

## How a typical project flows

1. User signs up and describes their idea in a single prompt.
2. Artha generates a unique slug and provisions an isolated Neon database.
3. The pipeline runs market research, drafts a mission, generates copy, and publishes a landing page at \`{slug}.tryartha.com\`.
4. A company inbox at \`{slug}@tryartha.com\` is activated with inbound+outbound.
5. An initial task plan is created with recurring cadences.
6. From the dashboard, the user reviews tasks, edits site content, tracks analytics, and manages integrations (Twitter, Meta, LinkedIn, Google).
7. A daily digest email is sent each morning.

## Free tools catalogue

Artha exposes standalone, no‑signup AI tools as lead-in funnels. They live at \`https://artha.run/tools/{slug}\`:

${FREE_TOOLS.map((tool) => `- **${tool.name}** — \`https://artha.run/tools/${tool.slug}\``).join("\n")}

## Pricing

See \`https://artha.run/pricing\` for current plans. Artha runs on a credit + subscription model: onboarding, task runs, outreach, and research each consume credits. Free plan users get a baseline monthly credit refresh.

## Integrations

- **Email:** Postmark (platform \`agents@artha.run\`, company \`{slug}@tryartha.com\`).
- **AI:** OpenAI + Anthropic (routed via an internal model router).
- **Search:** Exa (semantic) + Brave (keyword) for web research.
- **Payments:** Stripe (subscriptions + credits + Stripe Connect for company monetisation).
- **Analytics on artha.run:** PostHog. Analytics on company sites: first-party tracker.
- **Social:** Twitter/X, Meta (Facebook + Instagram), LinkedIn — OAuth-connected for outbound automation.
- **Hosting:** Render for the platform app, Cloudflare Pages for company sites.

## Data and privacy

- Per-company data lives in a dedicated Neon database separate from the platform DB.
- Platform-level data (users, projects, billing) is in a single Neon DB.
- See \`https://artha.run/privacy\` for the full privacy policy and \`https://artha.run/terms\` for the terms of service.

## Machine-readable surface

- \`/robots.txt\` — AI bot rules + Content Signals.
- \`/sitemap.xml\` — static pages, tools, blog posts.
- \`/sitemap-companies.xml\` — published company sites (subdomains).
- \`/llms.txt\` — short index.
- \`/llms-full.txt\` — this document.
- \`/index.md\`, \`/pricing.md\`, \`/privacy.md\`, \`/terms.md\` — Markdown alternates of key pages.
- \`/agents.json\` — capability descriptor for agents (public surface + contact channels).
- \`/.well-known/security.txt\` — responsible disclosure contact.

## Contact

- Support: \`support@artha.run\`
- Security: \`security@artha.run\`
- Homepage: \`https://artha.run\`
`;

export async function GET() {
  return new NextResponse(CONTENT, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
      link: '</llms.txt>; rel="alternate"; type="text/plain"',
    },
  });
}
