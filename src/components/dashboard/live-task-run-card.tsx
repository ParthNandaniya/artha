"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/lib/types";
import type { LiveTaskActivity, LiveTaskJobStatus } from "@/hooks/use-live-task-run";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Sparkles,
  XCircle,
} from "lucide-react";
import { ArthaLoader } from "@/components/icons/artha-loader";

interface LiveTaskRunCardProps {
  taskTitle: string;
  taskStatus: TaskStatus | null;
  jobStatus: LiveTaskJobStatus | null;
  statusMessage: string | null;
  error: string | null;
  activities: LiveTaskActivity[];
  pendingForSeconds: number | null;
  runningForSeconds: number | null;
  isStalled: boolean;
  stalledReason: string | null;
  onViewTask?: () => void;
  onDismiss: () => void;
}

type CardState = "queued" | "running" | "review" | "completed" | "failed";

const CARD_STATE_CONFIG: Record<CardState, {
  label: string;
  accent: string;
  badge: string;
  text: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = {
  queued: {
    label: "Queued",
    accent: "from-slate-100 via-slate-50 to-white",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
    text: "text-slate-700",
    Icon: Clock3,
  },
  running: {
    label: "Running",
    accent: "from-amber-50 via-background to-white",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    text: "text-amber-700",
    Icon: Clock3,
  },
  review: {
    label: "Ready for review",
    accent: "from-blue-50 via-background to-white",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    text: "text-blue-700",
    Icon: Sparkles,
  },
  completed: {
    label: "Completed",
    accent: "from-emerald-50 via-background to-white",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    text: "text-emerald-700",
    Icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    accent: "from-red-50 via-background to-white",
    badge: "bg-red-50 text-red-700 border-red-200",
    text: "text-red-700",
    Icon: XCircle,
  },
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function resolveCardState(taskStatus: TaskStatus | null, jobStatus: LiveTaskJobStatus | null): CardState {
  if (taskStatus === "pending_confirmation") return "review";
  if (taskStatus === "failed" || taskStatus === "rejected" || jobStatus === "failed") return "failed";
  if (taskStatus === "completed") return "completed";
  if (taskStatus === "running" || jobStatus === "running") return "running";
  return "queued";
}

function buildRuntimeLabel(
  state: CardState,
  pendingForSeconds: number | null,
  runningForSeconds: number | null
): string | null {
  if (state === "queued" && pendingForSeconds !== null) return `Queued ${formatDuration(pendingForSeconds)}`;
  if (state === "running" && runningForSeconds !== null) return `Running ${formatDuration(runningForSeconds)}`;
  if (state === "review") return "Needs approval";
  if (state === "completed") return "Done";
  if (state === "failed") return "Needs attention";
  return null;
}

export function LiveTaskRunCard({
  taskTitle,
  taskStatus,
  jobStatus,
  statusMessage,
  error,
  activities,
  pendingForSeconds,
  runningForSeconds,
  isStalled,
  stalledReason,
  onViewTask,
  onDismiss,
}: LiveTaskRunCardProps) {
  const state = resolveCardState(taskStatus, jobStatus);
  const config = CARD_STATE_CONFIG[state];
  const runtimeLabel = buildRuntimeLabel(state, pendingForSeconds, runningForSeconds);
  const canDismiss = state === "review" || state === "completed" || state === "failed";
  const Icon = config.Icon;

  return (
    <div className={cn("rounded-2xl border shadow-sm overflow-hidden bg-gradient-to-r transition-all duration-500 animate-[reveal-up_400ms_ease-out_both]", config.accent)}>
      <div className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <span className={cn("h-2 w-2 rounded-full", state === "running" ? "bg-amber-500 animate-pulse" : state === "completed" ? "bg-emerald-500" : state === "failed" ? "bg-red-500" : state === "review" ? "bg-blue-500" : "bg-slate-400")} />
                  Live task activity
                </span>
                <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", config.badge)}>
                  {state === "running" ? (
                    <ArthaLoader size={12} className="text-amber-700" />
                  ) : (
                    <Icon className="h-3 w-3" />
                  )}
                  {config.label}
                </span>
              </div>
              <h3 className="mt-2 text-sm font-semibold text-foreground">{taskTitle}</h3>
            </div>
            {runtimeLabel && (
              <span className="shrink-0 rounded-full bg-background/80 px-2 py-1 text-[11px] font-mono text-muted-foreground">
                {runtimeLabel}
              </span>
            )}
          </div>

          <p className="mt-3 text-sm text-muted-foreground">
            {statusMessage || "AI is processing this task in the background."}
          </p>

          {(isStalled || stalledReason) && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {stalledReason || "This task appears stalled."}
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {onViewTask && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={onViewTask}>
                <ExternalLink className="h-3.5 w-3.5" />
                View task
              </Button>
            )}
            {canDismiss && (
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onDismiss}>
                Dismiss
              </Button>
            )}
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border bg-background/80 backdrop-blur-sm">
          <div className="border-b px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Streamed from backend
            </p>
          </div>
          <div className="max-h-[220px] overflow-y-auto px-4 py-3">
            {activities.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ArthaLoader size={14} className="text-muted-foreground" />
                Waiting for the first task event...
              </div>
            ) : (
              <div className="space-y-3">
                {activities.map((item) => (
                  <div key={item.id} className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                        item.type === "success" && "bg-emerald-500",
                        item.type === "error" && "bg-red-500",
                        item.type === "info" && "bg-slate-400"
                      )}
                    />
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-xs leading-relaxed",
                          item.type === "success" && "text-foreground",
                          item.type === "error" && "text-red-700",
                          item.type === "info" && "text-muted-foreground"
                        )}
                      >
                        {item.message}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground/80">{formatClock(item.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {(state === "review" || state === "failed") && (
            <div className="border-t px-4 py-3">
              <div className={cn("flex items-start gap-2 rounded-xl border px-3 py-2 text-xs", state === "review" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-red-200 bg-red-50 text-red-700")}>
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>
                  {state === "review"
                    ? "This task produced a draft that needs approval before it is sent."
                    : "Open the task for the full error and result details."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
