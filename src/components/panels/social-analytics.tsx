"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Project } from "@/lib/types";
import type {
  EngagementSummary,
  PostAnalytics,
  PostingHeatmap,
} from "@/lib/social-analytics";

// ── Types ────────────────────────────────────────────────────────────

interface SocialAnalyticsProps {
  project: Project;
}

interface AnalyticsData {
  analytics: PostAnalytics;
  engagement: EngagementSummary;
  optimalTimes: {
    times: Array<{ hour: number; day: number; dayLabel: string; count: number }>;
    heatmap: PostingHeatmap;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

const DAY_LABELS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  if (i === 0) return "12a";
  if (i < 12) return `${i}a`;
  if (i === 12) return "12p";
  return `${i - 12}p`;
});

function heatmapColor(value: number, max: number): string {
  if (max === 0 || value === 0) return "bg-muted";
  const intensity = value / max;
  if (intensity > 0.75) return "bg-blue-600";
  if (intensity > 0.5) return "bg-blue-500";
  if (intensity > 0.25) return "bg-blue-400";
  return "bg-blue-200";
}

// ── Component ────────────────────────────────────────────────────────

export function SocialAnalyticsPanel({ project }: SocialAnalyticsProps) {
  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["social-analytics", project.id],
    queryFn: async () => {
      const [analyticsRes, engagementRes, timesRes] = await Promise.all([
        fetch(`/api/content/calendar?projectId=${project.id}&action=analytics`),
        fetch(`/api/content/calendar?projectId=${project.id}&action=engagement`),
        fetch(`/api/content/calendar?projectId=${project.id}&action=optimal-times`),
      ]);

      // If the dedicated endpoints don't exist yet, fetch via a combined endpoint
      // For now, we call the social-analytics server functions indirectly
      // via a simple API proxy pattern
      const [analytics, engagement, optimalTimes] = await Promise.all([
        analyticsRes.ok ? analyticsRes.json() : { totalPosts: 0, byCategory: {}, byStatus: {}, postsPerDay: 0, earliestPost: null, latestPost: null },
        engagementRes.ok ? engagementRes.json() : { postsPerDay: 0, postsThisWeek: 0, postsThisMonth: 0, mostActiveDay: null, postingStreak: 0, totalPosts: 0 },
        timesRes.ok ? timesRes.json() : { times: [], heatmap: { grid: Array.from({ length: 7 }, () => Array(24).fill(0)), maxCount: 0 } },
      ]);

      return { analytics, engagement, optimalTimes };
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">Social Analytics</h2>
        <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
          Loading analytics...
        </div>
      </div>
    );
  }

  const engagement = data?.engagement ?? {
    postsPerDay: 0,
    postsThisWeek: 0,
    postsThisMonth: 0,
    mostActiveDay: null,
    postingStreak: 0,
    totalPosts: 0,
  };

  const analytics = data?.analytics ?? {
    totalPosts: 0,
    byCategory: {},
    byStatus: {},
    postsPerDay: 0,
    earliestPost: null,
    latestPost: null,
  };

  const heatmap = data?.optimalTimes?.heatmap ?? {
    grid: Array.from({ length: 7 }, () => Array(24).fill(0)),
    maxCount: 0,
  };

  // Bar chart data: posts by day of week from heatmap
  const dayTotals = DAY_LABELS_SHORT.map((label, i) => ({
    day: label,
    posts: heatmap.grid[i]?.reduce((a: number, b: number) => a + b, 0) ?? 0,
  }));

  // Top categories
  const categories = Object.entries(analytics.byCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-semibold">Social Analytics</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-2xl font-bold">{engagement.totalPosts}</p>
            <p className="text-xs text-muted-foreground">Total Posts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-2xl font-bold">{engagement.postsThisWeek}</p>
            <p className="text-xs text-muted-foreground">Posts This Week</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-2xl font-bold">
              {engagement.postingStreak}
              <span className="text-sm font-normal text-muted-foreground ml-1">
                days
              </span>
            </p>
            <p className="text-xs text-muted-foreground">Posting Streak</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-2xl font-bold">
              {engagement.postsPerDay.toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground">Posts/Day (30d)</p>
          </CardContent>
        </Card>
      </div>

      {/* Posts by day of week bar chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Posts by Day of Week</CardTitle>
        </CardHeader>
        <CardContent>
          {engagement.totalPosts === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No posting data yet. Posts will appear here once your social accounts are active.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dayTotals}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 12 }}
                  className="fill-muted-foreground"
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12 }}
                  className="fill-muted-foreground"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="posts" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Posting heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Posting Activity Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          {heatmap.maxCount === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No data to display yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[600px]">
                {/* Hour labels */}
                <div className="flex ml-10 mb-1">
                  {HOUR_LABELS.filter((_, i) => i % 3 === 0).map((label) => (
                    <span
                      key={label}
                      className="text-[10px] text-muted-foreground"
                      style={{ width: `${(3 / 24) * 100}%` }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
                {/* Rows: each day */}
                {DAY_LABELS_SHORT.map((dayLabel, dayIdx) => (
                  <div key={dayLabel} className="flex items-center gap-1 mb-0.5">
                    <span className="text-[10px] text-muted-foreground w-8 text-right">
                      {dayLabel}
                    </span>
                    <div className="flex flex-1 gap-px">
                      {heatmap.grid[dayIdx]?.map(
                        (count: number, hourIdx: number) => (
                          <div
                            key={hourIdx}
                            className={`flex-1 h-4 rounded-sm ${heatmapColor(count, heatmap.maxCount)}`}
                            title={`${dayLabel} ${HOUR_LABELS[hourIdx]}: ${count} posts`}
                          />
                        ),
                      )}
                    </div>
                  </div>
                ))}
                {/* Legend */}
                <div className="flex items-center gap-2 mt-2 ml-10">
                  <span className="text-[10px] text-muted-foreground">Less</span>
                  <div className="h-3 w-3 rounded-sm bg-muted" />
                  <div className="h-3 w-3 rounded-sm bg-blue-200" />
                  <div className="h-3 w-3 rounded-sm bg-blue-400" />
                  <div className="h-3 w-3 rounded-sm bg-blue-500" />
                  <div className="h-3 w-3 rounded-sm bg-blue-600" />
                  <span className="text-[10px] text-muted-foreground">More</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top categories */}
      {categories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top Post Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {categories.map(([category, count]) => {
                const pct =
                  analytics.totalPosts > 0
                    ? Math.round((count / analytics.totalPosts) * 100)
                    : 0;
                return (
                  <div key={category} className="flex items-center gap-3">
                    <Badge variant="secondary" className="text-xs capitalize">
                      {category}
                    </Badge>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-12 text-right">
                      {count} ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Most active day */}
      {engagement.mostActiveDay && (
        <div className="text-xs text-muted-foreground">
          Most active day: <strong>{engagement.mostActiveDay}</strong>
        </div>
      )}
    </div>
  );
}
