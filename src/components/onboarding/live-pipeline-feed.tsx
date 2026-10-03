"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ArthaLoader } from "@/components/icons/artha-loader";
import type { PipelineStep } from "@/lib/types";
import type { PipelineJobStatus } from "@/hooks/use-pipeline";

interface LivePipelineFeedProps {
  steps: PipelineStep[];
  isRunning: boolean;
  companyName?: string;
  jobStatus?: PipelineJobStatus | null;
  statusMessage?: string | null;
  stepStartTimes?: Record<string, number>;
}

const SLOW_STEP_MESSAGES = [
  "This step involves deep AI analysis — hold tight...",
  "Still working on it, this one takes a bit longer...",
  "Almost there — wrapping up the heavy lifting...",
];

function getSlowStepMessage(stepId: string, elapsedSec: number): string | null {
  if (elapsedSec < 30) return null;
  if (elapsedSec < 60) return SLOW_STEP_MESSAGES[0];
  if (elapsedSec < 120) return SLOW_STEP_MESSAGES[1];
  return SLOW_STEP_MESSAGES[2];
}

export function LivePipelineFeed({ steps, isRunning, companyName, jobStatus, statusMessage, stepStartTimes = {} }: LivePipelineFeedProps) {
  const [now, setNow] = useState(Date.now());

  // Tick every 5s to update slow-step messages
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, [isRunning]);

  if (!isRunning && steps.every((s) => s.status === "pending")) return null;

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const totalSteps = steps.length;
  const activeStep = steps.find((s) => s.status === "running");
  const failedStep = steps.find((s) => s.status === "failed");
  const currentStep = activeStep || failedStep;
  const hasStartedSteps = steps.some((s) => s.status !== "pending");
  const allDone = !isRunning && completedCount === totalSteps;

  const stepStarted = currentStep ? stepStartTimes[currentStep.id] : undefined;
  const elapsedSec = stepStarted ? Math.floor((now - stepStarted) / 1000) : 0;
  const slowMessage = activeStep ? getSlowStepMessage(activeStep.id, elapsedSec) : null;

  // Next upcoming step (first pending)
  const nextStep = steps.find((s) => s.status === "pending");

  // Last completed step — shown during the gap between steps
  const lastCompletedStep = hasStartedSteps && !activeStep && !failedStep && !allDone && isRunning
    ? [...steps].reverse().find((s) => s.status === "completed")
    : null;

  return (
    <div className="w-full bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-foreground">
            {allDone ? "Company built" : "Building your company..."}
          </h2>
          <span className="text-xs text-muted-foreground font-mono">
            {completedCount}/{totalSteps}
          </span>
        </div>
        {companyName && (
          <p className="text-xs text-muted-foreground">{companyName}</p>
        )}
        {/* Progress bar */}
        <div className="mt-3 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
            style={{ width: `${(completedCount / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Compact current step */}
      <div className="px-5 py-4">
        {/* Queuing state */}
        {jobStatus === "pending" && !hasStartedSteps && (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3">
            <div className="flex items-center gap-2">
              <ArthaLoader size={14} className="text-primary shrink-0" />
              <span className="text-xs font-medium text-foreground">Queueing pipeline</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {statusMessage || "Waiting for worker claim..."}
            </p>
          </div>
        )}

        {/* Active step */}
        {activeStep && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full border-2 border-emerald-500 flex items-center justify-center shrink-0">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <span className="text-sm font-medium text-foreground">{activeStep.label}</span>
              <ArthaLoader size={16} className="text-primary shrink-0 ml-auto" />
            </div>
            {/* Active step logs */}
            {activeStep.logs.length > 0 && (
              <div className="ml-9 space-y-0.5">
                {activeStep.logs.map((entry, j) => (
                  <div
                    key={j}
                    className={cn(
                      "text-xs leading-relaxed flex items-start gap-1.5 animate-[fadeInUp_0.3s_ease-out_both]",
                      entry.type === "success" && "text-primary",
                      entry.type === "error" && "text-destructive",
                      entry.type === "info" && "text-muted-foreground",
                    )}
                  >
                    <span className="shrink-0 mt-0.5">
                      {entry.type === "success" ? "\u2713" : entry.type === "error" ? "\u2717" : "\u203A"}
                    </span>
                    <span>{entry.message}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Slow step message */}
            {slowMessage && (
              <div className="ml-9 text-xs leading-relaxed flex items-start gap-1.5 text-muted-foreground animate-pulse">
                <span className="shrink-0 mt-0.5">{"\u203A"}</span>
                <span>{slowMessage}</span>
              </div>
            )}
          </div>
        )}

        {/* Transition between steps — show last completed + next starting */}
        {lastCompletedStep && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-sm font-medium text-muted-foreground line-through decoration-muted-foreground/40">{lastCompletedStep.label}</span>
            </div>
            {nextStep && (
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full border-2 border-emerald-500 flex items-center justify-center shrink-0">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <span className="text-sm font-medium text-foreground">Starting {nextStep.label.toLowerCase()}...</span>
                <ArthaLoader size={16} className="text-primary shrink-0 ml-auto" />
              </div>
            )}
          </div>
        )}

        {/* Failed step */}
        {failedStep && !activeStep && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-destructive flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <span className="text-sm font-medium text-destructive">{failedStep.label}</span>
            </div>
            {failedStep.logs.length > 0 && (
              <div className="ml-9 space-y-0.5">
                {failedStep.logs.map((entry, j) => (
                  <div
                    key={j}
                    className={cn(
                      "text-xs leading-relaxed flex items-start gap-1.5",
                      entry.type === "success" && "text-primary",
                      entry.type === "error" && "text-destructive",
                      entry.type === "info" && "text-muted-foreground",
                    )}
                  >
                    <span className="shrink-0 mt-0.5">
                      {entry.type === "success" ? "\u2713" : entry.type === "error" ? "\u2717" : "\u203A"}
                    </span>
                    <span>{entry.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* All done */}
        {allDone && (
          <div className="flex items-center gap-3 animate-[reveal-up_400ms_ease-out_both]">
            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0 animate-[reveal-scale_300ms_ease-out_both]">
              <svg className="w-3.5 h-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-sm font-medium text-primary">All phases complete — redirecting to dashboard...</span>
          </div>
        )}

        {/* Up next hint */}
        {nextStep && activeStep && !lastCompletedStep && (
          <div className="mt-3 pt-3 border-t border-border">
            <span className="text-[11px] text-muted-foreground">
              Up next: {nextStep.label}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
