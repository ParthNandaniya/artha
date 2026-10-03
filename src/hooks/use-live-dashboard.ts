"use client";

import { useQuery } from "@tanstack/react-query";

export interface LiveDashboardMetrics {
  activeCompanies: number;
  tasksCompleted: number;
  emailsSent: number;
  humanMessages: number;
}

export interface LiveAiActivity {
  id: string;
  projectName: string;
  projectSlug: string;
  step: string;
  logMessage: string;
  logType: string;
  createdAt: string;
}

export interface LiveRunningTask {
  id: string;
  title: string;
  type: string | null;
  status: string;
  startedAt: string | null;
  projectName: string;
  projectSlug: string;
  source: "task" | "job";
}

export interface LiveCompletedTask {
  id: string;
  title: string;
  type: string | null;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  projectName: string;
  projectSlug: string;
}

export interface LiveRecentCompany {
  name: string;
  slug: string;
  tagline: string | null;
  createdAt: string;
}

export interface LiveRecentDocument {
  title: string;
  type: string;
  projectName: string;
  projectSlug: string;
  createdAt: string;
}

export interface LiveRecentTweet {
  content: string;
  tweetUrl: string | null;
  blueskyUrl: string | null;
  type: string;
  postedAt: string;
  projectName: string;
  projectSlug: string;
  source: "user" | "bot";
}

export interface LiveRecentEmail {
  subject: string;
  toEmail?: string;
  fromEmail?: string;
  createdAt: string;
}

export interface LiveTotals {
  companies: number;
  documents: number;
  tweets: number;
  emails: number;
  tasks: number;
}

export interface LiveDashboardData {
  metrics: LiveDashboardMetrics;
  aiActivity: LiveAiActivity[];
  runningTasks: LiveRunningTask[];
  completedTasks: LiveCompletedTask[];
  recentCompanies: LiveRecentCompany[];
  recentDocuments: LiveRecentDocument[];
  recentTweets: LiveRecentTweet[];
  recentEmails: LiveRecentEmail[];
  totals: LiveTotals;
  generatedAt: string;
}

export function useLiveDashboard(initialData?: LiveDashboardData) {
  return useQuery<LiveDashboardData>({
    queryKey: ["live-dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/live");
      if (!res.ok) throw new Error("Failed to fetch live data");
      return res.json();
    },
    initialData,
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}
