"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import type { FreeToolDef } from "@/lib/free-tools";
import { Check, Copy, PenLine, Sparkles, Download } from "lucide-react";

interface ToolPageProps {
  /** Pass the FreeToolDef to auto-populate headline, description, placeholder, cta, examples, features, about, tips */
  tool?: FreeToolDef;
  /** Override headline (falls back to tool.headline) */
  headline?: string;
  description?: string;
  placeholder?: string;
  ctaLabel?: string;
  apiEndpoint: string;
  extraFields?: ReactNode;
  inputOverride?: (value: string, onChange: (v: string) => void) => ReactNode;
  renderResult: (data: Record<string, unknown>) => ReactNode;
  buildBody?: (prompt: string) => Record<string, unknown>;
}

// ── Progress Steps ──────────────────────────────────────────────────
const PROGRESS_STEPS = [
  { label: "Analyzing your input", delay: 0 },
  { label: "Generating content", delay: 3000 },
  { label: "Finalizing results", delay: 8000 },
];

function ProgressIndicator() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers = PROGRESS_STEPS.slice(1).map((s, i) =>
      setTimeout(() => setStep(i + 1), s.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="mt-4 space-y-2">
      {PROGRESS_STEPS.map((s, i) => (
        <div key={i} className="flex items-center gap-2.5">
          <div
            className={`flex-shrink-0 size-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-500 ${
              i < step
                ? "bg-emerald-500/15 text-emerald-600"
                : i === step
                ? "bg-foreground/10 text-foreground animate-pulse"
                : "bg-muted text-muted-foreground/40"
            }`}
          >
            {i < step ? <Check className="size-3" /> : i + 1}
          </div>
          <span
            className={`text-sm transition-colors duration-300 ${
              i < step
                ? "text-emerald-600"
                : i === step
                ? "text-foreground"
                : "text-muted-foreground/40"
            }`}
          >
            {s.label}
            {i === step && (
              <span className="inline-flex ml-1">
                <span className="animate-bounce [animation-delay:0ms]">.</span>
                <span className="animate-bounce [animation-delay:150ms]">.</span>
                <span className="animate-bounce [animation-delay:300ms]">.</span>
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── How It Works ────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { icon: <PenLine className="size-4" />, title: "Describe", desc: "Enter what you need" },
    { icon: <Sparkles className="size-4" />, title: "AI Generates", desc: "Processed in seconds" },
    { icon: <Download className="size-4" />, title: "Get Results", desc: "Copy, download, or refine" },
  ];

  return (
    <div className="mb-8">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">How it works</p>
      <div className="grid grid-cols-3 gap-3">
        {steps.map((s, i) => (
          <div key={i} className="relative flex flex-col items-center text-center p-3 rounded-lg bg-muted/50">
            <div className="size-8 rounded-full bg-foreground/5 flex items-center justify-center text-foreground/70 mb-2">
              {s.icon}
            </div>
            <p className="text-sm font-semibold text-foreground">{s.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
            {i < 2 && (
              <div className="hidden sm:block absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 text-muted-foreground/30 text-lg">
                &rarr;
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Example Prompts ────────────────────────────────────────────────
function ExamplePrompts({
  examples,
  onSelect,
}: {
  examples: string[];
  onSelect: (example: string) => void;
}) {
  return (
    <div className="mb-3">
      <p className="text-xs text-muted-foreground mb-1.5">Try an example:</p>
      <div className="flex flex-wrap gap-1.5">
        {examples.map((ex, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(ex)}
            className="text-xs bg-muted hover:bg-foreground/10 text-foreground/70 hover:text-foreground px-3 py-1.5 rounded-full transition-colors cursor-pointer text-left"
          >
            {ex.length > 60 ? ex.slice(0, 57) + "..." : ex}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── About Section (always visible for SEO) ────────────────────────
function AboutSection({ tool }: { tool: FreeToolDef }) {
  const { about, features, tips, dailyLimit } = tool;
  if (!about && !features?.length && !tips?.length) return null;

  return (
    <section className="mt-10 border border-border rounded-lg">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">About this tool</h2>
      </div>
      <div className="px-5 pb-5 space-y-4 text-sm text-foreground/70 pt-4">
        {about && (
          <div>
            <h3 className="font-semibold text-foreground mb-1">What it does</h3>
            <p>{about}</p>
          </div>
        )}
        {features && features.length > 0 && (
          <div>
            <h3 className="font-semibold text-foreground mb-1">Key features</h3>
            <ul className="list-disc list-inside space-y-0.5">
              {features.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}
        {tips && tips.length > 0 && (
          <div>
            <h3 className="font-semibold text-foreground mb-1">Tips for better results</h3>
            <ul className="list-disc list-inside space-y-0.5">
              {tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <h3 className="font-semibold text-foreground mb-1">Usage</h3>
          <p>
            Free to use{dailyLimit ? ` — ${dailyLimit} uses per day` : ""}. No signup required.{" "}
            <Link href="/api/auth/google?return=/" className="text-foreground underline underline-offset-2 hover:no-underline">
              Sign up for unlimited access
            </Link>.
          </p>
        </div>
      </div>
    </section>
  );
}

// ── FAQ Section (server-rendered for SEO) ──────────────────────────
function FAQSection({ faqs }: { faqs: { q: string; a: string }[] }) {
  if (!faqs || faqs.length === 0) return null;

  return (
    <section className="mt-8 border border-border rounded-lg">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Frequently Asked Questions</h2>
      </div>
      <div className="divide-y divide-border">
        {faqs.map((faq, i) => (
          <div key={i} className="px-5 py-4">
            <h3 className="text-sm font-semibold text-foreground mb-1">{faq.q}</h3>
            <p className="text-sm text-foreground/70">{faq.a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Main ToolPage Component ─────────────────────────────────────────
export function ToolPage({
  tool,
  headline,
  description,
  placeholder,
  ctaLabel,
  apiEndpoint,
  extraFields,
  inputOverride,
  renderResult,
  buildBody,
}: ToolPageProps) {
  const h = headline || tool?.headline || "";
  const desc = description || tool?.description || "";
  const ph = placeholder || tool?.placeholder || "";
  const cta = ctaLabel || tool?.cta || "Generate";
  const examples = tool?.examples || [];

  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !prompt.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const body = buildBody ? buildBody(prompt) : { prompt: prompt.trim() };
      const res = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || `Something went wrong (${res.status})`);
        return;
      }

      setResult(data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    const text = resultRef.current?.innerText || "";
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 sm:py-16">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{h}</h1>
        <p className="mt-3 text-base text-foreground/60 leading-relaxed">{desc}</p>
      </div>

      {/* How It Works */}
      <HowItWorks />

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        {extraFields}

        {/* Example Prompts */}
        {examples.length > 0 && !result && (
          <ExamplePrompts examples={examples} onSelect={setPrompt} />
        )}

        {inputOverride ? (
          inputOverride(prompt, setPrompt)
        ) : (
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={ph}
            className="min-h-[120px] text-base resize-y"
            disabled={loading}
          />
        )}
        <Button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="w-full h-12 text-base font-medium bg-foreground hover:bg-foreground/90 text-background"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generating...
            </span>
          ) : (
            cta
          )}
        </Button>
      </form>

      {/* Progress Indicator */}
      {loading && <ProgressIndicator />}

      {/* Error */}
      {error && (
        <div className="mt-6 p-4 bg-destructive/5 border border-destructive/20 rounded-lg text-destructive text-sm">
          {error}
          {error.includes("Daily limit") && (
            <Link href="/api/auth/google?return=/" className="block mt-2 text-foreground font-medium underline underline-offset-2 hover:no-underline">
              Sign up for unlimited access &rarr;
            </Link>
          )}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mt-8">
          {/* Result header with copy */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-bold text-foreground">Results</h2>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-md hover:bg-muted"
            >
              {copied ? (
                <>
                  <Check className="size-3.5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  Copy
                </>
              )}
            </button>
          </div>

          <div ref={resultRef}>{renderResult(result)}</div>

          {/* CTA Banner */}
          <div className="mt-10 py-10 px-6 border border-border rounded-lg text-center">
            <p className="font-display text-xl font-bold text-foreground">Want the full experience?</p>
            <p className="mt-2 text-sm text-foreground/60">
              Artha builds your entire company — website, email, outreach, tasks — from one prompt.
            </p>
            <Link href="/api/auth/google?return=/">
              <Button className="mt-4 h-10 px-6 bg-foreground hover:bg-foreground/90 text-background font-medium">
                Build your company for free &rarr;
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* About This Tool */}
      {tool && <AboutSection tool={tool} />}

      {/* FAQ Section */}
      {tool?.faqs && <FAQSection faqs={tool.faqs} />}
    </div>
  );
}
