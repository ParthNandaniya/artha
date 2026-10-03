"use client";

import { useEffect, useState } from "react";
import type { LiveRunningTask, LiveCompletedTask } from "@/hooks/use-live-dashboard";
import { LiveSectionHeader } from "./live-section-header";

function formatElapsed(startedAt: string | null): string {
  if (!startedAt) return "starting...";
  const diff = Date.now() - new Date(startedAt).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatTaskType(type: string | null): string {
  if (!type) return "task";
  return type.replace(/_/g, " ");
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

interface LiveRunningTasksProps {
  tasks: LiveRunningTask[];
  completedTasks: LiveCompletedTask[];
  totalTasks: number;
  isFetching?: boolean;
}

export function LiveRunningTasks({ tasks, completedTasks, totalTasks, isFetching }: LiveRunningTasksProps) {
  const [, setTick] = useState(0);

  // Tick every second for live elapsed time (like the AI chat timer)
  useEffect(() => {
    if (tasks.length === 0) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [tasks.length]);

  const hasRunning = tasks.length > 0;

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <LiveSectionHeader
        title="Tasks"
        isFetching={isFetching}
        right={
          hasRunning ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </span>
              {tasks.length} running
            </span>
          ) : totalTasks > 0 ? (
            <span className="text-xs text-muted-foreground">
              {formatNumber(totalTasks)} total
            </span>
          ) : null
        }
      />

      <div className="divide-y divide-border">
        {hasRunning ? (
          tasks.slice(0, 6).map((task) => (
            <div key={task.id} className="px-4 py-2.5 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground truncate">
                    {task.projectName}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {formatTaskType(task.type)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-xs text-muted-foreground font-mono tabular-nums">
                  {formatElapsed(task.startedAt)}
                </span>
              </div>
            </div>
          ))
        ) : completedTasks.length > 0 ? (
          completedTasks.slice(0, 6).map((task) => (
            <div key={task.id} className="px-4 py-2.5 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground truncate">
                    {task.projectName}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {formatTaskType(task.type)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-xs text-muted-foreground">
                  {timeAgo(task.completedAt)}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">No tasks yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
