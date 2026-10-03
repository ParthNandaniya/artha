import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = 3600;

const CONTENT = `# Artha — AI agents that build and run your company

> Describe your idea in one prompt. Artha builds your website, finds your first customers, and handles marketing — so you can focus on your product.

## What Artha is

Artha is an AI company builder. You give it a one-sentence description of your business idea, and it produces:

- a branded landing page at \`{slug}.tryartha.com\` (custom domain supported)
- a company inbox at \`{slug}@tryartha.com\`
- market research and competitor analysis
- a recurring task plan that runs on autopilot
- a dashboard with analytics, tasks, and integrations

Each company runs on its own isolated Neon Postgres database with a dedicated AI agent runtime.

## Who it's for

Founders, solopreneurs, and indie hackers who want to launch and grow a company without hiring a team.

## How it works

1. Sign up and describe your idea in one prompt.
2. Artha generates a slug, provisions your database, and runs the onboarding pipeline: research, mission, landing page, email, initial tasks.
3. You land in the dashboard to review, edit, and launch.
4. Tasks run on a recurring schedule. A morning digest summarises progress and analytics.

## Capabilities

- Landing page generation (layouts, copy, imagery)
- Market research (Exa semantic + Brave keyword search)
- Daily morning digest email with tasks + analytics
- First-party site analytics per company
- Stripe-backed pricing pages and revenue tracking
- Integrations: Twitter/X, Meta (Facebook/Instagram), LinkedIn, Google, Postmark

## Pricing

Credit + subscription model. Free tier for evaluation, Pro for daily automation. See [pricing](https://artha.run/pricing.md).

## Links

- Homepage (HTML): https://artha.run/
- Pricing (Markdown): https://artha.run/pricing.md
- Privacy Policy (Markdown): https://artha.run/privacy.md
- Terms of Service (Markdown): https://artha.run/terms.md
- Full machine-readable corpus: https://artha.run/llms-full.txt
- Capability descriptor: https://artha.run/agents.json

## Contact

- Support: support@artha.run
- Security: security@artha.run
`;

export async function GET() {
  return new NextResponse(CONTENT, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
      link: '</>; rel="canonical", </llms-full.txt>; rel="alternate"; type="text/markdown"',
    },
  });
}
