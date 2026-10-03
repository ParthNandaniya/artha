"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { PipelineStep, PipelineLog } from "@/lib/types";

const PIPELINE_STEPS: PipelineStep[] = [
  { id: "user_research", label: "Researching you as a founder", status: "pending", logs: [] },
  { id: "research_idea", label: "Researching your idea", status: "pending", logs: [] },
  { id: "save_profile", label: "Saving your profile", status: "pending", logs: [] },
  { id: "name_company", label: "Naming the company", status: "pending", logs: [] },
  { id: "create_project", label: "Creating project", status: "pending", logs: [] },
  { id: "provision_db", label: "Provisioning database", status: "pending", logs: [] },
  { id: "init_schema", label: "Initializing company", status: "pending", logs: [] },
  { id: "mission", label: "Generating mission", status: "pending", logs: [] },
  { id: "market_research", label: "Market research", status: "pending", logs: [] },
  { id: "landing_page", label: "Building landing page", status: "pending", logs: [] },
  { id: "tweet_launch", label: "Posting launch tweet", status: "pending", logs: [] },
  { id: "email_setup", label: "Setting up email", status: "pending", logs: [] },
  { id: "github_repo", label: "Creating repository", status: "pending", logs: [] },
  { id: "push_website", label: "Deploying to repo", status: "pending", logs: [] },
  { id: "cloudflare_setup", label: "Connecting Cloudflare", status: "pending", logs: [] },
  { id: "task_queue", label: "Generating task queue", status: "pending", logs: [] },
  { id: "welcome_email", label: "Sending welcome email", status: "pending", logs: [] },
];

const POLL_RUNNING_MS = 2000;
const POLL_PENDING_HEAD_MS = 3000;
const POLL_PENDING_QUEUE_MS = 6000;
const POLL_RETRY_MS = 5000;
const PENDING_WARNING_SECONDS = 45;
const SLOW_RUNNING_WARNING_SECONDS = 180;

export type PipelineJobStatus = "pending" | "running" | "completed" | "failed";
export type PipelineQueueReason =
  | "waiting_for_user_slot"
  | "waiting_for_worker_slot"
  | "claiming"
  | "worker_unavailable"
  | null;
export type PipelineRecoveryAction = "retry" | "run_now";

export interface PipelineActivity {
  id: string;
  timestamp: number;
  message: string;
  type: "info" | "success" | "error";
  source: "system" | "pipeline";
  stepId?: string;
}

type PipelineStatusResponse = {
  job: {
    id: string;
    status: PipelineJobStatus;
    error: string | null;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    pendingForSeconds: number | null;
    runningForSeconds: number | null;
  };
  queue: {
    position: number | null;
    pendingAhead: number | null;
    runningCount: number;
    runningForUser: number;
    workerConcurrency: number;
    reason: PipelineQueueReason;
    isStalled: boolean;
    stalledReason: string | null;
  };
  cursor: {
    id: string;
    createdAt: string;
  } | null;
  events: Array<{
    id: string;
    step: string;
    status: string;
    log_message?: string | null;
    log_type?: string | null;
    data?: Record<string, unknown> | null;
    created_at: string;
  }>;
};

