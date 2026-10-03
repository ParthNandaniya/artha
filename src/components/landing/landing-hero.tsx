"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArthaIcon } from "@/components/icons/artha-icon";
import { ArthaIconAnimated } from "@/components/icons/artha-icon-animated";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CompanyCard } from "@/components/companies/company-card";
import { Reveal } from "@/components/ui/reveal";
import {
  Sparkles,
  Send,
  TrendingUp,
  BarChart3,
  FileText,
  Users,
  Pencil,
  CreditCard,
} from "lucide-react";

interface FeaturedCompany {
  slug: string;
  name: string;
  tagline: string | null;
}

export function LandingHero() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [featured, setFeatured] = useState<FeaturedCompany[]>([]);
  const [companyCount, setCompanyCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/companies?limit=4")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setFeatured(data); })
      .catch(() => {});
    fetch("/api/stats")
      .then((r) => r.json())
      .then((data) => { if (data.totalCompanies) setCompanyCount(data.totalCompanies); })
      .catch(() => {});
  }, []);

  function handleSignIn() {
    const returnPath =
      typeof window !== "undefined"
        ? encodeURIComponent(window.location.pathname || "/")
        : "/";
    window.location.href = `/api/auth/google?return=${returnPath}`;
  }

  async function startWithPrompt(promptText: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/start-with-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText }),
      });
      const data = await res.json();
      if (data.redirectUrl) window.location.href = data.redirectUrl;
      else handleSignIn();
    } catch {
      handleSignIn();
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const trimmed = prompt.trim();
    if (!trimmed) return;
    await startWithPrompt(trimmed);
  }

  async function handleSurpriseMe() {
    if (loading) return;
    await startWithPrompt("__SURPRISE_ME__");
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Link href="/live" className="block w-full bg-orange-500 py-2.5 px-4 hover:bg-orange-600 transition-colors animate-[reveal-down_400ms_ease-out_both]">
        <div className="flex items-center justify-center gap-2 text-white text-sm font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-white/90 animate-pulse" />
          Live Artha Dashboard &rarr;
        </div>
      </Link>

      {/* Hero content — centered, narrow */}
      <div className="max-w-2xl mx-auto w-full px-6 pt-8 sm:pt-12">
        <div className="flex justify-end gap-4 mb-8 sm:mb-12">
          <Link
            href="/tools"
            className="inline-flex items-center text-sm font-medium py-1.5 px-3.5 rounded-full bg-foreground text-background hover:bg-foreground/85 transition-colors"
          >
            Free AI Tools
          </Link>
          <Link
            href="/pricing"
            className="text-foreground/70 text-sm font-medium hover:text-foreground py-2"
          >
            Pricing
          </Link>
          <Link
            href="/blog"
            className="text-foreground/70 text-sm font-medium hover:text-foreground py-2"
          >
            Blog
          </Link>
          <button
            onClick={handleSignIn}
            className="text-foreground text-sm font-medium underline underline-offset-2 hover:no-underline py-2"
          >
            Sign in
          </button>
        </div>

        <div>
          <div className="flex items-center gap-3 mb-4 animate-[reveal-scale_600ms_ease-out_100ms_both]">
            <ArthaIconAnimated size={48} className="text-foreground" />
            <h1 className="font-display text-5xl sm:text-6xl font-extrabold tracking-tight text-foreground">
              artha
            </h1>
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-6 animate-[reveal-up_500ms_ease-out_800ms_both]">
            Idea to live business in 3 minutes.
          </h2>
          <p className="text-base text-foreground/90 leading-relaxed mb-4 max-w-xl animate-[reveal-up_500ms_ease-out_950ms_both]">
          Describe what you want to build. Artha creates your website, sets up email, researches your market, and finds your first customers — so you can focus on your product.
          </p>
          {companyCount !== null && companyCount > 0 && (
            <p className="text-sm text-foreground/50 mb-6 animate-[reveal-up_500ms_ease-out_1000ms_both]">
              <span className="font-semibold text-foreground/70 tabular-nums">{companyCount.toLocaleString()}</span> companies built so far
            </p>
          )}

          <form id="start" onSubmit={handleSubmit} className="space-y-4 animate-[reveal-up_500ms_ease-out_1050ms_both]">
            <Textarea
              placeholder="e.g. A freelance design consultancy helping startups build their brand identity"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[100px] resize-y"
              maxLength={2000}
            />
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                type="submit"
                size="lg"
                disabled={loading}
                className="h-12 px-8 text-base font-medium rounded-md bg-foreground hover:bg-foreground/90 text-background shadow-sm w-full sm:w-auto hover:scale-[1.02] active:scale-[0.98]"
              >
                {loading ? "Taking you to sign in..." : "Build my company"}
              </Button>
              {/* Surprise Me — temporarily disabled, will implement later
              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={loading}
                onClick={handleSurpriseMe}
                className="h-12 px-8 text-base font-medium rounded-md w-full sm:w-auto"
              >
                Surprise me
              </Button>
              */}
            </div>
          </form>
        </div>
      </div>

      {/* Built with Artha */}
      {featured.length > 0 && (
        <div className="w-full px-6 sm:px-8 lg:px-12 mt-16">
          <Reveal>
            <div className="flex items-center justify-between mb-4 max-w-[1400px] mx-auto">
              <p className="text-sm font-medium text-muted-foreground">Built with Artha</p>
              <Link href="/companies" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                View all &rarr;
              </Link>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-[1400px] mx-auto">
            {featured.map((c, i) => (
              <Reveal key={c.slug} delay={i * 100}>
                <CompanyCard
                  slug={c.slug}
                  name={c.name}
                  tagline={c.tagline}
                  companyDomain={process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com"}
                />
              </Reveal>
            ))}
          </div>
        </div>
      )}

      {/* Section divider */}
      <div className="flex justify-center mt-16">
        <ArthaIcon size={16} className="text-foreground/15 animate-[subtle-float_3s_ease-in-out_infinite]" />
      </div>

      {/* How it works */}
      <div className="max-w-3xl mx-auto w-full px-6 mt-16">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground text-center mb-3">
            How it works
          </p>
          <h3 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground text-center mb-12 text-balance">
            Three minutes. A real company.
          </h3>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { num: "01", label: "Describe", icon: Sparkles, title: "Tell Artha your idea", desc: "One sentence is enough. We translate it into a positioning, a brand, and a market." },
            { num: "02", label: "Launch", icon: Send, title: "Site, inbox, storefront", desc: "A live marketing site, your own email address, and billing ready to accept payments — in minutes." },
            { num: "03", label: "Grow", icon: TrendingUp, title: "Agents work overnight", desc: "Find leads, write outreach, ship content, talk to customers. Review in the morning." },
          ].map((step, i) => {
            const StepIcon = step.icon;
            return (
              <Reveal key={step.num} delay={i * 150}>
                <div className="h-full rounded-xl border border-border bg-card p-7">
                  <div className="flex items-center justify-between mb-4 font-mono text-[11px] text-muted-foreground">
                    <span>{step.num} — {step.label}</span>
                    <StepIcon className="h-4 w-4 text-foreground/70" strokeWidth={2} />
                  </div>
                  <h4 className="text-[20px] font-semibold text-foreground mb-2 leading-tight">{step.title}</h4>
                  <p className="text-sm text-muted-foreground leading-[1.55]">{step.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>

      {/* Features */}
      <div className="max-w-3xl mx-auto w-full px-6 mt-24">
        <Reveal>
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground text-center mb-3">
            What&apos;s included
          </p>
          <h3 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground text-center mb-10 text-balance">
            A full stack, out of the box.
          </h3>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { icon: BarChart3, title: "Live website", desc: "Yourcompany.tryartha.com, or bring your own domain. Edit copy, images, pricing live." },
            { icon: Send, title: "Working inbox", desc: "hello@yourcompany.tryartha.com — Artha drafts replies, you approve or send." },
            { icon: FileText, title: "Research agent", desc: "Competitive landscape, target customer research, market sizing on demand." },
            { icon: Users, title: "Outreach agent", desc: "Finds leads, personalizes outreach, handles follow-ups." },
            { icon: Pencil, title: "Content agent", desc: "Writes blog posts, social content, newsletters on a cadence you set." },
            { icon: CreditCard, title: "Payments", desc: "Stripe built in. Accept payments the moment your pricing goes live." },
          ].map((feat, i) => {
            const FeatIcon = feat.icon;
            return (
              <Reveal key={feat.title} delay={i * 80}>
                <div className="flex gap-4 rounded-xl border border-border bg-card p-5 h-full">
                  <div className="w-9 h-9 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                    <FeatIcon className="h-[18px] w-[18px] text-foreground" strokeWidth={2} />
                  </div>
                  <div>
                    <h4 className="text-[15px] font-semibold text-foreground mb-1 leading-tight">{feat.title}</h4>
                    <p className="text-[13px] text-muted-foreground leading-[1.5]">{feat.desc}</p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>

      {/* Section divider */}
      <div className="flex justify-center mt-16">
        <ArthaIcon size={16} className="text-foreground/15 animate-[subtle-float_3s_ease-in-out_infinite_0.5s]" />
      </div>

      {/* CTA — dark rounded block */}
      <div className="max-w-3xl mx-auto w-full px-6 mt-16">
        <Reveal>
          <div className="rounded-[18px] bg-foreground text-background text-center px-8 sm:px-12 py-16 sm:py-[72px]">
            <h3 className="font-display text-4xl sm:text-5xl font-extrabold tracking-[-0.02em] leading-none mb-4">
              What will you build tonight?
            </h3>
            <p className="text-[17px] text-background/80 mb-8">
              35 free credits. No card required.
            </p>
            <Button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              size="lg"
              className="h-12 px-8 text-base font-medium rounded-md bg-background text-foreground hover:bg-background/95 shadow-sm hover:scale-[1.02] active:scale-[0.98]"
            >
              Build my company
            </Button>
            <div className="mt-4">
              <Link href="/pricing" className="text-sm text-background/60 hover:text-background underline underline-offset-2">
                View pricing &rarr;
              </Link>
            </div>
          </div>
        </Reveal>
      </div>

      {/* Footer — full width */}
      <footer className="w-full mt-16 pb-8 px-6">
        <div className="max-w-2xl mx-auto pt-8 border-t border-border">
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link href="/tools" className="hover:text-foreground underline underline-offset-2">
              Free Tools
            </Link>
            <Link href="/pricing" className="hover:text-foreground underline underline-offset-2">
              Pricing
            </Link>
            <Link href="/blog" className="hover:text-foreground underline underline-offset-2">
              Blog
            </Link>
            <Link href="/terms" className="hover:text-foreground underline underline-offset-2">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground underline underline-offset-2">
              Privacy
            </Link>
            <a
              href="mailto:parth@artha.run"
              className="hover:text-foreground underline underline-offset-2"
            >
              Contact: parth@artha.run
            </a>
            <span className="text-muted-foreground/80">© 2026 Artha</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
