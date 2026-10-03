import type { Metadata } from "next";
import Link from "next/link";
import { ArthaIcon } from "@/components/icons/artha-icon";

export const metadata: Metadata = {
  title: { template: "%s | Free AI Tools by Artha", default: "Free AI Tools | Artha" },
  description: "Free AI-powered tools: market research, business plans, logos, email generator, landing pages, SEO audits, tweet generator, content calendars, and more.",
};

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header — matches main Artha site */}
      <div className="max-w-5xl mx-auto w-full px-6 pt-6 sm:pt-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <ArthaIcon size={28} className="text-foreground" />
            <span className="font-display text-xl font-bold tracking-tight text-foreground">artha</span>
          </Link>
          <nav className="flex items-center gap-4 sm:gap-6">
            <Link href="/tools" className="inline-flex items-center text-sm font-medium py-1.5 px-3.5 rounded-full bg-foreground text-background hover:bg-foreground/85 transition-colors">
              Free AI Tools
            </Link>
            <Link href="/pricing" className="text-foreground/70 text-sm font-medium hover:text-foreground">
              Pricing
            </Link>
            <Link href="/blog" className="text-foreground/70 text-sm font-medium hover:text-foreground">
              Blog
            </Link>
            <Link
              href="/api/auth/google?return=/"
              className="text-foreground text-sm font-medium underline underline-offset-2 hover:no-underline"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1">{children}</main>

      {/* Footer — matches main Artha site */}
      <footer className="w-full mt-16 pb-8 px-6">
        <div className="max-w-5xl mx-auto pt-8 border-t border-border">
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
            <span className="text-muted-foreground/80">&copy; {new Date().getFullYear()} Artha</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