type PipelineRecoverResponse = {
  jobId?: string;
  status?: PipelineJobStatus;
  message?: string;
  error?: string;
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function normalizeLogType(value: string | null | undefined): "info" | "success" | "error" {
  if (value === "success" || value === "error") return value;
  return "info";
}

function buildPendingStatusMessage(
  queue: PipelineStatusResponse["queue"],
  pendingForSeconds: number
): string {
  if ((queue.position ?? 1) > 1) {
    return `You already started another request. This one is pending as request #${queue.position} for your account.`;
  }

  if (queue.reason === "waiting_for_user_slot") {
    return "You already have another job running. This one will start as soon as that finishes.";
  }

  if (queue.reason === "waiting_for_worker_slot") {
    if (pendingForSeconds >= PENDING_WARNING_SECONDS) {
      return "Waiting for a worker slot to open. Idea research will start immediately once one is free.";
    }
    return "Preparing a worker slot for your build. Starting now...";
  }

  if (queue.reason === "worker_unavailable") {
    return `No worker claimed this job for ${formatDuration(pendingForSeconds)}. Use Run Manually or Retry Job below.`;
  }

  if (queue.reason === "claiming") {
    return "Worker is claiming your job now. Starting idea research...";
  }

  if (queue.isStalled) {
    return "This request is taking longer than expected. Use Run Manually or Retry Job to continue onboarding.";
  }

  if (pendingForSeconds >= PENDING_WARNING_SECONDS) {
    return "Getting your company build ready. If this stays here in local dev, start the worker with `npm run worker`.";
  }

  return "Preparing your company build: loading AI research, website builder, and setup tasks.";
}

function getNextPollMs(status: PipelineJobStatus, queue: PipelineStatusResponse["queue"]): number {
  if (status === "running") return POLL_RUNNING_MS;
  if (status !== "pending") return 0;
  if (queue.reason === "worker_unavailable") return POLL_PENDING_QUEUE_MS;
  if ((queue.position ?? 1) > 1) return POLL_PENDING_QUEUE_MS;
  return POLL_PENDING_HEAD_MS;
}

export function usePipeline() {
  const [steps, setSteps] = useState<PipelineStep[]>(PIPELINE_STEPS);
  const [isRunning, setIsRunning] = useState(false);
  const [projectSlug, setProjectSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<PipelineJobStatus | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [queueReason, setQueueReason] = useState<PipelineQueueReason>(null);
  const [pendingForSeconds, setPendingForSeconds] = useState<number | null>(null);
  const [runningForSeconds, setRunningForSeconds] = useState<number | null>(null);
  const [isStalled, setIsStalled] = useState(false);
  const [stalledReason, setStalledReason] = useState<string | null>(null);
  const [activities, setActivities] = useState<PipelineActivity[]>([]);
  const [recoveryAction, setRecoveryAction] = useState<PipelineRecoveryAction | null>(null);

  const [stepStartTimes, setStepStartTimes] = useState<Record<string, number>>({});

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollFnRef = useRef<(nextJobId: string) => Promise<void>>(async () => {});
  const eventCursorRef = useRef<{ id: string; createdAt: string } | null>(null);
  const lastStatusMessageRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const schedulePoll = useCallback((nextJobId: string, delayMs: number) => {
    if (delayMs <= 0) return;
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = setTimeout(() => {
      void pollFnRef.current(nextJobId);
    }, delayMs);
  }, []);

  const appendActivities = useCallback((newItems: PipelineActivity[]) => {
    if (newItems.length === 0) return;
    setActivities((prev) => {
      const next = [...prev];
      const seenIds = new Set(next.map((item) => item.id));
      const seenMessages = new Set(
        next.filter((item) => item.source === "pipeline").map((item) => `${item.stepId}:${item.message}`)
      );
      for (const item of newItems) {
        if (seenIds.has(item.id)) continue;
        if (item.source === "pipeline" && seenMessages.has(`${item.stepId}:${item.message}`)) continue;
        next.push(item);
        seenIds.add(item.id);
        if (item.source === "pipeline") seenMessages.add(`${item.stepId}:${item.message}`);
      }
      if (next.length > 250) return next.slice(next.length - 250);
      return next;
    });
  }, []);

  const setStatusWithActivity = useCallback(
    (message: string, type: PipelineActivity["type"] = "info") => {
      setStatusMessage(message);
      if (lastStatusMessageRef.current === message) return;
      lastStatusMessageRef.current = message;
      appendActivities([
        {
          id: `status-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          message,
          type,
          source: "system",
        },
      ]);
    },
    [appendActivities]
  );

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  const pollStatus = useCallback(
    async (nextJobId: string) => {
      try {
        const params = new URLSearchParams({ jobId: nextJobId });
        if (eventCursorRef.current) {
          params.set("afterCreatedAt", eventCursorRef.current.createdAt);
          params.set("afterId", eventCursorRef.current.id);
        }

        const res = await fetch(`/api/ai/pipeline-status?${params.toString()}`);
        if (!res.ok) {
          stopPolling();
          setIsRunning(false);
          setError(`Failed to fetch pipeline status (${res.status})`);
          setStatusWithActivity("Could not read pipeline progress.", "error");
          return;
        }

        const data = (await res.json()) as PipelineStatusResponse;
        const events = data.events || [];
        setJobId(data.job.id);
        setJobStatus(data.job.status);
        setQueueReason(data.queue.reason);
        setPendingForSeconds(data.job.pendingForSeconds);
        setRunningForSeconds(data.job.runningForSeconds);
        setIsStalled(Boolean(data.queue.isStalled));
        setStalledReason(data.queue.stalledReason || null);

        if (data.cursor?.id && data.cursor?.createdAt) {
          eventCursorRef.current = { id: data.cursor.id, createdAt: data.cursor.createdAt };
        }

        if (data.job.status === "pending") {
          const pending = data.job.pendingForSeconds ?? 0;
          const pendingMsg = buildPendingStatusMessage(data.queue, pending);
          // For worker_unavailable, duration changes each poll — only update header, log once
          if (data.queue.reason === "worker_unavailable") {
            setStatusMessage(pendingMsg);
            if (!lastStatusMessageRef.current?.startsWith("No worker claimed")) {
              lastStatusMessageRef.current = "No worker claimed";
              appendActivities([{
                id: `status-no-worker-${Date.now()}`,
                timestamp: Date.now(),
                message: "No worker has claimed this job yet. Use Run Manually or Retry Job below.",
                type: "info",
                source: "system",
              }]);
            }
          } else {
            setStatusWithActivity(pendingMsg);
          }
        } else if (data.job.status === "running") {
          const running = data.job.runningForSeconds ?? 0;
          if (running >= SLOW_RUNNING_WARNING_SECONDS) {
            // Only update the header text (with live duration) — don't spam the activity log
            setStatusMessage(`Still processing (${formatDuration(running)}). Some setup steps can take a few minutes.`);
            // Add one activity entry when we first cross the threshold
            if (!lastStatusMessageRef.current?.startsWith("Still processing")) {
              lastStatusMessageRef.current = "Still processing";
              appendActivities([{
                id: `status-slow-${Date.now()}`,
                timestamp: Date.now(),
                message: "This step is taking longer than usual — still working on it...",
                type: "info",
                source: "system",
              }]);
            }
          } else {
            setStatusWithActivity("Backend is processing your company setup...");
          }
        } else if (data.job.status === "completed") {
          setStatusWithActivity("Pipeline complete. Redirecting...", "success");
        } else if (data.job.status === "failed") {
          setStatusWithActivity(data.job.error || "Pipeline failed.", "error");
        }

        if (events.length > 0) {
          appendActivities(
            events
              .filter((event) => typeof event.log_message === "string" && event.log_message.trim().length > 0)
              .map((event) => ({
                id: `event-${event.id}`,
                timestamp: new Date(event.created_at).getTime(),
                message: event.log_message as string,
                type: normalizeLogType(event.log_type),
                source: "pipeline" as const,
                stepId: event.step,
              }))
          );

          setSteps((prev) => {
            const updated = [...prev];
            for (const event of events) {
              const stepId = event.step;
              if (stepId === "done") {
                if (event.data?.slug && typeof event.data.slug === "string") setProjectSlug(event.data.slug);
                continue;
              }

              const stepIndex = updated.findIndex((s) => s.id === stepId);
              if (stepIndex === -1) continue;

              const step = { ...updated[stepIndex] };

              if (
                event.status === "running" ||
                event.status === "completed" ||
                event.status === "failed" ||
                event.status === "skipped"
              ) {
                const newStatus = event.status === "skipped" ? "completed" : event.status;
                if (newStatus === "running" && step.status !== "running") {
                  setStepStartTimes((prev) => ({ ...prev, [stepId]: Date.now() }));
                }
                step.status = newStatus;
              }

              if (event.log_message) {
                const isDuplicate = step.logs.some((l) => l.message === event.log_message);
                if (!isDuplicate) {
                  const log: PipelineLog = {
                    timestamp: new Date(event.created_at).getTime(),
                    message: event.log_message,
                    type: normalizeLogType(event.log_type),
                  };
                  step.logs = [...step.logs, log];
                }
              }

              if (event.data) {
                step.output = JSON.stringify(event.data);
                if (event.data.slug && typeof event.data.slug === "string") setProjectSlug(event.data.slug);
              }

              updated[stepIndex] = step;
            }
            return updated;
          });
        }

        if (data.job.status === "completed" || data.job.status === "failed") {
          if (data.job.status === "failed") setError(data.job.error || "Pipeline failed");
          stopPolling();
          setIsRunning(false);
          return;
        }

        schedulePoll(nextJobId, getNextPollMs(data.job.status, data.queue));
      } catch (err) {
        console.error("Poll error:", err);
        setStatusWithActivity("Network issue while checking progress. Retrying...", "error");
        schedulePoll(nextJobId, POLL_RETRY_MS);
      }
    },
    [appendActivities, schedulePoll, setStatusWithActivity, stopPolling]
  );

  useEffect(() => {
    pollFnRef.current = pollStatus;
  }, [pollStatus]);

  const recoverPipeline = useCallback(
    async (action: PipelineRecoveryAction) => {
      if (!jobId) {
        setError("No active pipeline job to recover.");
        return;
      }

      setRecoveryAction(action);
      setError(null);

      try {
        const response = await fetch("/api/ai/pipeline-recover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, action }),
        });

        const data = (await response.json()) as PipelineRecoverResponse;
        if (!response.ok) {
          if (response.status === 409 && typeof data.jobId === "string") {
            eventCursorRef.current = null;
            lastStatusMessageRef.current = null;
            setSteps(PIPELINE_STEPS.map((s) => ({ ...s, status: "pending", logs: [] })));
            setActivities([]);
            setStepStartTimes({});
            setJobId(data.jobId);
            setJobStatus("running");
            setQueueReason(null);
            setPendingForSeconds(null);
            setRunningForSeconds(0);
            setIsStalled(false);
            setStalledReason(null);
            setStatusWithActivity(data.error || "Reconnected to the active company build.");
            stopPolling();
            await pollStatus(data.jobId);
            return;
          }
          throw new Error(data.error || `Recovery request failed (${response.status})`);
        }

        if (action === "retry") {
          const nextJobId = data.jobId;
          if (!nextJobId) throw new Error("Retry succeeded but no new job ID was returned.");

          eventCursorRef.current = null;
          lastStatusMessageRef.current = null;
          setSteps(PIPELINE_STEPS.map((s) => ({ ...s, status: "pending", logs: [] })));
          setActivities([]);
          setStepStartTimes({});
          setJobId(nextJobId);
          setJobStatus("running");
          setQueueReason(null);
          setPendingForSeconds(null);
          setRunningForSeconds(0);
          setIsStalled(false);
          setStalledReason(null);
          setStatusWithActivity(data.message || "Retry started immediately.");
          stopPolling();
          await pollStatus(nextJobId);
          return;
        }

        setStatusWithActivity(data.message || "Manual execution started.");
        stopPolling();
        await pollStatus(jobId);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        setStatusWithActivity(`Recovery failed: ${errorMessage}`, "error");
      } finally {
        setRecoveryAction(null);
      }
    },
    [jobId, pollStatus, setStatusWithActivity, stopPolling]
  );

  const runPipelineManually = useCallback(async () => {
    await recoverPipeline("run_now");
  }, [recoverPipeline]);

  const retryJob = useCallback(async () => {
    await recoverPipeline("retry");
  }, [recoverPipeline]);

  const refreshStatus = useCallback(async () => {
    if (!jobId) return;
    stopPolling();
    await pollStatus(jobId);
  }, [jobId, pollStatus, stopPolling]);

  const runPipeline = useCallback(
    async (prompt: string, meta?: { url?: string }) => {
      stopPolling();
      setIsRunning(true);
      setError(null);
      setProjectSlug(null);
      setJobStatus(null);
      setJobId(null);
      setQueueReason(null);
      setPendingForSeconds(null);
      setRunningForSeconds(null);
      setIsStalled(false);
      setStalledReason(null);
      setRecoveryAction(null);
      setStepStartTimes({});
      eventCursorRef.current = null;
      lastStatusMessageRef.current = null;
      setActivities([]);
      setSteps(PIPELINE_STEPS.map((s) => ({ ...s, status: "pending", logs: [] })));
      setStatusWithActivity("Starting your company build...");

      try {
        const response = await fetch("/api/ai/run-pipeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, url: meta?.url }),
        });

        const data = (await response.json()) as PipelineRecoverResponse;

        if (!response.ok) {
          if (response.status === 409 && typeof data.jobId === "string") {
            setJobId(data.jobId);
            setJobStatus("running");
            setQueueReason(null);
            setPendingForSeconds(null);
            setRunningForSeconds(0);
            setIsStalled(false);
            setStalledReason(null);
            setStatusWithActivity(data.error || "Reconnected to the active company build.");
            await pollStatus(data.jobId);
            return;
          }
          throw new Error(data.error || "Failed to start pipeline");
        }

        const nextJobId = data.jobId;
        if (typeof nextJobId !== "string" || nextJobId.trim().length === 0) {
          throw new Error("Pipeline started but no job ID was returned.");
        }

        setJobId(nextJobId);
        setJobStatus("running");
        setQueueReason(null);
        setPendingForSeconds(null);
        setRunningForSeconds(0);
        appendActivities([
          {
            id: `start-${nextJobId}`,
            timestamp: Date.now(),
            message: data.message || "Build started immediately. Initializing onboarding...",
            type: "info",
            source: "system",
          },
        ]);

        await pollStatus(nextJobId);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        setStatusWithActivity("Failed to start company build.", "error");
        setIsRunning(false);
      }
    },
    [appendActivities, pollStatus, setStatusWithActivity, stopPolling]
  );

  const reset = useCallback(() => {
    stopPolling();
    setSteps(PIPELINE_STEPS.map((s) => ({ ...s, status: "pending", logs: [] })));
    setIsRunning(false);
    setProjectSlug(null);
    setError(null);
    setStatusMessage(null);
    setJobStatus(null);
    setJobId(null);
    setQueueReason(null);
    setPendingForSeconds(null);
    setRunningForSeconds(null);
    setIsStalled(false);
    setStalledReason(null);
    setActivities([]);
    setRecoveryAction(null);
    setStepStartTimes({});
    eventCursorRef.current = null;
    lastStatusMessageRef.current = null;
  }, [stopPolling]);

  return {
    steps,
    isRunning,
    projectSlug,
    error,
    jobStatus,
    jobId,
    queueReason,
    pendingForSeconds,
    runningForSeconds,
    isStalled,
    stalledReason,
    statusMessage,
    activities,
    recoveryAction,
    stepStartTimes,
    runPipeline,
    runPipelineManually,
    retryJob,
    refreshStatus,
    reset,
  };
}
