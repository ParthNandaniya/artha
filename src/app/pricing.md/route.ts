import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = 3600;

const CONTENT = `# Pricing — Artha

Simple, transparent pricing. Start free, upgrade when you're ready.

## Free

- 1 company
- 5 AI task credits per month
- Website at \`your-company.tryartha.com\`
- Custom email: \`your-company@tryartha.com\`
- Website analytics and insights
- AI chat assistant (limited)
- Custom domain support via CNAME
- Post a launch on X (Twitter)

## Pro

Everything in Free, plus:

- Up to 5 companies
- 50 task credits per month
- 5 bonus credits on your first month
- Automated nightly task runs
- Custom domain support
- Twitter handle support
- Custom pricing pages with Stripe
- Revenue tracking and withdrawals
- 100 MB database + 200 MB file storage
- Full AI chat assistant
- Priority support

See the [live pricing page](https://artha.run/pricing) for current prices and checkout.

## How credits work

A credit powers one AI-driven task — market research, writing and scheduling content, updating your website, or composing an email campaign. Simple actions like posting a tweet use only a fraction of a credit. Free users start with 5 credits.

## FAQ

### What is a task credit?

A credit powers one AI-driven task. Simple actions like posting a tweet use only a fraction of a credit. Free users start with 5 credits to try things out.

### Why upgrade to Pro?

Pro gives you 50 credits/month plus 5 bonus credits on your first month, automated nightly runs, Stripe payment pages, a larger database, and priority support.

### Can I cancel anytime?

Yes. You can cancel your subscription at any time from your dashboard. You'll keep access until the end of your billing period.

### What happens when I run out of credits?

Your company keeps running — your website stays live, emails keep working. You just can't run new AI tasks until your next billing cycle or you buy a credit pack.

### Can I use my own domain?

Yes. All users can connect a custom domain from the Settings panel via CNAME. Your site is accessible at both the custom domain and the default subdomain.

### What's the fee on revenue I earn?

Artha takes 5% of payments processed through your pricing pages. You keep 95%. Stripe's standard processing fee (2.9% + 30¢) applies separately.

## Links

- Pricing (HTML): https://artha.run/pricing
- Homepage (Markdown): https://artha.run/index.md
- Terms (Markdown): https://artha.run/terms.md
`;

export async function GET() {
  return new NextResponse(CONTENT, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
      link: '</pricing>; rel="canonical"',
    },
  });
}
