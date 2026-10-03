import type { Metadata } from "next";
import Link from "next/link";
import { FREE_TOOLS } from "@/lib/free-tools";
import { Search, FileText, Palette, Mail, Layout, BarChart3, MessageCircle, Calendar, Users, Send, PenTool, Sparkles, Shield, Paintbrush, Calculator, Globe, Presentation, Target, ShoppingBag, Rocket, Receipt, Flame, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "21 Free AI Tools for Startups & Founders | Artha",
  description: "21 free AI tools: business name generator, pitch deck, privacy policy, brand kit, startup cost calculator, ICP builder, market research, invoice generator, and more. No signup required.",
  keywords: [
    "free ai tools",
    "ai business tools",
    "startup tools",
    "ai marketing tools",
    "free online tools",
    "ai generator",
    "business name generator",
    "pitch deck generator",
    "privacy policy generator",
    "brand kit generator",
    "startup cost calculator",
    "domain name finder",
    "icp builder",
    "ideal customer profile",
    "product description writer",
    "go to market strategy",
    "invoice generator",
    "ai market research",
    "ai seo audit",
    "ai landing page generator",
    "free startup tools",
  ],
  openGraph: {
    title: "21 Free AI Tools for Startups & Founders | Artha",
    description: "Free AI tools: business name generator, pitch deck, privacy policy, brand kit, cost calculator, ICP builder, market research, invoices, and more. No signup required.",
    url: "https://artha.run/tools",
    siteName: "Artha",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "21 Free AI Tools for Startups & Founders | Artha",
    description: "Free AI tools: business name generator, pitch deck, privacy policy, brand kit, cost calculator, ICP builder, market research, invoices, and more.",
  },
  alternates: { canonical: "https://artha.run/tools" },
};

const ICON_MAP: Record<string, React.ReactNode> = {
  search: <Search className="size-5" />,
  "file-text": <FileText className="size-5" />,
  palette: <Palette className="size-5" />,
  mail: <Mail className="size-5" />,
  layout: <Layout className="size-5" />,
  "bar-chart": <BarChart3 className="size-5" />,
  "message-circle": <MessageCircle className="size-5" />,
  calendar: <Calendar className="size-5" />,
  users: <Users className="size-5" />,
  send: <Send className="size-5" />,
  "pen-tool": <PenTool className="size-5" />,
  sparkles: <Sparkles className="size-5" />,
  shield: <Shield className="size-5" />,
  paintbrush: <Paintbrush className="size-5" />,
  calculator: <Calculator className="size-5" />,
  globe: <Globe className="size-5" />,
  presentation: <Presentation className="size-5" />,
  target: <Target className="size-5" />,
  "shopping-bag": <ShoppingBag className="size-5" />,
  rocket: <Rocket className="size-5" />,
  receipt: <Receipt className="size-5" />,
  flame: <Flame className="size-5" />,
  video: <Video className="size-5" />,
};

export default function ToolsIndexPage() {
  const tiers = [
    { label: "Most Popular", tools: FREE_TOOLS.filter((t) => t.tier === 1) },
    { label: "Growth", tools: FREE_TOOLS.filter((t) => t.tier === 2) },
    { label: "Advanced", tools: FREE_TOOLS.filter((t) => t.tier === 3) },
  ];

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 sm:py-16">
      {/* Header */}
      <div className="text-center mb-14">
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
          Free AI Tools
        </h1>
        <p className="mt-3 text-base text-foreground/60 max-w-xl mx-auto leading-relaxed">
          Powered by the same AI agents that build companies on Artha. No signup required.
        </p>
      </div>

      {/* Tool Grid by Tier */}
      {tiers.map((tier) => (
        <div key={tier.label} className="mb-12">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
            {tier.label}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tier.tools.map((tool) => (
              <Link
                key={tool.slug}
                href={`/tools/${tool.slug}`}
                className="group block p-5 rounded-lg border border-border hover:border-foreground/20 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 bg-foreground/5 text-foreground/70 rounded-lg flex items-center justify-center group-hover:bg-foreground/10 transition-colors">
                    {ICON_MAP[tool.icon] || <Search className="size-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground group-hover:text-foreground/80 transition-colors">
                      {tool.name}
                    </h3>
                    <p className="mt-1 text-sm text-foreground/50 line-clamp-2">
                      {tool.description}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {/* Bottom CTA */}
      <div className="text-center mt-16 py-12 px-8 border border-border rounded-lg">
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Want all of these — automated?
        </h2>
        <p className="mt-2 text-foreground/60 max-w-lg mx-auto">
          Artha builds your entire company from one prompt. Website, email, outreach, tasks — all running on autopilot.
        </p>
        <Link href="/api/auth/google?return=/">
          <Button className="mt-5 h-11 px-8 text-base font-medium bg-foreground hover:bg-foreground/90 text-background">
            Build your company for free &rarr;
          </Button>
        </Link>
      </div>
    </div>
  );
}
