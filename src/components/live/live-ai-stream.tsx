"use client";

import { useEffect, useRef } from "react";
import type { LiveAiActivity } from "@/hooks/use-live-dashboard";
import { LiveSectionHeader } from "./live-section-header";

function getStepCategory(step: string): "research" | "building" | "email" | "other" {
  if (step.includes("research") || step.includes("profile") || step.includes("idea")) return "research";
  if (step.includes("landing") || step.includes("website") || step.includes("cloudflare") || step.includes("github") || step.includes("push") || step.includes("init") || step.includes("name") || step.includes("create")) return "building";
  if (step.includes("email") || step.includes("welcome") || step.includes("tweet")) return "email";
  return "other";
}

const categoryStyles = {
  research: "bg-blue-50 border-blue-100 text-blue-900",
  building: "bg-amber-50 border-amber-100 text-amber-900",
  email: "bg-emerald-50 border-emerald-100 text-emerald-900",
  other: "bg-neutral-50 border-neutral-200 text-neutral-900",
};

const categoryDots = {
  research: "bg-blue-400",
  building: "bg-amber-400",
  email: "bg-emerald-400",
  other: "bg-neutral-400",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatStep(step: string): string {
  return step.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface LiveAiStreamProps {
  activities: LiveAiActivity[];
  isFetching?: boolean;
}

export function LiveAiStream({ activities, isFetching }: LiveAiStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activities]);

  const displayActivities = [...activities].reverse();

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
      <LiveSectionHeader
        title="AI Activity"
        isFetching={isFetching}
        right={<span className="text-xs text-muted-foreground">Recent</span>}
      />

      <div ref={scrollRef} className="overflow-y-auto max-h-[400px] p-3 space-y-2">
        {displayActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center mb-3">
              <div className="w-3 h-3 rounded-full bg-neutral-300 animate-pulse" />
            </div>
            <p className="text-sm text-muted-foreground">Waiting for AI activity...</p>
          </div>
        ) : (
          displayActivities.map((activity) => {
            const category = getStepCategory(activity.step);
            return (
              <div
                key={activity.id}
                className={`rounded-lg border px-3 py-2.5 animate-[fadeInUp_0.3s_ease-out] ${categoryStyles[category]}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${categoryDots[category]}`} />
                    <span className="text-xs font-medium truncate">
                      {activity.projectName}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {timeAgo(activity.createdAt)}
                  </span>
                </div>
                <p className="text-xs mt-1 ml-3.5 opacity-80">
                  <span className="font-medium">{formatStep(activity.step)}</span>
                  {activity.logMessage && ` — ${activity.logMessage}`}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
