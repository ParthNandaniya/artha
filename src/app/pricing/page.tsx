import Link from "next/link";
import { ArthaIcon } from "@/components/icons/artha-icon";
import { PricingAnimated, PricingCardAnimated } from "@/components/pricing/pricing-animated";

export const metadata = {
  title: "Pricing — Artha",
  description:
    "Simple, transparent pricing. Start free, upgrade when you're ready.",
  alternates: { canonical: "https://artha.run/pricing" },
};

const FAQ_ITEMS = [
  {
    question: "What is a task credit?",
    answer:
      "A credit powers one AI-driven task — things like researching your market, writing and scheduling content, updating your website, or composing an email campaign. Simple actions like posting a tweet use only a fraction of a credit. Free users start with 5 credits to try things out.",
  },
  {
    question: "Why upgrade to Pro?",
    answer:
      "Pro gives you 50 credits/month — plus 5 bonus credits on your first month — plus automated nightly runs, Stripe payment pages, a larger database, and priority support. It's designed for builders who want AI handling their marketing daily.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. You can cancel your subscription at any time from your dashboard. You'll keep access until the end of your billing period.",
  },
  {
    question: "What happens when I run out of credits?",
    answer:
      "Your company keeps running — your website stays live, emails keep working. You just won't be able to run new AI tasks until your next billing cycle or you purchase a credit pack.",
  },
  {
    question: "Can I use my own domain?",
    answer:
      "Yes. All users can connect a custom domain (e.g. yourbusiness.com) from the Settings panel via CNAME. Your site will be accessible at both your custom domain and the default subdomain.",
  },
  {
    question: "What's the fee on revenue I earn?",
    answer:
      "Artha takes just 5% of payments processed through your pricing pages. You keep 95%. Stripe's standard processing fee (2.9% + 30¢) applies separately.",
  },
];

const FREE_FEATURES = [
  "1 company",
  "5 AI task credits / month",
  "Website at your-company.tryartha.com",
  "Custom email: your-company@tryartha.com",
  "Website analytics & insights",
  "AI chat assistant (limited)",
  "Custom domain support (CNAME)",
  "Post a launch on X (twitter)",
];

const PRO_FEATURES = [
  "Everything in Free, plus:",
  "Up to 5 companies",
  "50 task credits / month",
  "5 bonus credits on first month",
  "Automated nightly task runs",
  "Custom domain support",
  "Twitter handle support",
  "Custom pricing pages with Stripe",
  "Revenue tracking & withdrawals",
  "100MB database + 200MB file storage",
  "Full AI chat assistant",
  "Priority support",
];

