"use client";

import type { LiveDashboardMetrics } from "@/hooks/use-live-dashboard";
import { AnimatedNumber } from "@/components/ui/animated-number";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

interface LiveMetricsProps {
  metrics: LiveDashboardMetrics;
}

const stats = [
  { key: "activeCompanies", label: "Active Companies", format: formatNumber },
  { key: "tasksCompleted", label: "Tasks (30d)", format: formatNumber },
  { key: "emailsSent", label: "Emails Sent (30d)", format: formatNumber },
] as const;

export function LiveMetrics({ metrics }: LiveMetricsProps) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Artha</h2>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-px bg-border">
        {stats.map(({ key, label, format }) => (
          <div key={key} className="bg-card px-4 py-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-xl font-bold text-foreground mt-0.5">
              <AnimatedNumber
                value={metrics[key] as number}
                duration={800}
                formatter={format}
              />
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
