"use client";

import { useState } from "react";
import Link from "next/link";
import { ArthaIcon } from "@/components/icons/artha-icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Benefit {
  title: string;
  desc: string;
}

interface NicheLandingPageProps {
  niche: string;
  headline: string;
  subheadline: string;
  ctaText: string;
  placeholder: string;
  benefits: Benefit[];
  socialProof: string;
}

export function NicheLandingPage({
  headline,
  subheadline,
  ctaText,
  placeholder,
  benefits,
  socialProof,
}: NicheLandingPageProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  function handleSignIn() {
    const returnPath =
      typeof window !== "undefined"
        ? encodeURIComponent(window.location.pathname || "/")
        : "/";
    window.location.href = `/api/auth/google?return=${returnPath}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/start-with-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
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

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Nav */}
      <div className="max-w-3xl mx-auto w-full px-6 pt-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2">
            <ArthaIcon size={24} className="text-foreground" />
            <span className="font-display font-bold text-foreground text-lg">artha</span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground">
              Pricing
            </Link>
            <Link href="/blog" className="text-sm text-muted-foreground hover:text-foreground hidden sm:inline">
              Blog
            </Link>
            <button
              onClick={handleSignIn}
              className="text-sm font-medium text-foreground underline underline-offset-2 hover:no-underline"
            >
              Sign in
            </button>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-3xl mx-auto w-full px-6 pt-16 sm:pt-24">
        <p className="text-sm font-medium text-primary mb-4">{socialProof}</p>
        <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground mb-6">
          {headline}
        </h1>
        <p className="text-lg text-foreground/80 leading-relaxed mb-8 max-w-2xl">
          {subheadline}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Textarea
            placeholder={placeholder}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[100px] resize-y"
            maxLength={2000}
          />
          <Button
            type="submit"
            size="lg"
            disabled={loading}
            className="h-12 px-8 text-base font-medium rounded-md bg-foreground hover:bg-foreground/90 text-background shadow-sm hover:scale-[1.02] active:scale-[0.98]"
          >
            {loading ? "Taking you to sign in..." : ctaText}
          </Button>
        </form>

        <p className="text-sm text-muted-foreground mt-4">
          Free to start. 5 AI task credits included. No credit card required.
        </p>
      </div>

      {/* Benefits */}
      <div className="max-w-3xl mx-auto w-full px-6 mt-20">
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground mb-8">
          What Artha does for you
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {benefits.map((benefit) => (
            <div key={benefit.title} className="rounded-lg border border-border p-5">
              <h3 className="font-semibold text-foreground mb-2">{benefit.title}</h3>
              <p className="text-sm text-foreground/60 leading-relaxed">{benefit.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="max-w-3xl mx-auto w-full px-6 mt-20">
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground mb-8 text-center">
          How it works
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {[
            { num: "1", title: "Describe your business", desc: "Tell us what you do in one prompt. That's it." },
            { num: "2", title: "We build everything", desc: "AI creates your website, market research, email, and first tasks — in 3 minutes." },
            { num: "3", title: "It keeps working", desc: "Nightly tasks find leads, send outreach, and post content. You review results each morning." },
          ].map((step) => (
            <div key={step.num} className="text-center">
              <div className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center text-sm font-bold mx-auto mb-4">
                {step.num}
              </div>
              <h4 className="font-semibold text-foreground mb-2">{step.title}</h4>
              <p className="text-sm text-foreground/60 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing teaser */}
      <div className="max-w-3xl mx-auto w-full px-6 mt-20 text-center">
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground mb-4">
          Simple pricing
        </h2>
        <p className="text-foreground/60 mb-2">Start free with 5 credits. Plans from $49/month.</p>
        <Link href="/pricing" className="text-sm text-primary underline underline-offset-2">
          View all plans
        </Link>
      </div>

      {/* CTA */}
      <div className="max-w-3xl mx-auto w-full px-6 mt-20 text-center">
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground mb-4">
          Ready to get started?
        </h2>
        <Button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          size="lg"
          className="h-12 px-8 text-base font-medium rounded-md bg-foreground hover:bg-foreground/90 text-background shadow-sm"
        >
          {ctaText}
        </Button>
      </div>

      {/* Footer */}
      <footer className="w-full mt-16 pb-8 px-6">
        <div className="max-w-2xl mx-auto pt-8 border-t border-border">
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground underline underline-offset-2">Home</Link>
            <Link href="/pricing" className="hover:text-foreground underline underline-offset-2">Pricing</Link>
            <Link href="/blog" className="hover:text-foreground underline underline-offset-2">Blog</Link>
            <Link href="/for/freelancers" className="hover:text-foreground underline underline-offset-2">Freelancers</Link>
            <Link href="/for/indie-hackers" className="hover:text-foreground underline underline-offset-2">Indie Hackers</Link>
            <Link href="/for/consultants" className="hover:text-foreground underline underline-offset-2">Consultants</Link>
            <span className="text-muted-foreground/80">&copy; 2026 Artha</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
