"use client";

import Link from "next/link";
import { ArthaIcon } from "@/components/icons/artha-icon";
import { useLiveDashboard, type LiveDashboardData } from "@/hooks/use-live-dashboard";
import { LiveAiStream } from "./live-ai-stream";
import { LiveMetrics } from "./live-metrics";
import { LiveRunningTasks } from "./live-running-tasks";
import { LiveRecentCompanies } from "./live-recent-companies";
import { LiveRecentDocuments } from "./live-recent-documents";
import { LiveRecentTweets } from "./live-recent-tweets";
import { LiveRecentEmails } from "./live-recent-emails";
import { LiveCta } from "./live-cta";

interface LiveDashboardProps {
  initialData: LiveDashboardData;
}

export function LiveDashboard({ initialData }: LiveDashboardProps) {
  const { data, isFetching } = useLiveDashboard(initialData);
  const d = data ?? initialData;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-neutral-50/80 backdrop-blur-sm border-b border-border">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <ArthaIcon size={22} />
              <span className="text-lg font-bold tracking-tight font-[family-name:var(--font-display)]">
                artha
              </span>
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              LIVE
            </span>
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-5 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Try Artha
          </Link>
        </div>
      </header>

      {/* Grid */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
          {/* Column 1 */}
          <div className="flex flex-col gap-4 lg:gap-5">
            <div className="animate-[reveal-up_500ms_ease-out_both]">
              <LiveAiStream activities={d.aiActivity} isFetching={isFetching} />
            </div>
            <div className="animate-[reveal-up_500ms_ease-out_100ms_both]">
              <LiveMetrics metrics={d.metrics} />
            </div>
          </div>

          {/* Column 2 */}
          <div className="flex flex-col gap-4 lg:gap-5">
            <div className="animate-[reveal-up_500ms_ease-out_150ms_both]">
              <LiveRunningTasks tasks={d.runningTasks} completedTasks={d.completedTasks} totalTasks={d.totals.tasks} isFetching={isFetching} />
            </div>
            <div className="animate-[reveal-up_500ms_ease-out_250ms_both]">
              <LiveRecentCompanies companies={d.recentCompanies} totalCompanies={d.totals.companies} isFetching={isFetching} />
            </div>
            <div className="animate-[reveal-up_500ms_ease-out_350ms_both]">
              <LiveRecentDocuments documents={d.recentDocuments} totalDocuments={d.totals.documents} isFetching={isFetching} />
            </div>
          </div>

          {/* Column 3 */}
          <div className="flex flex-col gap-4 lg:gap-5 md:col-span-2 lg:col-span-1">
            <div className="animate-[reveal-up_500ms_ease-out_300ms_both]">
              <LiveRecentTweets tweets={d.recentTweets} totalTweets={d.totals.tweets} isFetching={isFetching} />
            </div>
            <div className="animate-[reveal-up_500ms_ease-out_400ms_both]">
              <LiveRecentEmails emails={d.recentEmails} totalEmails={d.totals.emails} isFetching={isFetching} />
            </div>
            <div className="animate-[reveal-up_500ms_ease-out_500ms_both]">
              <LiveCta />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
