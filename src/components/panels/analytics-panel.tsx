"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAnalytics } from "@/hooks/use-analytics";
import type { Project } from "@/lib/types";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface AnalyticsPanelProps {
  project: Project;
}

const DATE_RANGES = [7, 14, 30, 60, 90] as const;

const DEVICE_COLORS: Record<string, string> = {
  desktop: "#6366f1",
  mobile: "#f59e0b",
  tablet: "#10b981",
};

function formatDuration(ms: number): string {
  if (!ms || ms < 1000) return "0s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatDay(day: string): string {
  const d = new Date(day);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function AnalyticsPanel({ project }: AnalyticsPanelProps) {
  const [days, setDays] = useState<number>(30);
  const { data, isLoading } = useAnalytics(project.id, days);

  const companyDomain =
    process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
  const siteUrl = `${project.slug}.${companyDomain}`;

  if (!project.landing_page_published) {
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <h2 className="text-lg font-semibold">Site analytics</h2>
        <div className="border rounded-lg p-5 space-y-3">
          <p className="text-sm text-muted-foreground">
            Publish your website to start tracking analytics. Once your site is
            live, visitor data will appear here automatically.
          </p>
        </div>
      </div>
    );
  }

  const summary = data?.summary;
  const daily = (data?.daily ?? []).map((d) => ({
    ...d,
    day: formatDay(d.day),
  }));

  const hasData = summary && summary.totalPageviews > 0;

  return (
    <div className="p-4 sm:p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Site analytics</h2>
          <p className="text-xs sm:text-sm text-muted-foreground break-all">
            <a
              href={`https://${siteUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-mono"
            >
              {siteUrl}
            </a>
          </p>
        </div>
        <div className="flex gap-1 flex-wrap">
          {DATE_RANGES.map((d) => (
            <Button
              key={d}
              variant={days === d ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(d)}
              className="text-xs px-2.5"
            >
              {d}d
            </Button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Unique Visitors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatNumber(summary?.uniqueVisitors ?? 0)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Page Views
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatNumber(summary?.totalPageviews ?? 0)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Avg Session
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatDuration(summary?.avgSessionDurationMs ?? 0)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Engagement Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {summary?.engagementRate ?? 0}%
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="h-[250px] bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      ) : !hasData ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12 text-muted-foreground text-sm">
              <p>No analytics data yet for the last {days} days.</p>
              <p className="mt-1">
                Data will appear once visitors start browsing your site.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Traffic Chart */}
          {daily.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Traffic</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={daily}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border"
                    />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 12 }}
                      className="fill-muted-foreground"
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      className="fill-muted-foreground"
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "13px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="pageviews"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={false}
                      name="Page Views"
                    />
                    <Line
                      type="monotone"
                      dataKey="visitors"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                      name="Visitors"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Top Pages & Referrers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top Pages */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Pages</CardTitle>
              </CardHeader>
              <CardContent>
                {(data?.topPages ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No page data</p>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex text-xs text-muted-foreground font-medium pb-1 border-b">
                      <span className="flex-1">Page</span>
                      <span className="w-16 text-right">Views</span>
                      <span className="w-16 text-right">Unique</span>
                    </div>
                    {(data?.topPages ?? []).slice(0, 10).map((page, i) => (
                      <div
                        key={i}
                        className="flex items-center text-sm py-1"
                      >
                        <span className="flex-1 truncate font-mono text-xs">
                          {page.path}
                        </span>
                        <span className="w-16 text-right tabular-nums">
                          {page.views}
                        </span>
                        <span className="w-16 text-right tabular-nums text-muted-foreground">
                          {page.unique_visitors}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Referrers */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Referrers</CardTitle>
              </CardHeader>
              <CardContent>
                {(data?.topReferrers ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No referrer data
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex text-xs text-muted-foreground font-medium pb-1 border-b">
                      <span className="flex-1">Source</span>
                      <span className="w-16 text-right">Visits</span>
                    </div>
                    {(data?.topReferrers ?? []).slice(0, 10).map((ref, i) => (
                      <div
                        key={i}
                        className="flex items-center text-sm py-1"
                      >
                        <span className="flex-1 truncate text-xs">
                          {ref.referrer}
                        </span>
                        <span className="w-16 text-right tabular-nums">
                          {ref.count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Clicks & Devices */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Button Clicks */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Clicks</CardTitle>
              </CardHeader>
              <CardContent>
                {(data?.topClicks ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No click data yet
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex text-xs text-muted-foreground font-medium pb-1 border-b">
                      <span className="flex-1">Element</span>
                      <span className="w-14 text-right">Type</span>
                      <span className="w-14 text-right">Clicks</span>
                    </div>
                    {(data?.topClicks ?? []).slice(0, 10).map((click, i) => (
                      <div
                        key={i}
                        className="flex items-center text-sm py-1"
                      >
                        <span className="flex-1 truncate text-xs">
                          {click.button_text || click.href || "(unnamed)"}
                        </span>
                        <span className="w-14 text-right text-xs text-muted-foreground">
                          {click.element_tag}
                        </span>
                        <span className="w-14 text-right tabular-nums">
                          {click.clicks}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Device Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Devices</CardTitle>
              </CardHeader>
              <CardContent>
                {(data?.devices ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No device data yet
                  </p>
                ) : (
                  <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                    <ResponsiveContainer width={140} height={140}>
                      <PieChart>
                        <Pie
                          data={data?.devices ?? []}
                          dataKey="visitors"
                          nameKey="device"
                          cx="50%"
                          cy="50%"
                          outerRadius={60}
                          innerRadius={35}
                          strokeWidth={2}
                        >
                          {(data?.devices ?? []).map((entry, i) => (
                            <Cell
                              key={i}
                              fill={
                                DEVICE_COLORS[entry.device] ?? "#94a3b8"
                              }
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2">
                      {(data?.devices ?? []).map((d, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{
                              backgroundColor:
                                DEVICE_COLORS[d.device] ?? "#94a3b8",
                            }}
                          />
                          <span className="capitalize">{d.device}</span>
                          <span className="text-muted-foreground tabular-nums">
                            {d.visitors}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
