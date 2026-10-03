import type { Metadata } from "next";
import { getDb } from "@/lib/neon";
import { notFound } from "next/navigation";
import Link from "next/link";

interface BuildSummary {
  companyName: string;
  tagline: string;
  slug: string;
  buildDurationSeconds: number;
  competitorsFound: number;
  tasksQueued: number;
  builtAt: string;
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getBuildData(slug: string) {
  const db = getDb();
  const rows = await db`
    SELECT name, slug, memory, landing_page_published
    FROM projects WHERE slug = ${slug} AND status = 'active'
  `;
  if (rows.length === 0) return null;
  const project = rows[0];
  const memory = (project.memory as Record<string, unknown>) || {};
  const buildSummary = memory.buildSummary as BuildSummary | undefined;
  return { project, buildSummary };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getBuildData(slug);
  if (!data) return { title: "Build Not Found" };

  const { project, buildSummary } = data;
  const duration = buildSummary?.buildDurationSeconds
    ? `in ${buildSummary.buildDurationSeconds} seconds`
    : "with AI";
  const title = `${project.name} was built ${duration} with Artha`;
  const description = buildSummary?.tagline || `See how ${project.name} was built from a single prompt.`;

  const ogImage = `https://artha.run/api/og/${slug}`;

  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: ogImage, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center p-4 rounded-lg bg-muted/50">
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

export default async function BuiltPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await getBuildData(slug);
  if (!data) notFound();

  const { project, buildSummary } = data;
  const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
  const siteUrl = `https://${slug}.${companyDomain}`;

  const duration = buildSummary?.buildDurationSeconds
    ? `${buildSummary.buildDurationSeconds}s`
    : "< 60s";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Built with Artha
            </p>
            <h1 className="text-3xl font-bold text-foreground">
              {project.name}
            </h1>
            {buildSummary?.tagline && (
              <p className="text-muted-foreground mt-2">
                {buildSummary.tagline}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 px-6 pb-6">
            <StatCard label="Build time" value={duration} />
            <StatCard
              label="Competitors"
              value={String(buildSummary?.competitorsFound ?? 0)}
            />
            <StatCard
              label="Tasks queued"
              value={String(buildSummary?.tasksQueued ?? 0)}
            />
          </div>

          {project.landing_page_published && (
            <div className="px-6 pb-6">
              <a
                href={siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Visit {slug}.{companyDomain}
              </a>
            </div>
          )}

          <div className="border-t border-border p-6">
            <Link
              href="/"
              className="block w-full text-center py-3 rounded-lg bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors"
            >
              Build yours — it&apos;s free
            </Link>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Describe your idea. Artha builds the rest.
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6">
          <Link href="/" className="hover:text-foreground transition-colors">
            artha.run
          </Link>
        </p>
      </div>
    </div>
  );
}
