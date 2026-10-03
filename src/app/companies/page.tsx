import type { Metadata } from "next";
import { getDb } from "@/lib/neon";
import Link from "next/link";
import { CompaniesGridAnimated } from "@/components/companies/companies-grid-animated";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Companies Built with Artha",
  description:
    "See real companies built with AI. From idea to live website in under 60 seconds.",
  openGraph: {
    title: "Companies Built with Artha",
    description:
      "See real companies built with AI. From idea to live website in under 60 seconds.",
  },
};

interface CompanyRow {
  slug: string;
  name: string;
  tagline: string | null;
  created_at: string;
}

async function getPublishedCompanies(): Promise<CompanyRow[]> {
  const db = getDb();
  const rows = await db`
    SELECT
      p.slug,
      p.name,
      cp.tagline,
      p.created_at
    FROM projects p
    LEFT JOIN company_profile cp ON cp.project_id = p.id
    WHERE p.landing_page_published = TRUE
      AND p.slug IS NOT NULL
      AND p.status = 'active'
      AND COALESCE(p.hidden, false) = false
      AND COALESCE((cp.settings->>'show_in_showcase')::boolean, true) = true
    ORDER BY p.created_at DESC
    LIMIT 100
  `;
  return rows as CompanyRow[];
}

export default async function CompaniesPage() {
  const companies = await getPublishedCompanies();
  const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header — contained for readability */}
      <header className="max-w-3xl mx-auto px-6 pt-16 pb-12 text-center">
        <Link
          href="/"
          className="inline-block text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          &larr; artha.run
        </Link>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
          Companies built with Artha
        </h1>
        <p className="text-lg text-muted-foreground mt-3 max-w-xl mx-auto">
          Real companies, built from a single prompt. Each one has a live
          website, automated tasks, and AI-powered growth.
        </p>
      </header>

      {/* Cards grid — full width */}
      <div className="w-full px-4 sm:px-6 lg:px-10 pb-16">
        {companies.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground">
              No companies published yet. Be the first!
            </p>
          </div>
        ) : (
          <CompaniesGridAnimated
            companies={companies.map((c) => ({ slug: c.slug, name: c.name, tagline: c.tagline }))}
            companyDomain={companyDomain}
          />
        )}

        {/* CTA */}
        <div className="text-center mt-16 pb-8">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-8 py-3 text-base font-medium hover:bg-primary/90 transition-colors"
          >
            Build yours
          </Link>
          <p className="text-sm text-muted-foreground mt-3">
            Describe your idea. We build the rest.
          </p>
        </div>
      </div>
    </div>
  );
}
