"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Project } from "@/lib/types";
import type { DeliverabilityMetrics, DomainHealth } from "@/lib/email-deliverability";
import type { WarmupState } from "@/lib/email-warmup";
import type { AbTest } from "@/lib/email-ab-testing";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface EmailDeliverabilityPanelProps {
  project: Project;
}

interface DeliverabilityData {
  metrics: DeliverabilityMetrics;
  warmup: WarmupState | null;
  domainHealth: DomainHealth;
  abTests: AbTest[];
}

const GAUGE_COLORS = {
  good: "#22c55e",
  warning: "#f59e0b",
  bad: "#ef4444",
};

function getGaugeColor(rate: number): string {
  if (rate >= 90) return GAUGE_COLORS.good;
  if (rate >= 70) return GAUGE_COLORS.warning;
  return GAUGE_COLORS.bad;
}

function healthBadgeVariant(status: "pass" | "fail" | "unknown") {
  if (status === "pass") return "default" as const;
  if (status === "fail") return "destructive" as const;
  return "secondary" as const;
}

export function EmailDeliverabilityPanel({ project }: EmailDeliverabilityPanelProps) {
  const [data, setData] = useState<DeliverabilityData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/projects/email/deliverability?projectId=${project.id}`
      );
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
    } finally {
      setIsLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleWarmupAction(action: string) {
    setActionLoading(true);
    try {
      await fetch("/api/projects/email/deliverability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, action }),
      });
      await fetchData();
    } finally {
      setActionLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-neutral-500">
          Unable to load deliverability data.
        </CardContent>
      </Card>
    );
  }

  const { metrics, warmup, domainHealth, abTests } = data;

  const pieData = [
    { name: "Delivered", value: metrics.delivered, color: "#22c55e" },
    { name: "Bounced", value: metrics.bounced, color: "#ef4444" },
    { name: "Spam", value: metrics.spam, color: "#f59e0b" },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-4">
      {/* Inbox Placement Rate */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Inbox Placement Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="flex-shrink-0">
              <div
                className="flex h-24 w-24 items-center justify-center rounded-full border-4"
                style={{ borderColor: getGaugeColor(metrics.inbox_rate) }}
              >
                <span className="text-2xl font-bold">{metrics.inbox_rate}%</span>
              </div>
            </div>
            <div className="grid flex-1 grid-cols-2 gap-3 text-sm">
              <MetricItem label="Sent" value={metrics.sent} />
              <MetricItem label="Delivered" value={metrics.delivered} />
              <MetricItem
                label="Bounce Rate"
                value={`${metrics.bounce_rate}%`}
                warn={metrics.bounce_rate > 5}
              />
              <MetricItem
                label="Spam Rate"
                value={`${metrics.spam_rate}%`}
                warn={metrics.spam_rate > 1}
              />
              <MetricItem label="Open Rate" value={`${metrics.open_rate}%`} />
              <MetricItem label="Click Rate" value={`${metrics.click_rate}%`} />
            </div>
          </div>
          {pieData.length > 0 && (
            <div className="mt-4 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={55}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 text-xs text-neutral-500">
                {pieData.map((d) => (
                  <span key={d.name} className="flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: d.color }}
                    />
                    {d.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Domain Health */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Domain Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Badge variant={domainHealth.overall === "healthy" ? "default" : "destructive"}>
              {domainHealth.overall}
            </Badge>
          </div>
          <div className="mt-3 flex gap-4 text-sm">
            <span className="flex items-center gap-1">
              SPF: <Badge variant={healthBadgeVariant(domainHealth.spf)}>{domainHealth.spf}</Badge>
            </span>
            <span className="flex items-center gap-1">
              DKIM: <Badge variant={healthBadgeVariant(domainHealth.dkim)}>{domainHealth.dkim}</Badge>
            </span>
            <span className="flex items-center gap-1">
              DMARC: <Badge variant={healthBadgeVariant(domainHealth.dmarc)}>{domainHealth.dmarc}</Badge>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Warmup Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Email Warmup</CardTitle>
        </CardHeader>
        <CardContent>
          {!warmup ? (
            <div className="space-y-2">
              <p className="text-sm text-neutral-500">
                Warmup has not been started. Start the warmup process to gradually increase your sending volume.
              </p>
              <Button
                size="sm"
                onClick={() => handleWarmupAction("start-warmup")}
                disabled={actionLoading}
              >
                Start Warmup
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>
                  Day {warmup.warmup_day} of 21
                  {warmup.status === "completed" && " (Complete)"}
                </span>
                <Badge
                  variant={
                    warmup.status === "active"
                      ? "default"
                      : warmup.status === "completed"
                      ? "secondary"
                      : "outline"
                  }
                >
                  {warmup.status}
                </Badge>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
                <div
                  className="h-full rounded-full bg-green-500 transition-all"
                  style={{
                    width: `${Math.min((warmup.warmup_day / 21) * 100, 100)}%`,
                  }}
                />
              </div>
              <p className="text-xs text-neutral-500">
                Current daily volume: {warmup.daily_volume} emails/day
              </p>
              <div className="flex gap-2">
                {warmup.status === "active" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleWarmupAction("pause-warmup")}
                    disabled={actionLoading}
                  >
                    Pause
                  </Button>
                )}
                {warmup.status === "paused" && (
                  <Button
                    size="sm"
                    onClick={() => handleWarmupAction("resume-warmup")}
                    disabled={actionLoading}
                  >
                    Resume
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* A/B Test Results */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">A/B Tests</CardTitle>
        </CardHeader>
        <CardContent>
          {abTests.length === 0 ? (
            <p className="text-sm text-neutral-500">No A/B tests yet.</p>
          ) : (
            <div className="space-y-3">
              {abTests.slice(0, 5).map((test) => (
                <div
                  key={test.id}
                  className="flex items-center justify-between rounded-lg border p-3 text-sm"
                >
                  <div>
                    <p className="font-medium capitalize">{test.test_type} test</p>
                    <p className="text-xs text-neutral-500">
                      A: {truncate(test.variant_a, 30)} | B: {truncate(test.variant_b, 30)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        test.status === "completed" ? "default" : "secondary"
                      }
                    >
                      {test.status}
                    </Badge>
                    {test.winner && (
                      <Badge variant="outline">
                        Winner: {test.winner.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

function MetricItem({
  label,
  value,
  warn,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`font-medium ${warn ? "text-red-500" : ""}`}>{value}</p>
    </div>
  );
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + "...";
}
