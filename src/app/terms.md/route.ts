import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = 86400;

const CONTENT = `# Terms of Service — Artha

> Markdown summary. The canonical terms live at https://artha.run/terms.

## What Artha provides

Artha provides tools to generate and operate a small company online: a landing page, a company email inbox, automated AI tasks, analytics, and optional Stripe‑powered monetisation.

## Acceptable use

You agree not to use Artha to:

- publish content that violates applicable laws or third‑party rights;
- send spam or unsolicited bulk messages;
- attempt to reverse-engineer, disrupt, or overload the service;
- impersonate others or misrepresent your identity or affiliation.

## Your content

You retain ownership of the content you create with Artha. You grant Artha a limited licence to host, process, and display that content as needed to operate the service.

## AI-generated content

Artha produces content using third-party AI models. You are responsible for reviewing any AI‑generated content before publishing it under your company's name.

## Billing

- Subscriptions renew automatically until cancelled.
- Credits expire at the end of each billing cycle unless stated otherwise.
- Artha charges a 5% fee on revenue you process through the built-in Stripe pricing pages.

## Termination

We may suspend or terminate accounts that violate these terms. You may cancel at any time from your dashboard.

## Disclaimers

The service is provided "as is" without warranty. Artha is not liable for business outcomes that result from using the product.

## Contact

Email: \`support@artha.run\`.

## Full text

The canonical, authoritative terms are at https://artha.run/terms.
`;

export async function GET() {
  return new NextResponse(CONTENT, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
      link: '</terms>; rel="canonical"',
    },
  });
}
