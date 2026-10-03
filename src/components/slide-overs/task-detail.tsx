"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AiGenerateButton } from "@/components/ai-enhancer";
import type { Project, Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUpdateTask, useDeleteTask } from "@/hooks/use-tasks";

interface TaskDetailProps {
  taskId: string | null;
  tasks?: Task[];
  projectId?: string;
  subscriptionStatus?: Project["subscription_status"];
  taskCredits?: number;
  isOpen: boolean;
  onClose: () => void;
  onRunTask: (taskId: string) => Promise<void> | void;
  onRefresh?: () => Promise<void> | void;
  onViewDocument: (docId: string) => void;
}

const STATUS_STYLES: Record<string, {
  label: string;
  badgeClass: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = {
  queued: {
    label: "Queued",
    badgeClass: "border-blue-200 bg-blue-50 text-blue-700",
    Icon: Clock,
  },
  pending: {
    label: "Pending",
    badgeClass: "border-slate-200 bg-slate-100 text-slate-700",
    Icon: Clock,
  },
  running: {
    label: "Running",
    badgeClass: "border-yellow-200 bg-yellow-50 text-yellow-700",
    Icon: Loader2,
  },
  pending_confirmation: {
    label: "Needs Review",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
    Icon: AlertCircle,
  },
  completed: {
    label: "Completed",
    badgeClass: "border-green-200 bg-green-50 text-green-700",
    Icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    badgeClass: "border-red-200 bg-red-50 text-red-700",
    Icon: XCircle,
  },
  rejected: {
    label: "Rejected",
    badgeClass: "border-zinc-200 bg-zinc-100 text-zinc-600",
    Icon: Ban,
  },
};

const FALLBACK_STATUS_STYLE = STATUS_STYLES.pending;

function formatDateTime(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString();
}

function stringifyTaskResult(result: Task["result"]) {
  if (!result) return null;
  if (typeof result === "string") {
    // Try to parse and pretty-print JSON strings
    try {
      const parsed = JSON.parse(result);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return result;
    }
  }
  return JSON.stringify(result, null, 2);
}

function sortQueuedTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const priorityDiff = (a.priority || 0) - (b.priority || 0);
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

function getTonightTaskId(tasks: Task[], taskCredits?: number) {
  if (!taskCredits || taskCredits <= 0) return null;
  return sortQueuedTasks(tasks.filter((task) => task.status === "queued"))[0]?.id ?? null;
}

function extractTaskFromResponse(payload: unknown): {
  task: Task | null;
  assistantMessage: string | null;
} {
  if (!payload || typeof payload !== "object") {
    return { task: null, assistantMessage: null };
  }

  if ("task" in payload && payload.task && typeof payload.task === "object") {
    const taskPayload = payload as { task: Task; assistantMessage?: unknown };
    return {
      task: taskPayload.task,
      assistantMessage:
        typeof taskPayload.assistantMessage === "string" ? taskPayload.assistantMessage : null,
    };
  }

  return { task: payload as Task, assistantMessage: null };
}

export function TaskDetail({
  taskId,
  tasks,
  projectId,
  subscriptionStatus,
  taskCredits,
  isOpen,
  onClose,
  onRunTask,
  onRefresh,
  onViewDocument,
}: TaskDetailProps) {
  const [loadedTask, setLoadedTask] = useState<Task | null>(null);
  const [missingTaskId, setMissingTaskId] = useState<string | null>(null);
  const [loadingTaskId, setLoadingTaskId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editRecurring, setEditRecurring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { mutateAsync: updateTask } = useUpdateTask(projectId || "");
  const { mutateAsync: deleteTask } = useDeleteTask(projectId || "");

  const taskFromList = taskId && tasks ? tasks.find((item) => item.id === taskId) ?? null : null;
  const task = taskId
    ? loadedTask?.id === taskId
      ? loadedTask
      : taskFromList
    : null;

  useEffect(() => {
    if (!isOpen || !taskId) {
      setLoadedTask(null);
      setMissingTaskId(null);
      setLoadingTaskId(null);
      return;
    }

    if (taskFromList) {
      setLoadedTask(taskFromList);
      setMissingTaskId(null);
      return;
    }

    if (!projectId) return;

    let cancelled = false;
    setLoadingTaskId(taskId);

    fetch(`/api/tasks?projectId=${projectId}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => []);
        if (cancelled) return;
        const found = Array.isArray(data) ? data.find((item) => item.id === taskId) ?? null : null;
        setLoadedTask(found);
        setMissingTaskId(found ? null : taskId);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedTask(null);
          setMissingTaskId(taskId);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingTaskId((current) => (current === taskId ? null : current));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, projectId, taskFromList, taskId]);

  useEffect(() => {
    if (!isOpen || !task) return;
    setEditMode(false);
    setEditTitle(task.title);
    setEditDescription(task.description || "");
    setEditRecurring(Boolean(task.is_recurring));
    setActionError(null);
  }, [isOpen, task]);

  useEffect(() => {
    if (!task || editMode) return;
    setEditTitle(task.title);
    setEditDescription(task.description || "");
    setEditRecurring(Boolean(task.is_recurring));
  }, [editMode, task]);

  const loading = Boolean(isOpen && taskId && !task && missingTaskId !== taskId && loadingTaskId === taskId);

  const tonightTaskId = useMemo(
    () => (tasks ? getTonightTaskId(tasks, taskCredits) : null),
    [taskCredits, tasks]
  );

  const statusStyle = task ? STATUS_STYLES[task.status] || FALLBACK_STATUS_STYLE : FALLBACK_STATUS_STYLE;
  const resultContent = task ? stringifyTaskResult(task.result) : null;
  const canRun = task ? task.status === "queued" || task.status === "pending" : false;
  const canRepeat = task
    ? task.status === "completed" || task.status === "failed" || task.status === "rejected"
    : false;
  const canReject = task ? task.status === "queued" || task.status === "pending" : false;
  const canEditTask = task ? task.status !== "running" : false;
  const showTonightBadge = Boolean(task && tonightTaskId === task.id);

  async function handleRefresh() {
    await Promise.resolve(onRefresh?.());
  }

  async function handleSaveEdit() {
    if (!task || !projectId || !editTitle.trim()) return;

    setSaving(true);
    setActionError(null);

    try {
      const payload = await updateTask({
        taskId: task.id,
        updates: {
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          is_recurring: editRecurring,
        },
      });

      const { task: updatedTask } = extractTaskFromResponse(payload);
      if (!updatedTask) throw new Error("Failed to load the updated task");

      setLoadedTask(updatedTask);
      setEditMode(false);
      await handleRefresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to update task");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTask() {
    if (!task || !projectId) return;
    if (!window.confirm("Delete this task? This cannot be undone.")) return;

    setDeleting(true);
    setActionError(null);

    try {
      await deleteTask(task.id);
      await handleRefresh();
      onClose();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to delete task");
    } finally {
      setDeleting(false);
    }
  }

  async function handleRejectTask() {
    if (!task || !projectId) return;

    setRejecting(true);
    setActionError(null);

    try {
      const payload = await updateTask({
        taskId: task.id,
        updates: { status: "rejected" } as any
      });

      const { task: updatedTask } = extractTaskFromResponse(payload);
      if (!updatedTask) throw new Error("Failed to load the updated task");

      setLoadedTask(updatedTask);
      await handleRefresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to reject task");
    } finally {
      setRejecting(false);
    }
  }

  async function handleRunTaskLocal() {
    if (!task) return;

    setRunning(true);
    setActionError(null);

    try {
      await onRunTask(task.id);
      await handleRefresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to run task");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[100dvh] sm:h-[80vh] max-h-[100dvh] sm:max-h-[680px] w-full sm:w-[calc(100vw-2rem)] max-w-full sm:max-w-[600px] flex-col gap-0 overflow-hidden border-slate-200 bg-white p-0 shadow-xl rounded-none sm:rounded-lg">
        {loading && !task ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : task ? (
          <>
            {/* Header */}
            <div className="border-b border-slate-100 px-6 py-5 pr-14">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Badge className={cn("rounded-full border px-2.5 py-0.5 text-[11px]", statusStyle.badgeClass)}>
                  <statusStyle.Icon className={cn("mr-1 h-3 w-3", task.status === "running" && "animate-spin")} />
                  {statusStyle.label}
                </Badge>
                {task.is_recurring && !editMode && (
                  <Badge className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] text-indigo-700">
                    <RefreshCw className="mr-1 h-3 w-3" />
                    Recurring
                  </Badge>
                )}
                {showTonightBadge && (
                  <Badge className="rounded-full bg-slate-950 px-2.5 py-0.5 text-[11px] text-white hover:bg-slate-950">
                    Tonight
                  </Badge>
                )}
              </div>

              {editMode ? (
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="text-lg font-semibold"
                  placeholder="Task title"
                  autoFocus
                />
              ) : (
                <DialogTitle className="text-lg leading-snug text-slate-950">
                  {task.title}
                </DialogTitle>
              )}
              <DialogDescription className="sr-only">Task details</DialogDescription>
            </div>

            {/* Body */}
            <ScrollArea className="min-h-0 flex-1 overflow-hidden">
              <div className="space-y-5 px-6 py-5">
                {actionError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {actionError}
                  </div>
                )}

                {/* Outputs */}
                {(task.output_document_id || task.output_url) && (
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Outputs</Label>
                    <div className="flex flex-wrap gap-2">
                      {task.output_document_id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            onClose();
                            setTimeout(() => onViewDocument(task.output_document_id!), 200);
                          }}
                        >
                          <FileText className="mr-1.5 h-3.5 w-3.5" />
                          View Document
                        </Button>
                      )}
                      {task.output_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(task.output_url!, "_blank")}
                        >
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                          View Output
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Description */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Brief</Label>
                    {editMode && projectId && (
                      <AiGenerateButton
                        projectId={projectId}
                        formType="task"
                        currentValues={{ title: editTitle, description: editDescription }}
                        onResult={(values) => {
                          if (values.title) setEditTitle(values.title);
                          if (values.description) setEditDescription(values.description);
                          if (values.isRecurring !== undefined) setEditRecurring(values.isRecurring === "true");
                        }}
                        className=""
                      />
                    )}
                  </div>
                  {editMode ? (
                    <Textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="min-h-[140px] resize-none"
                      placeholder="Describe what the AI agent should do and what good output looks like."
                    />
                  ) : task.description ? (
                    <div className="space-y-1.5">
                      {task.description
                        .split("\n")
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .map((line, i) => (
                          <p key={i} className="text-sm leading-relaxed text-slate-700">
                            {line}
                          </p>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No description added yet.</p>
                  )}
                </div>

                {/* Recurring toggle (edit mode) */}
                {editMode && (
                  <div className="rounded-lg border border-slate-200 px-4 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-slate-900">Recurring task</p>
                        <p className="text-xs text-muted-foreground">
                          Repeat on each nightly run.
                        </p>
                      </div>
                      <Switch
                        checked={editRecurring}
                        onCheckedChange={setEditRecurring}
                      />
                    </div>
                  </div>
                )}

                {/* Timeline */}
                {!editMode && (
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Timeline</Label>
                    <div className="divide-y divide-slate-100 text-sm">
                      {[
                        { label: "Created", value: formatDateTime(task.created_at) },
                        { label: "Started", value: formatDateTime(task.started_at) },
                        { label: "Completed", value: formatDateTime(task.completed_at) },
                      ]
                        .filter((row) => row.value)
                        .map((row) => (
                          <div key={row.label} className="flex items-center justify-between py-2">
                            <span className="text-muted-foreground">{row.label}</span>
                            <span className="text-slate-900">{row.value}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Summary */}
                {!editMode && task.summary?.trim() && (
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Summary</Label>
                    <div className="space-y-1.5">
                      {task.summary
                        .split("\n")
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .map((line, i) => (
                          <p key={i} className="text-sm leading-relaxed text-slate-700">
                            {line}
                          </p>
                        ))}
                    </div>
                  </div>
                )}

                {/* Result */}
                {!editMode && resultContent && (
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Output</Label>
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
                      <pre className="max-h-[320px] overflow-auto px-4 py-3 text-xs leading-relaxed text-slate-100 whitespace-pre-wrap break-words">
                        {resultContent}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Footer Actions */}
            <div className="border-t border-slate-100 bg-slate-50/50 px-4 sm:px-6 py-4 safe-area-bottom">
              {(taskCredits ?? 1) <= 0 && !editMode && (
                <p className="mb-3 text-xs text-muted-foreground">
                  Out of task credits — won't run tonight until credits are added.
                </p>
              )}

              <div className="flex items-center justify-end gap-2 flex-wrap">
                {editMode ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditMode(false);
                          setEditTitle(task.title);
                          setEditDescription(task.description || "");
                          setEditRecurring(Boolean(task.is_recurring));
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveEdit}
                        disabled={saving || !editTitle.trim()}
                      >
                        {saving ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Save
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-200 text-red-600 hover:bg-red-50"
                      onClick={handleDeleteTask}
                      disabled={deleting || !canEditTask}
                    >
                      {deleting ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Remove
                    </Button>
                    {canReject && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRejectTask}
                        disabled={rejecting}
                      >
                        {rejecting ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Reject
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditMode(true)}
                      disabled={!canEditTask}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    {(canRun || canRepeat) && (
                      <Button
                        size="sm"
                        onClick={handleRunTaskLocal}
                        disabled={running || (taskCredits ?? 1) <= 0}
                      >
                        {running ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : canRepeat ? (
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        ) : (
                          <Play className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {canRepeat ? "Run Again" : "Run Now"}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center">
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-900">Task not found</p>
              <p className="text-sm text-muted-foreground">
                The task details could not be loaded.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
