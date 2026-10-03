"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Task, TaskStatus } from "@/lib/types";

const POLL_RUNNING_MS = 2000;
const POLL_PENDING_HEAD_MS = 3000;
const POLL_PENDING_QUEUE_MS = 6000;
const POLL_RETRY_MS = 5000;
const PENDING_WARNING_SECONDS = 45;
const SLOW_RUNNING_WARNING_SECONDS = 180;
const HIDE_AFTER_TERMINAL_MS = 12000;

export type LiveTaskJobStatus = "pending" | "running" | "completed" | "failed";
export type LiveTaskQueueReason =
  | "waiting_for_user_slot"
  | "waiting_for_worker_slot"
  | "claiming"
  | "worker_unavailable"
  | null;

export interface LiveTaskActivity {
  id: string;
  timestamp: number;
  message: string;
  type: "info" | "success" | "error";
}

interface ActiveTaskJobResponse {
  job: {
    id: string;
    status: LiveTaskJobStatus;
    error: string | null;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    taskId: string | null;
    taskTitle: string | null;
    taskType: string | null;
    taskStatus: TaskStatus | null;
  } | null;
}

interface TaskStatusResponse {
  job: {
    id: string;
    status: LiveTaskJobStatus;
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
    reason: LiveTaskQueueReason;
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
}

interface UseLiveTaskRunParams {
  projectId?: string;
  tasks: Task[];
  onSettled?: () => void | Promise<void>;
}

interface TrackTaskOptions {
  jobId?: string;
  taskId?: string | null;
  taskTitle?: string | null;
  taskStatus?: TaskStatus | null;
}

function normalizeLogType(value: string | null | undefined): "info" | "success" | "error" {
  if (value === "success" || value === "error") return value;
  return "info";
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function buildPendingStatusMessage(queue: TaskStatusResponse["queue"], pendingForSeconds: number): string {
  if ((queue.position ?? 1) > 1) {
    return `Another task is already ahead in your queue. This task is pending as request #${queue.position}.`;
  }

  if (queue.reason === "waiting_for_user_slot") {
    return "Another task is already running for your account. This one will start next.";
  }

  if (queue.reason === "waiting_for_worker_slot") {
    if (pendingForSeconds >= PENDING_WARNING_SECONDS) {
      return "Waiting for a worker slot. The task will start as soon as capacity opens up.";
    }
    return "Queued and waiting for the next available worker slot.";
  }

  if (queue.reason === "worker_unavailable") {
    return `No worker has claimed this task for ${formatDuration(pendingForSeconds)}.`;
  }

  if (queue.reason === "claiming") {
    return "A worker is claiming this task now.";
  }

  if (queue.isStalled) {
    return "This task is taking longer than expected to start.";
  }

  return "Queued and preparing context for execution.";
}

function buildRunningStatusMessage(runningForSeconds: number): string {
  if (runningForSeconds >= SLOW_RUNNING_WARNING_SECONDS) {
    return `Still running after ${formatDuration(runningForSeconds)}. Some tasks take a few minutes.`;
  }
  return "AI is working through the task in the background.";
}

function getNextPollMs(status: LiveTaskJobStatus, queue: TaskStatusResponse["queue"]): number {
  if (status === "running") return POLL_RUNNING_MS;
  if (status !== "pending") return 0;
  if (queue.reason === "worker_unavailable") return POLL_PENDING_QUEUE_MS;
  if ((queue.position ?? 1) > 1) return POLL_PENDING_QUEUE_MS;
  return POLL_PENDING_HEAD_MS;
}

function deriveTerminalTaskStatus(
  taskStatus: TaskStatus | null,
  terminalEventStatus: string | null,
  jobStatus: LiveTaskJobStatus | null
): TaskStatus | null {
  if (taskStatus) return taskStatus;
  if (terminalEventStatus === "pending_confirmation") return "pending_confirmation";
  if (jobStatus === "completed") return "completed";
  if (jobStatus === "failed") return "failed";
  return null;
}

export function useLiveTaskRun({ projectId, tasks, onSettled }: UseLiveTaskRunParams) {
  const [visible, setVisible] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null);
  const [jobStatus, setJobStatus] = useState<LiveTaskJobStatus | null>(null);
  const [queueReason, setQueueReason] = useState<LiveTaskQueueReason>(null);
  const [pendingForSeconds, setPendingForSeconds] = useState<number | null>(null);
  const [runningForSeconds, setRunningForSeconds] = useState<number | null>(null);
  const [isStalled, setIsStalled] = useState(false);
  const [stalledReason, setStalledReason] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<LiveTaskActivity[]>([]);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollFnRef = useRef<(nextJobId: string) => Promise<void>>(async () => {});
  const cursorRef = useRef<{ id: string; createdAt: string } | null>(null);
  const lastStatusMessageRef = useRef<string | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const projectIdRef = useRef<string | undefined>(projectId);
  const completionHandledRef = useRef<string | null>(null);

  const trackedTask = taskId ? tasks.find((task) => task.id === taskId) ?? null : null;

  useEffect(() => {
    jobIdRef.current = jobId;
  }, [jobId]);

  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  const clearHideTimer = useCallback(() => {
    if (hideRef.current) {
      clearTimeout(hideRef.current);
      hideRef.current = null;
    }
  }, []);

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

  const appendActivities = useCallback((newItems: LiveTaskActivity[]) => {
    if (newItems.length === 0) return;
    setActivities((prev) => {
      const next = [...prev];
      const seenIds = new Set(next.map((item) => item.id));
      for (const item of newItems) {
        if (seenIds.has(item.id)) continue;
        const last = next[next.length - 1];
        if (
          last &&
          last.message === item.message &&
          last.type === item.type &&
          Math.abs(item.timestamp - last.timestamp) < 3000
        ) {
          continue;
        }
        next.push(item);
        seenIds.add(item.id);
      }
      if (next.length > 200) return next.slice(next.length - 200);
      return next;
    });
  }, []);

  const setStatusWithActivity = useCallback(
    (message: string, type: LiveTaskActivity["type"] = "info") => {
      setStatusMessage(message);
      if (lastStatusMessageRef.current === message) return;
      lastStatusMessageRef.current = message;
      appendActivities([
        {
          id: `status-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          message,
          type,
        },
      ]);
    },
    [appendActivities]
  );

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideRef.current = setTimeout(() => {
      setVisible(false);
      setJobId(null);
      setTaskId(null);
      setTaskTitle(null);
      setTaskStatus(null);
      setJobStatus(null);
      setQueueReason(null);
      setPendingForSeconds(null);
      setRunningForSeconds(null);
      setIsStalled(false);
      setStalledReason(null);
      setStatusMessage(null);
      setError(null);
      setActivities([]);
      cursorRef.current = null;
      lastStatusMessageRef.current = null;
      completionHandledRef.current = null;
    }, HIDE_AFTER_TERMINAL_MS);
  }, [clearHideTimer]);

  const discoverActiveTask = useCallback(async (): Promise<ActiveTaskJobResponse["job"] | null> => {
    if (!projectIdRef.current) return null;

    const res = await fetch(`/api/tasks/live?projectId=${projectIdRef.current}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      if (res.status === 404 || res.status === 401) return null;
      throw new Error(`Failed to load live task (${res.status})`);
    }

    const data = (await res.json()) as ActiveTaskJobResponse;
    return data.job;
  }, []);

  const beginTracking = useCallback(
    async (job: NonNullable<ActiveTaskJobResponse["job"]>, fallback?: TrackTaskOptions) => {
      clearHideTimer();
      stopPolling();
      cursorRef.current = null;
      lastStatusMessageRef.current = null;
      completionHandledRef.current = null;

      setVisible(true);
      setError(null);
      setActivities([]);
      setJobId(job.id);
      setJobStatus(job.status);
      setTaskId(job.taskId ?? fallback?.taskId ?? null);
      setTaskTitle(job.taskTitle ?? fallback?.taskTitle ?? null);
      setTaskStatus(job.taskStatus ?? fallback?.taskStatus ?? null);
      setQueueReason(null);
      setPendingForSeconds(null);
      setRunningForSeconds(null);
      setIsStalled(false);
      setStalledReason(null);
      setStatusMessage(job.status === "running" ? "Task started." : "Task queued.");

      await pollFnRef.current(job.id);
    },
    [clearHideTimer, stopPolling]
  );

  const pollStatus = useCallback(
    async (nextJobId: string) => {
      try {
        const params = new URLSearchParams({ jobId: nextJobId });
        if (cursorRef.current) {
          params.set("afterCreatedAt", cursorRef.current.createdAt);
          params.set("afterId", cursorRef.current.id);
        }

        const res = await fetch(`/api/ai/pipeline-status?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          stopPolling();
          setError(`Failed to fetch task progress (${res.status})`);
          setStatusWithActivity("Could not read live task progress.", "error");
          return;
        }

        const data = (await res.json()) as TaskStatusResponse;
        const events = data.events || [];

        setVisible(true);
        setJobId(data.job.id);
        setJobStatus(data.job.status);
        setQueueReason(data.queue.reason);
        setPendingForSeconds(data.job.pendingForSeconds);
        setRunningForSeconds(data.job.runningForSeconds);
        setIsStalled(Boolean(data.queue.isStalled));
        setStalledReason(data.queue.stalledReason || null);
        if (data.job.error) setError(data.job.error);

        if (data.cursor?.id && data.cursor?.createdAt) {
          cursorRef.current = { id: data.cursor.id, createdAt: data.cursor.createdAt };
        }

        let latestEventStatus: string | null = null;

        if (events.length > 0) {
          const taskEventData = events.find(
            (event) => event.data?.taskId || event.data?.taskTitle || event.data?.taskType
          )?.data;

          if (typeof taskEventData?.taskId === "string") setTaskId(taskEventData.taskId);
          if (typeof taskEventData?.taskTitle === "string") setTaskTitle(taskEventData.taskTitle);

          latestEventStatus = [...events]
            .reverse()
            .find((event) =>
              event.status === "pending_confirmation" ||
              event.status === "completed" ||
              event.status === "failed" ||
              event.status === "running"
            )?.status ?? null;

          setTaskStatus((prev) => {
            if (latestEventStatus === "pending_confirmation") return "pending_confirmation";
            if (latestEventStatus === "completed" && (prev === null || prev === "running" || prev === "pending")) {
              return "completed";
            }
            if (latestEventStatus === "failed") return "failed";
            if (latestEventStatus === "running" && (prev === null || prev === "pending" || prev === "queued")) {
              return "running";
            }
            return prev;
          });

          appendActivities(
            events
              .filter((event) => typeof event.log_message === "string" && event.log_message.trim().length > 0)
              .map((event) => ({
                id: `event-${event.id}`,
                timestamp: new Date(event.created_at).getTime(),
                message: event.log_message as string,
                type: normalizeLogType(event.log_type),
              }))
          );
        }

        if (data.job.status === "pending") {
          setStatusWithActivity(buildPendingStatusMessage(data.queue, data.job.pendingForSeconds ?? 0));
        } else if (data.job.status === "running") {
          setStatusWithActivity(buildRunningStatusMessage(data.job.runningForSeconds ?? 0));
        } else if (data.job.status === "completed") {
          const outcome = deriveTerminalTaskStatus(taskStatus, latestEventStatus, data.job.status);
          if (outcome === "pending_confirmation") {
            setStatusWithActivity("Draft is ready for review in the dashboard.", "success");
          } else {
            setStatusWithActivity("Task finished successfully.", "success");
          }
        } else if (data.job.status === "failed") {
          setStatusWithActivity(data.job.error || "Task failed.", "error");
        }

        if (data.job.status === "completed" || data.job.status === "failed") {
          stopPolling();

          if (completionHandledRef.current !== data.job.id) {
            completionHandledRef.current = data.job.id;

            try {
              await onSettled?.();
            } catch (settleError) {
              console.error("Failed to refresh after task settlement:", settleError);
            }

            try {
              const nextJob = await discoverActiveTask();
              if (nextJob && nextJob.id !== data.job.id) {
                await beginTracking(nextJob);
                return;
              }
            } catch (discoverError) {
              console.error("Failed to rediscover active task:", discoverError);
            }

            scheduleHide();
          }

          return;
        }

        schedulePoll(nextJobId, getNextPollMs(data.job.status, data.queue));
      } catch (pollError) {
        console.error("Live task poll error:", pollError);
        setStatusWithActivity("Network issue while checking live task progress. Retrying...", "error");
        schedulePoll(nextJobId, POLL_RETRY_MS);
      }
    },
    [
      appendActivities,
      beginTracking,
      discoverActiveTask,
      onSettled,
      scheduleHide,
      schedulePoll,
      setStatusWithActivity,
      stopPolling,
      taskStatus,
    ]
  );

  useEffect(() => {
    pollFnRef.current = pollStatus;
  }, [pollStatus]);

  const syncActiveTask = useCallback(
    async (fallback?: TrackTaskOptions) => {
      clearHideTimer();

      try {
        const activeJob = await discoverActiveTask();
        if (activeJob) {
          if (jobIdRef.current === activeJob.id && visible) {
            stopPolling();
            await pollFnRef.current(activeJob.id);
            return;
          }
          await beginTracking(activeJob, fallback);
          return;
        }

        if (fallback?.jobId) {
          await beginTracking(
            {
              id: fallback.jobId,
              status: "pending",
              error: null,
              createdAt: new Date().toISOString(),
              startedAt: null,
              completedAt: null,
              taskId: fallback.taskId ?? null,
              taskTitle: fallback.taskTitle ?? null,
              taskType: null,
              taskStatus: fallback.taskStatus ?? "queued",
            },
            fallback
          );
        }
      } catch (syncError) {
        const message = syncError instanceof Error ? syncError.message : String(syncError);
        setError(message);
      }
    },
    [beginTracking, clearHideTimer, discoverActiveTask, stopPolling, visible]
  );

  useEffect(() => {
    if (!projectId) {
      stopPolling();
      clearHideTimer();
      return;
    }

    const syncTimer = window.setTimeout(() => {
      void syncActiveTask();
    }, 0);
    return () => {
      window.clearTimeout(syncTimer);
      stopPolling();
      clearHideTimer();
    };
  }, [clearHideTimer, projectId, stopPolling, syncActiveTask]);

  const dismiss = useCallback(() => {
    stopPolling();
    clearHideTimer();
    setVisible(false);
    setJobId(null);
    setTaskId(null);
    setTaskTitle(null);
    setTaskStatus(null);
    setJobStatus(null);
    setQueueReason(null);
    setPendingForSeconds(null);
    setRunningForSeconds(null);
    setIsStalled(false);
    setStalledReason(null);
    setStatusMessage(null);
    setError(null);
    setActivities([]);
    cursorRef.current = null;
    lastStatusMessageRef.current = null;
    completionHandledRef.current = null;
  }, [clearHideTimer, stopPolling]);

  return {
    visible,
    jobId,
    jobStatus,
    taskId,
    taskTitle: trackedTask?.title ?? taskTitle,
    taskStatus: trackedTask?.status ?? taskStatus,
    statusMessage,
    error,
    activities,
    queueReason,
    pendingForSeconds,
    runningForSeconds,
    isStalled,
    stalledReason,
    syncActiveTask,
    dismiss,
  };
}
