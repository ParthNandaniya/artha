"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Legend,
} from "recharts";

interface RevenueAnalyticsPanelProps {
  project: Project;
}

interface SubscriptionMetrics {
  mrr: number;
  churnRate: number;
  ltv: number;
  arpu: number;
  subscriberCount: number;
  activeSubscribers: number;
  canceledSubscribers: number;
}

interface MrrDataPoint {
  month: string;
  mrr: number;
  newMrr: number;
  churnedMrr: number;
  netNewMrr: number;
}

interface PlanBreakdown {
  name: string;
  revenue: number;
  subscribers: number;
}

const CHART_COLORS = ["#f97316", "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899"];

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function RevenueAnalyticsPanel({ project }: RevenueAnalyticsPanelProps) {
  const [metrics, setMetrics] = useState<SubscriptionMetrics | null>(null);
  const [mrrHistory, setMrrHistory] = useState<MrrDataPoint[]>([]);
  const [planBreakdown, setPlanBreakdown] = useState<PlanBreakdown[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [metricsRes, mrrRes, plansRes] = await Promise.all([
        fetch(`/api/subscription-analytics?projectId=${project.id}&type=metrics`),
        fetch(`/api/subscription-analytics?projectId=${project.id}&type=mrr_history`),
        fetch(`/api/subscription-analytics?projectId=${project.id}&type=plan_breakdown`),
      ]);

      if (metricsRes.ok) {
        const data = await metricsRes.json();
        setMetrics(data);
      }
      if (mrrRes.ok) {
        const data = await mrrRes.json();
        setMrrHistory(data.history || []);
      }
      if (plansRes.ok) {
        const data = await plansRes.json();
        setPlanBreakdown(data.plans || []);
      }
    } catch (error) {
      console.error("Failed to fetch revenue analytics:", error);
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-6 w-6 border-2 border-orange-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="text-center py-12 text-neutral-500">
        No subscription data available yet.
      </div>
    );
  }

  const mrrTrend =
    mrrHistory.length >= 2
      ? mrrHistory[mrrHistory.length - 1].mrr - mrrHistory[mrrHistory.length - 2].mrr
      : 0;

  const chartData = mrrHistory.map((d) => ({
    ...d,
    mrrDollars: d.mrr / 100,
  }));

  const pieData = planBreakdown.map((p) => ({
    name: p.name,
    value: p.revenue / 100,
    subscribers: p.subscribers,
  }));

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">MRR</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{formatCents(metrics.mrr)}</span>
              {mrrTrend !== 0 && (
                <Badge variant={mrrTrend > 0 ? "default" : "destructive"} className="text-xs">
                  {mrrTrend > 0 ? "+" : ""}{formatCents(mrrTrend)}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">Churn Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{metrics.churnRate}%</span>
              <Badge
                variant={metrics.churnRate <= 5 ? "default" : metrics.churnRate <= 10 ? "secondary" : "destructive"}
                className="text-xs"
              >
                {metrics.churnRate <= 5 ? "healthy" : metrics.churnRate <= 10 ? "moderate" : "high"}
              </Badge>
            </div>
            <div className="mt-2 h-2 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(metrics.churnRate, 100)}%`,
                  backgroundColor:
                    metrics.churnRate <= 5
                      ? "#10b981"
                      : metrics.churnRate <= 10
                        ? "#f59e0b"
                        : "#ef4444",
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">LTV</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">{formatCents(metrics.ltv)}</span>
            <p className="text-xs text-neutral-400 mt-1">per subscriber</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-500">ARPU</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">{formatCents(metrics.arpu)}</span>
            <p className="text-xs text-neutral-400 mt-1">
              {metrics.activeSubscribers} active / {metrics.subscriberCount} total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* MRR History Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">MRR Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, "MRR"]}
                    labelFormatter={(label) => `Month: ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="mrrDollars"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={{ fill: "#f97316", r: 3 }}
                    name="MRR"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Revenue by Plan */}
      {pieData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Revenue by Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, value }) => `${name}: $${value.toFixed(0)}`}
                  >
                    {pieData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
