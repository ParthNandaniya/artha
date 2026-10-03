import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = 86400;

const CONTENT = `# Privacy Policy — Artha

> Markdown summary. The canonical policy lives at https://artha.run/privacy.

## What we collect

- **Account data:** email, name, profile details you provide at sign-up.
- **Company data:** the business idea, research, pages, tasks, and files generated for projects you create. Each company's data is stored in an isolated Neon Postgres database.
- **Usage data:** events needed to operate the product (task runs, credit usage, billing).
- **Analytics:** we use PostHog for anonymous usage analytics on artha.run. Company sites (\`{slug}.tryartha.com\`) use a first‑party tracker.
- **Billing:** Stripe processes payments. We do not store raw card numbers.

## How we use data

- To provide the service (generate pages, run tasks, send digests).
- To improve the product.
- To communicate (transactional emails, product updates).
- We do not sell your data.

## Third-party processors

- Neon (databases)
- OpenAI, Anthropic (AI model providers)
- Postmark (email)
- Stripe (payments)
- Render, Cloudflare (hosting + CDN)
- PostHog (analytics on artha.run)
- Exa, Brave (web search for research)
- Supermemory (AI persistent memory)

## Your rights

You can request access, correction, export, or deletion of your data at any time.

## Contact

Email: \`support@artha.run\`. Security-sensitive reports: \`security@artha.run\`.

## Full text

The canonical, authoritative policy is at https://artha.run/privacy.
`;

export async function GET() {
  return new NextResponse(CONTENT, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
      link: '</privacy>; rel="canonical"',
    },
  });
}
