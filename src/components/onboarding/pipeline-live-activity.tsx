"use client";

import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  PipelineActivity,
  PipelineJobStatus,
  PipelineQueueReason,
  PipelineRecoveryAction,
} from "@/hooks/use-pipeline";

interface PipelineLiveActivityProps {
  statusMessage: string | null;
  error: string | null;
  jobStatus: PipelineJobStatus | null;
  queueReason: PipelineQueueReason;
  pendingForSeconds: number | null;
  runningForSeconds: number | null;
  isStalled: boolean;
  stalledReason: string | null;
  activities: PipelineActivity[];
  recoveryAction: PipelineRecoveryAction | null;
  onRunNow: () => Promise<void>;
  onRetry: () => Promise<void>;
  onRefresh: () => Promise<void>;
}

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

function buildRuntimeLabel(
  jobStatus: PipelineJobStatus | null,
  pendingForSeconds: number | null,
  runningForSeconds: number | null
): string | null {
  if (jobStatus === "pending" && pendingForSeconds !== null) {
    return `Pending ${formatDuration(pendingForSeconds)}`;
  }
  if (jobStatus === "running" && runningForSeconds !== null) {
    return `Running ${formatDuration(runningForSeconds)}`;
  }
  if (jobStatus === "completed") return "Completed";
  if (jobStatus === "failed") return "Failed";
  return null;
}

function queueHint(queueReason: PipelineQueueReason): string | null {
  if (queueReason === "waiting_for_user_slot") return "Another one of your jobs is currently running.";
  if (queueReason === "waiting_for_worker_slot") return "Workers are at capacity. This job starts once a slot opens.";
  if (queueReason === "claiming") return "A worker is attempting to claim this job.";
  if (queueReason === "worker_unavailable") return "No worker has claimed this job yet.";
  return null;
}

export function PipelineLiveActivity({
  statusMessage,
  error,
  jobStatus,
  queueReason,
  pendingForSeconds,
  runningForSeconds,
  isStalled,
  stalledReason,
  activities,
  recoveryAction,
  onRunNow,
  onRetry,
  onRefresh,
}: PipelineLiveActivityProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [activities.length]);

  const runtimeLabel = useMemo(
    () => buildRuntimeLabel(jobStatus, pendingForSeconds, runningForSeconds),
    [jobStatus, pendingForSeconds, runningForSeconds]
  );
  const currentHint = useMemo(() => queueHint(queueReason), [queueReason]);

  const busy = recoveryAction !== null;
  const canRunNow = jobStatus === "pending" && queueReason !== "waiting_for_user_slot";
  const canRetry = jobStatus === "pending" || jobStatus === "failed";

  return (
    <div className="w-full max-w-xl bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                jobStatus === "completed" ? "bg-emerald-500" : "bg-emerald-500 animate-pulse"
              )}
            />
            <h3 className="text-sm font-semibold text-foreground">Live AI Activity</h3>
          </div>
          {runtimeLabel && <span className="text-xs text-muted-foreground font-mono">{runtimeLabel}</span>}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {statusMessage || "Waiting for the first onboarding event..."}
        </p>
        {currentHint && (
          <p className="mt-1 text-xs text-muted-foreground">{currentHint}</p>
        )}
        {(isStalled || stalledReason) && (
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
            {stalledReason || "This job appears stalled. Use a recovery action below."}
          </p>
        )}
        {error && (
          <p className="mt-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-2 py-1">
            {error}
          </p>
        )}
      </div>

      <div ref={listRef} className="max-h-[480px] overflow-y-auto px-5 py-4 space-y-2 bg-muted/20">
        {activities.length === 0 && (
          <div className="text-xs text-muted-foreground">
            Logs from the pipeline will stream here live.
          </div>
        )}
        {activities.map((item) => (
          <div key={item.id} className="flex items-start gap-2">
            <span
              className={cn(
                "mt-1.5 w-1.5 h-1.5 rounded-full shrink-0",
                item.type === "success" && "bg-primary",
                item.type === "error" && "bg-destructive",
                item.type === "info" && "bg-muted-foreground/70"
              )}
            />
            <div className="min-w-0">
              <p
                className={cn(
                  "text-xs leading-relaxed",
                  item.type === "error" && "text-destructive",
                  item.type === "success" && "text-foreground",
                  item.type === "info" && "text-muted-foreground"
                )}
              >
                {item.message}
              </p>
              <p className="text-[10px] text-muted-foreground/90 mt-0.5">{formatClock(item.timestamp)}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 py-3 border-t border-border flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={busy}>
          Refresh status
        </Button>
        <Button
          size="sm"
          variant={isStalled ? "default" : "outline"}
          onClick={onRunNow}
          disabled={!canRunNow || busy}
        >
          {recoveryAction === "run_now" ? "Running now..." : "Run Manually"}
        </Button>
        <Button size="sm" variant="outline" onClick={onRetry} disabled={!canRetry || busy}>
          {recoveryAction === "retry" ? "Retrying..." : "Retry Job"}
        </Button>
      </div>
    </div>
  );
}
