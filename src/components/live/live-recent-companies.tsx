"use client";

import type { LiveRecentCompany } from "@/hooks/use-live-dashboard";
import { LiveSectionHeader } from "./live-section-header";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

interface LiveRecentCompaniesProps {
  companies: LiveRecentCompany[];
  totalCompanies: number;
  isFetching?: boolean;
}

export function LiveRecentCompanies({ companies, totalCompanies, isFetching }: LiveRecentCompaniesProps) {
  const companyDomain = typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com")
    : "tryartha.com";

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <LiveSectionHeader
        title="Companies"
        isFetching={isFetching}
        right={
          totalCompanies > 0 ? (
            <span className="text-xs text-muted-foreground">
              {formatNumber(totalCompanies)} total
            </span>
          ) : null
        }
      />

      <div className="divide-y divide-border">
        {companies.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">No companies yet</p>
          </div>
        ) : (
          companies.slice(0, 6).map((company) => (
            <a
              key={company.slug}
              href={`https://${company.slug}.${companyDomain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-4 py-2.5 hover:bg-neutral-50 transition-colors group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                    {company.name}
                  </p>
                  {company.tagline && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {company.tagline}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">
                    {company.slug}.{companyDomain}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                  {timeAgo(company.createdAt)}
                </span>
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