export default function PricingPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://artha.run" },
      { "@type": "ListItem", position: 2, name: "Pricing", item: "https://artha.run/pricing" },
    ],
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([faqJsonLd, breadcrumbJsonLd]) }}
      />
      {/* Nav */}
      <div className="max-w-5xl mx-auto w-full px-6 pt-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArthaIcon size={20} className="text-foreground" />
          <span className="font-display font-bold text-foreground">artha</span>
        </Link>
      </div>

      {/* Header */}
      <PricingAnimated>
        <div className="max-w-5xl mx-auto w-full px-6 pt-12 pb-4 text-center">
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground mb-4">
            Build for free, scale when ready
          </h1>
          <p className="text-lg text-foreground/70 max-w-xl mx-auto">
            Launch your AI-powered company at no cost. Upgrade to Pro for daily automated marketing, outreach, and research.
          </p>
        </div>
      </PricingAnimated>

      {/* Pricing cards */}
      <div className="max-w-3xl mx-auto w-full px-6 py-12 grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        {/* Free */}
        <PricingCardAnimated delay={200}>
        <div className="rounded-xl border border-border p-8 flex flex-col">
          <h2 className="font-display text-xl font-bold text-foreground mb-1">
            Free
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Everything you need to launch and validate your idea
          </p>
          <div className="mb-6">
            <span className="font-display text-4xl font-extrabold text-foreground">
              $0
            </span>
            <span className="text-muted-foreground ml-1">/month</span>
          </div>
          <Link
            href="/#start"
            className="inline-flex items-center justify-center h-11 px-6 text-sm font-medium rounded-md border border-foreground text-foreground hover:bg-foreground hover:text-background transition-colors mb-8"
          >
            Get started
          </Link>
          <ul className="space-y-3">
            {FREE_FEATURES.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2 text-sm text-foreground/80"
              >
                <span className="mt-0.5 text-foreground">&#10003;</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
        </PricingCardAnimated>

        {/* Pro */}
        <PricingCardAnimated delay={300} glow>
        <div className="rounded-xl border-2 border-foreground p-8 flex flex-col relative">
          <span className="absolute -top-3 left-6 bg-foreground text-background text-xs font-semibold px-3 py-1 rounded-full">
            Recommended
          </span>
          <h2 className="font-display text-xl font-bold text-foreground mb-1">
            Pro
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Let AI run your marketing, outreach, and growth on autopilot
          </p>
          <div className="mb-6">
            <span className="font-display text-4xl font-extrabold text-foreground">
              $49
            </span>
            <span className="text-muted-foreground ml-1">/month</span>
          </div>
          <Link
            href="/#start"
            className="inline-flex items-center justify-center h-11 px-6 text-sm font-medium rounded-md bg-foreground text-background hover:bg-foreground/90 transition-colors mb-8"
          >
            Start building
          </Link>
          <ul className="space-y-3">
            {PRO_FEATURES.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2 text-sm text-foreground/80"
              >
                <span className="mt-0.5 text-foreground">&#10003;</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
        </PricingCardAnimated>
      </div>

      {/* Credit pack */}
      <PricingCardAnimated delay={500}>
      <div className="max-w-5xl mx-auto w-full px-6 pb-12">
        <div className="rounded-xl border border-border p-8 text-center">
          <h3 className="font-display text-lg font-bold text-foreground mb-2">
            Need more credits?
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Buy a credit pack anytime — 15 task credits for a one-time $25
            payment.
          </p>
          <Link
            href="/#start"
            className="inline-flex items-center justify-center h-10 px-5 text-sm font-medium rounded-md border border-border text-foreground hover:bg-muted transition-colors"
          >
            Learn more
          </Link>
        </div>
      </div>
      </PricingCardAnimated>

      {/* FAQ */}
      <div className="max-w-2xl mx-auto w-full px-6 pb-16">
        <h2 className="font-display text-2xl font-bold text-foreground mb-8 text-center">
          Frequently asked questions
        </h2>
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-foreground mb-1">
              What is a task credit?
            </h3>
            <p className="text-sm text-foreground/70 leading-relaxed">
              A credit powers one AI-driven task — things like researching
              your market, writing and scheduling content, updating your
              website, or composing an email campaign. Simple actions like
              posting a tweet use only a fraction of a credit. Free users
              start with 5 credits to try things out.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">
              Why upgrade to Pro?
            </h3>
            <p className="text-sm text-foreground/70 leading-relaxed">
              Pro gives you 50 credits/month — plus 5 bonus credits on your first month — plus
              automated nightly runs, Stripe payment pages, a larger database, and priority
              support. It&apos;s designed for builders who want AI handling their marketing daily.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">
              Can I cancel anytime?
            </h3>
            <p className="text-sm text-foreground/70 leading-relaxed">
              Yes. You can cancel your subscription at any time from your
              dashboard. You&apos;ll keep access until the end of your billing
              period.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">
              What happens when I run out of credits?
            </h3>
            <p className="text-sm text-foreground/70 leading-relaxed">
              Your company keeps running — your website stays live, emails keep
              working. You just won&apos;t be able to run new AI tasks until your
              next billing cycle or you purchase a credit pack.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">
              Can I use my own domain?
            </h3>
            <p className="text-sm text-foreground/70 leading-relaxed">
              Yes. All users can connect a custom domain (e.g. yourbusiness.com)
              from the Settings panel via CNAME. Your site will be accessible at
              both your custom domain and the default subdomain.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">
              What&apos;s the fee on revenue I earn?
            </h3>
            <p className="text-sm text-foreground/70 leading-relaxed">
              Artha takes just 5% of payments processed through your pricing pages.
              You keep 95%. Stripe&apos;s standard processing fee (2.9% + 30&cent;)
              applies separately.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full pb-8 px-6">
        <div className="max-w-2xl mx-auto pt-8 border-t border-border">
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link
              href="/pricing"
              className="hover:text-foreground underline underline-offset-2"
            >
              Pricing
            </Link>
            <Link
              href="/terms"
              className="hover:text-foreground underline underline-offset-2"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="hover:text-foreground underline underline-offset-2"
            >
              Privacy
            </Link>
            <a
              href="mailto:parth@artha.run"
              className="hover:text-foreground underline underline-offset-2"
            >
              Contact: parth@artha.run
            </a>
            <span className="text-muted-foreground/80">&copy; 2026 Artha</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
