"use client";

import { cn } from "@/lib/utils";
import { ArthaLoader } from "@/components/icons/artha-loader";
import type { PipelineStep } from "@/lib/types";

interface PipelineProgressProps {
  steps: PipelineStep[];
  isRunning: boolean;
}

export function PipelineProgress({ steps, isRunning }: PipelineProgressProps) {
  if (!isRunning && steps.every((s) => s.status === "pending")) return null;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold mb-4">Building your company...</h2>
      <div className="space-y-3">
        {steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border transition-all",
              step.status === "completed" && "bg-primary/5 border-primary/20",
              step.status === "running" && "bg-muted border-primary/40",
              step.status === "failed" && "bg-destructive/5 border-destructive/20",
              step.status === "pending" && "opacity-50"
            )}
          >
            <div className="w-6 h-6 shrink-0 flex items-center justify-center">
              {step.status === "running" && (
                <ArthaLoader size={20} className="text-primary" />
              )}
              {step.status === "completed" && (
                <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {step.status === "failed" && (
                <svg className="w-5 h-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {step.status === "pending" && (
                <div className="w-4 h-4 border-2 border-muted-foreground/30 rounded-full" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{step.label}</p>
              {step.output && step.status === "completed" && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {(() => {
                    try {
                      const data = JSON.parse(step.output);
                      if (data.url) return `Live at ${data.url}`;
                      if (data.email) return `Email: ${data.email}`;
                      if (data.documentId) return "Document created";
                      if (data.tasksCreated) return `${data.tasksCreated} tasks queued`;
                      if (data.slug) return `Project: ${data.slug}`;
                      return "Done";
                    } catch {
                      return step.output;
                    }
                  })()}
                </p>
              )}
              {step.status === "failed" && step.output && (
                <p className="text-xs text-destructive truncate mt-0.5">
                  {step.output}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
