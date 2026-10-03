"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  ChevronUp,
  ChevronDown,
  Lock,
  Play,
  Trash2,
  Pencil,
  RefreshCw,
  Send,
  Check,
  X,
  RotateCcw,
  Sparkles,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ListTodo,
  Ban,
  Plus,
} from "lucide-react";
import { OutreachConfirmationModal } from "./outreach-confirmation-modal";
import type { Task, Project, OutreachEmail } from "@/lib/types";
import { canSendProjectEmail, getEmailSetupBlockedReason } from "@/lib/project-integrations";
import { useReorderTasks, useUpdateTask, useDeleteTask } from "@/hooks/use-tasks";

interface TasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  project: Project;
  onRunTask: (taskId: string) => void;
  onRefresh: () => void;
  onBuyCredits: () => void;
  onCreateTask?: () => void;
}

interface StatusConfig {
  bg: string;
  text: string;
  border: string;
  leftBorder: string;
  selectedBg: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  queued: {
    bg: "bg-blue-50 text-blue-700 border-blue-200",
    text: "text-blue-700",
    border: "border-blue-200",
    leftBorder: "border-l-blue-400",
    selectedBg: "bg-blue-50/60",
    label: "Queued",
    Icon: Clock,
  },
  pending: {
    bg: "bg-slate-100 text-slate-600 border-slate-200",
    text: "text-slate-600",
    border: "border-slate-200",
    leftBorder: "border-l-slate-300",
    selectedBg: "bg-slate-50",
    label: "Pending",
    Icon: Clock,
  },
  running: {
    bg: "bg-yellow-50 text-yellow-700 border-yellow-200",
    text: "text-yellow-700",
    border: "border-yellow-200",
    leftBorder: "border-l-yellow-400",
    selectedBg: "bg-yellow-50/60",
    label: "Running",
    Icon: Loader2,
  },
  pending_confirmation: {
    bg: "bg-amber-50 text-amber-700 border-amber-200",
    text: "text-amber-700",
    border: "border-amber-200",
    leftBorder: "border-l-amber-400",
    selectedBg: "bg-amber-50/60",
    label: "Needs Review",
    Icon: AlertCircle,
  },
  completed: {
    bg: "bg-green-50 text-green-700 border-green-200",
    text: "text-green-700",
    border: "border-green-200",
    leftBorder: "border-l-green-400",
    selectedBg: "bg-green-50/40",
    label: "Completed",
    Icon: CheckCircle2,
  },
  failed: {
    bg: "bg-red-50 text-red-700 border-red-200",
    text: "text-red-700",
    border: "border-red-200",
    leftBorder: "border-l-red-400",
    selectedBg: "bg-red-50/40",
    label: "Failed",
    Icon: XCircle,
  },
  rejected: {
    bg: "bg-zinc-100 text-zinc-500 border-zinc-200",
    text: "text-zinc-500",
    border: "border-zinc-200",
    leftBorder: "border-l-zinc-300",
    selectedBg: "bg-zinc-50",
    label: "Rejected",
    Icon: Ban,
  },
};

const TAG_COLORS: Record<string, string> = {
  engineering: "bg-violet-100 text-violet-700",
  research: "bg-sky-100 text-sky-700",
  "cold-outreach": "bg-orange-100 text-orange-700",
  marketing: "bg-pink-100 text-pink-700",
  social: "bg-cyan-100 text-cyan-700",
  content: "bg-lime-100 text-lime-700",
  newsletter: "bg-teal-100 text-teal-700",
};

function TagBadge({ tag }: { tag: string | null }) {
  if (!tag) return null;
  const color = TAG_COLORS[tag] || "bg-gray-100 text-gray-600";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium capitalize shrink-0 ${color}`}>
      {tag.replace("-", " ")}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;
  const { Icon, bg, label } = config;
  const isRunning = status === "running";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize shrink-0 ${bg}`}>
      <Icon className={`w-2.5 h-2.5 ${isRunning ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}

function parseTaskEmails(task: Task): OutreachEmail[] {
  if (!task.result) return [];
  try {
    const result = typeof task.result === "string" ? JSON.parse(task.result as string) : task.result;
    return (result.emails || []).map((e: Record<string, string>) => ({
      to: e.to || "",
      toName: e.toName,
      company: e.company,
      role: e.role,
      subject: e.subject || "",
      body: e.body || "",
    }));
  } catch {
    return [];
  }
}

export function TasksModal({
  isOpen,
  onClose,
  tasks,
  project,
  onRunTask,
  onRefresh,
  onBuyCredits,
  onCreateTask,
}: TasksModalProps) {
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editRecurring, setEditRecurring] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiEditing, setAiEditing] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [confirmTask, setConfirmTask] = useState<Task | null>(null);
  const canSendEmails = canSendProjectEmail(project);
  const emailSendBlockedReason = getEmailSetupBlockedReason(project);
  const isTaskAiUnlocked = project.subscription_status === "active";

  const { mutateAsync: reorderTasks } = useReorderTasks(project.id);
  const { mutateAsync: updateTask } = useUpdateTask(project.id);
  const { mutateAsync: deleteTask } = useDeleteTask(project.id);

  useEffect(() => {
    setLocalTasks(tasks);
    if (selectedTask) {
      const refreshed = tasks.find((t) => t.id === selectedTask.id);
      if (refreshed) setSelectedTask(refreshed);
    }
  }, [tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  const todoTasks = localTasks
    .filter((t) => (t.status === "queued" || t.status === "pending") && !t.is_recurring)
    .sort((a, b) => (a.priority || 0) - (b.priority || 0));
  const recurringTasks = localTasks.filter((t) => t.is_recurring);
  const inProgressTasks = localTasks.filter(
    (t) => t.status === "running" || t.status === "pending_confirmation"
  );
  const completedTasks = localTasks
    .filter((t) => t.status === "completed")
    .sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime());
  const failedTasks = localTasks.filter(
    (t) => t.status === "failed" || t.status === "rejected"
  );
  const tonightTaskId =
    project.task_credits > 0
      ? [...localTasks]
          .filter((task) => task.status === "queued")
          .sort((a, b) => {
            const priorityDiff = (a.priority || 0) - (b.priority || 0);
            if (priorityDiff !== 0) return priorityDiff;
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          })[0]?.id ?? null
      : null;

  function openTask(task: Task) {
    setSelectedTask(task);
    setEditMode(false);
    setEditTitle(task.title);
    setEditDescription(task.description || "");
    setEditRecurring(task.is_recurring);
    setAiInstruction("");
  }

  async function handleMoveTask(taskId: string, direction: "up" | "down") {
    const list = [...todoTasks];
    const idx = list.findIndex((t) => t.id === taskId);
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === list.length - 1) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    [list[idx], list[swapIdx]] = [list[swapIdx], list[idx]];

    const updated = list.map((t, i) => ({ ...t, priority: i + 1 }));
    setLocalTasks((prev) =>
      prev.map((t) => {
        const u = updated.find((u) => u.id === t.id);
        return u || t;
      })
    );

    await reorderTasks(list.map((t) => t.id));
  }

  async function handleSaveEdit() {
    if (!selectedTask) return;
    setSaving(true);
    try {
      const updated = await updateTask({
        taskId: selectedTask.id,
        updates: {
          title: editTitle,
          description: editDescription,
          is_recurring: editRecurring,
        },
      });
      // the mutation invalidates queries, but we can update the local state optimistically
      setLocalTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? updated.task ?? updated : t)));
      setSelectedTask(updated.task ?? updated);
      setEditMode(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleAiInstruction() {
    if (!selectedTask || !aiInstruction.trim()) return;
    if (!isTaskAiUnlocked) return;
    setAiEditing(true);
    try {
      const updated = await updateTask({
        taskId: selectedTask.id,
        updates: { aiInstruction } as any // The backend accepts aiInstruction in PATCH
      });
      setLocalTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? updated.task ?? updated : t)));
      setSelectedTask(updated.task ?? updated);
      setAiInstruction("");
      onRefresh();
    } finally {
      setAiEditing(false);
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    await deleteTask(taskId);
    setLocalTasks((prev) => prev.filter((t) => t.id !== taskId));
    setSelectedTask(null);
    onRefresh();
  }

  async function handleRejectTask(taskId: string) {
    const updated = await updateTask({
      taskId,
      updates: { status: "rejected" } as any
    });
    setLocalTasks((prev) => prev.map((t) => (t.id === taskId ? updated.task ?? updated : t)));
    setSelectedTask(updated.task ?? updated);
    onRefresh();
  }

  async function handleRunTaskLocal(taskId: string) {
    setRunning(taskId);
    try {
      await onRunTask(taskId);
      onRefresh();
    } finally {
      setRunning(null);
    }
  }

  // ── Task card in list ──────────────────────────────────────────────
  function TaskCard({
    task,
    showReorder,
    idx,
    totalInGroup,
  }: {
    task: Task;
    showReorder?: boolean;
    idx?: number;
    totalInGroup?: number;
  }) {
    const config = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
    const isSelected = selectedTask?.id === task.id;
    const isTonightTask = task.id === tonightTaskId;

    return (
      <button
        onClick={() => openTask(task)}
        className={`w-full text-left flex items-start gap-0 rounded-lg border border-l-4 transition-all group
          ${config.leftBorder}
          ${isSelected
            ? `${config.selectedBg} border-r-0 border-t-0 border-b-0 ring-1 ring-primary/30 shadow-sm`
            : "bg-card hover:bg-muted/40 border-muted"
          }
        `}
      >
        {showReorder && (
          <div
            className="flex flex-col items-center gap-0.5 py-2 px-1.5 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => handleMoveTask(task.id, "up")}
              disabled={idx === 0}
              className="text-muted-foreground hover:text-foreground disabled:opacity-20 p-0.5 rounded hover:bg-muted transition-colors"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              onClick={() => handleMoveTask(task.id, "down")}
              disabled={idx === (totalInGroup ?? 0) - 1}
              className="text-muted-foreground hover:text-foreground disabled:opacity-20 p-0.5 rounded hover:bg-muted transition-colors"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        )}

        <div className="flex-1 min-w-0 py-2.5 pr-3 pl-2">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {showReorder && idx !== undefined && (
              <span className="text-[10px] text-muted-foreground font-mono w-4 shrink-0">#{idx + 1}</span>
            )}
            <StatusPill status={task.status} />
            {isTonightTask && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium shrink-0">
                Tonight
              </span>
            )}
            {task.is_recurring && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium flex items-center gap-0.5 shrink-0">
                <RefreshCw className="w-2.5 h-2.5" /> Recurring
              </span>
            )}
          </div>
          <p className="text-sm font-medium leading-snug truncate">{task.title}</p>
          {task.description && (
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
          )}
        </div>
      </button>
    );
  }

  // ── Task detail panel ──────────────────────────────────────────────
  function TaskDetailPanel({ task }: { task: Task }) {
    const canRun = task.status === "queued" || task.status === "pending";
    const canRepeat = task.status === "completed" || task.status === "failed" || task.status === "rejected";
    const isPendingConfirmation = task.status === "pending_confirmation";
    const isRunning = task.status === "running";
    const emails = parseTaskEmails(task);
    const config = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;

    return (
      <div className="flex flex-col h-full">
        {/* Task title area */}
        <div className={`px-5 pt-5 pb-4 border-b border-l-4 ${config.leftBorder}`}>
          {editMode ? (
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="text-base font-semibold mb-2"
              placeholder="Task title"
              autoFocus
            />
          ) : (
            <h2 className="text-base font-semibold leading-snug mb-2">{task.title}</h2>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatusPill status={task.status} />
            {task.id === tonightTaskId && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">
                Tonight
              </span>
            )}
            <TagBadge tag={task.tag} />
            {task.is_recurring && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium flex items-center gap-0.5">
                <RefreshCw className="w-2.5 h-2.5" /> Recurring
              </span>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-4">
            {/* Running indicator */}
            {isRunning && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                <Loader2 className="w-4 h-4 text-yellow-600 animate-spin shrink-0" />
                <p className="text-sm text-yellow-700 font-medium">Task is currently running…</p>
              </div>
            )}

            {/* Pending confirmation */}
            {isPendingConfirmation && emails.length > 0 && (
              <div className="p-3.5 rounded-lg border border-amber-200 bg-amber-50 space-y-2.5">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">
                      {emails.length} email{emails.length > 1 ? "s" : ""} ready to review
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      {canSendEmails
                        ? "Review and approve before sending."
                        : "Review the drafts now. Sending unlocks after email setup is complete."}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white w-full"
                  onClick={() => setConfirmTask(task)}
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  {canSendEmails ? "Review & Send Emails" : "Review Email Drafts"}
                </Button>
              </div>
            )}

            {/* Description */}
            {editMode ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Description</p>
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="text-sm min-h-[120px] resize-none"
                  placeholder="Task description"
                />
                <div className="mt-3 rounded-lg border bg-background px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="task-modal-recurring-toggle" className="text-sm">
                        Recurring
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Keep this task in the recurring queue for future nightly runs.
                      </p>
                    </div>
                    <Switch
                      id="task-modal-recurring-toggle"
                      checked={editRecurring}
                      onCheckedChange={setEditRecurring}
                    />
                  </div>
                </div>
              </div>
            ) : (
              task.description && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</p>
                  <div className="text-sm text-foreground leading-relaxed space-y-1">
                    {task.description.split("\n").map((line, i) => (
                      <p key={i} className={line.startsWith("•") || line.startsWith("-") ? "pl-3" : ""}>
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              )
            )}

            {/* Result summary */}
            {task.summary && !editMode && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Result</p>
                <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                  <p className="text-sm text-green-900 leading-relaxed">{task.summary}</p>
                </div>
              </div>
            )}

            {/* Timestamps */}
            {!editMode && (
              <div className="text-xs text-muted-foreground space-y-0.5 pt-1">
                <div className="flex gap-1">
                  <span className="font-medium w-20">Created</span>
                  <span>{new Date(task.created_at).toLocaleString()}</span>
                </div>
                {task.started_at && (
                  <div className="flex gap-1">
                    <span className="font-medium w-20">Started</span>
                    <span>{new Date(task.started_at).toLocaleString()}</span>
                  </div>
                )}
                {task.completed_at && (
                  <div className="flex gap-1">
                    <span className="font-medium w-20">Completed</span>
                    <span>{new Date(task.completed_at).toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}

            {/* AI instruction */}
            {!editMode && (task.status === "queued" || task.status === "pending") && (
              <div className="space-y-2 pt-1">
                <Separator />
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <p className="text-xs font-medium">Refine with AI</p>
                </div>
                {isTaskAiUnlocked ? (
                  <div className="flex gap-2">
                    <Input
                      value={aiInstruction}
                      onChange={(e) => setAiInstruction(e.target.value)}
                      placeholder="e.g., focus on mobile users, add more detail…"
                      className="text-sm h-9 flex-1"
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAiInstruction()}
                    />
                    <Button
                      size="sm"
                      className="h-9 px-3 shrink-0"
                      onClick={handleAiInstruction}
                      disabled={aiEditing || !aiInstruction.trim()}
                    >
                      {aiEditing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800">
                    <div className="flex items-start gap-2">
                      <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <p>
                        Task AI is behind Pro. It uses GPT-4o to rewrite the selected task’s title,
                        description, and recurring setting.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Action bar */}
        <div className="px-5 py-4 border-t bg-muted/20 space-y-3">
          {editMode ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 h-9 text-sm"
                onClick={handleSaveEdit}
                disabled={saving}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                Save Changes
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 text-sm"
                onClick={() => {
                  setEditMode(false);
                  setEditTitle(task.title);
                  setEditDescription(task.description || "");
                  setEditRecurring(task.is_recurring);
                }}
              >
                <X className="w-3.5 h-3.5 mr-1.5" />
                Cancel
              </Button>
            </div>
          ) : (
            <>
              {/* Primary action */}
              {(canRun || canRepeat) && (
                <Button
                  className="w-full h-9 text-sm font-medium"
                  onClick={() => handleRunTaskLocal(task.id)}
                  disabled={
                    running === task.id ||
                    project.task_credits <= 0
                  }
                >
                  {running === task.id ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : canRepeat ? (
                    <RotateCcw className="w-4 h-4 mr-2" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  {canRepeat ? "Run Again" : "Run Now"}
                </Button>
              )}

              {/* Secondary actions */}
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleDeleteTask(task.id)}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Delete
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                onClick={() => {
                  setEditMode(true);
                  setEditTitle(task.title);
                  setEditDescription(task.description || "");
                  setEditRecurring(task.is_recurring);
                }}
              >
                  <Pencil className="w-3.5 h-3.5 mr-1" />
                  Edit
                </Button>
                {canRun && !canRepeat && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-muted-foreground"
                    onClick={() => handleRejectTask(task.id)}
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    Reject
                  </Button>
                )}
              </div>
            </>
          )}

          {project.task_credits <= 0 && (
            <p className="text-xs text-muted-foreground text-center">
              Out of credits.{" "}
              <button
                type="button"
                onClick={onBuyCredits}
                className="font-medium text-primary underline underline-offset-2 hover:no-underline"
              >
                Subscribe to run tasks →
              </button>
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Task list for a tab ────────────────────────────────────────────
  function TaskList({
    items,
    emptyLabel,
    showReorder,
  }: {
    items: Task[];
    emptyLabel: string;
    showReorder?: boolean;
  }) {
    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
          <ListTodo className="w-8 h-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        </div>
      );
    }
    return (
      <div className="space-y-1.5 p-1">
        {items.map((task, idx) => (
          <TaskCard
            key={task.id}
            task={task}
            showReorder={showReorder}
            idx={idx}
            totalInGroup={items.length}
          />
        ))}
      </div>
    );
  }

  const totalActive = todoTasks.length + inProgressTasks.length;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-3xl w-full h-[100dvh] sm:h-[85vh] flex flex-col p-0 gap-0 overflow-hidden rounded-none sm:rounded-lg">
          {/* Header */}
          <DialogHeader className="px-3 sm:px-5 pt-4 pb-3 border-b shrink-0 flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-base font-semibold">Task Queue</DialogTitle>
              {totalActive > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {totalActive} active
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {onCreateTask && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={onCreateTask}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  New Task
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                onClick={onRefresh}
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </DialogHeader>

          {/* Body: two-column split (stacked on mobile) */}
          <div className="flex flex-col sm:flex-row flex-1 overflow-hidden">
            {/* Left: Task list */}
            <div className={`w-full sm:w-[340px] shrink-0 flex flex-col sm:border-r overflow-hidden ${selectedTask ? "hidden sm:flex" : "flex"}`}>
              <Tabs defaultValue="todo" className="flex flex-col h-full">
                <div className="px-3 pt-3 pb-0 shrink-0">
                  <TabsList className="w-full h-auto p-0.5 bg-muted/60 grid grid-cols-3 gap-0.5">
                    <TabsTrigger value="todo" className="text-[11px] h-6.5 px-2 py-1 data-[state=active]:shadow-sm">
                      To Do
                      {todoTasks.length > 0 && (
                        <span className="ml-1 bg-blue-100 text-blue-700 rounded-full text-[9px] px-1.5 font-medium">
                          {todoTasks.length}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="inprogress" className="text-[11px] h-6.5 px-2 py-1 data-[state=active]:shadow-sm">
                      Active
                      {inProgressTasks.length > 0 && (
                        <span className="ml-1 bg-yellow-100 text-yellow-700 rounded-full text-[9px] px-1.5 font-medium">
                          {inProgressTasks.length}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="completed" className="text-[11px] h-6.5 px-2 py-1 data-[state=active]:shadow-sm">
                      Done
                      {completedTasks.length > 0 && (
                        <span className="ml-1 bg-green-100 text-green-700 rounded-full text-[9px] px-1.5 font-medium">
                          {completedTasks.length}
                        </span>
                      )}
                    </TabsTrigger>
                  </TabsList>
                <TabsList
                  variant="line"
                  className="mt-1 w-full h-auto p-0 bg-transparent grid grid-cols-2 gap-0.5"
                >
                  <TabsTrigger
                    value="recurring"
                    className="text-[11px] h-6.5 px-2 py-1 data-[state=active]:shadow-sm bg-transparent border-0 rounded-md hover:bg-muted"
                    asChild={false}
                  >
                    <span className="flex items-center gap-1">
                      <RefreshCw className="w-2.5 h-2.5" />
                      Recurring
                      {recurringTasks.length > 0 && (
                        <span className="ml-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[9px] px-1.5 font-medium">
                          {recurringTasks.length}
                        </span>
                      )}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="failed"
                    className="text-[11px] h-6.5 px-2 py-1 data-[state=active]:shadow-sm bg-transparent border-0 rounded-md hover:bg-muted"
                  >
                    Failed
                    {failedTasks.length > 0 && (
                      <span className="ml-1 bg-red-100 text-red-600 rounded-full text-[9px] px-1.5 font-medium">
                        {failedTasks.length}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>
                </div>

                <div className="flex-1 overflow-hidden mt-2">
                  <ScrollArea className="h-full">
                    <TabsContent value="todo" className="mt-0">
                      <TaskList
                        items={todoTasks}
                        emptyLabel="No tasks in queue. Chat with Artha to create tasks."
                        showReorder
                      />
                    </TabsContent>
                    <TabsContent value="recurring" className="mt-0">
                      <TaskList items={recurringTasks} emptyLabel="No recurring tasks yet." />
                    </TabsContent>
                    <TabsContent value="inprogress" className="mt-0">
                      <TaskList items={inProgressTasks} emptyLabel="No tasks currently running." />
                    </TabsContent>
                    <TabsContent value="completed" className="mt-0">
                      <TaskList items={completedTasks} emptyLabel="No completed tasks yet." />
                    </TabsContent>
                    <TabsContent value="failed" className="mt-0">
                      <TaskList items={failedTasks} emptyLabel="No rejected or failed tasks." />
                    </TabsContent>
                  </ScrollArea>
                </div>
              </Tabs>
            </div>

            {/* Right: Task detail */}
            <div className={`flex-1 overflow-hidden ${selectedTask ? "flex flex-col" : "hidden sm:flex sm:flex-col"}`}>
              {selectedTask ? (
                <>
                  <button
                    onClick={() => setSelectedTask(null)}
                    className="sm:hidden flex items-center gap-1.5 px-4 py-2.5 border-b text-sm text-muted-foreground hover:text-foreground"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                    Back to list
                  </button>
                  <TaskDetailPanel task={selectedTask} />
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-8">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                    <ListTodo className="w-6 h-6 text-muted-foreground/50" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Select a task</p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      Click any task on the left to view details, edit, or run it.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {confirmTask && (
        <OutreachConfirmationModal
          isOpen={!!confirmTask}
          onClose={() => setConfirmTask(null)}
          taskId={confirmTask.id}
          projectId={project.id}
          emails={parseTaskEmails(confirmTask)}
          fromAddress={`${project.name} <${project.company_email || `${project.slug}@tryartha.com`}>`}
          sendDisabledReason={emailSendBlockedReason}
          onConfirm={async (emails) => {
            await fetch("/api/tasks/confirm-outreach", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                taskId: confirmTask.id,
                projectId: project.id,
                emails,
                action: "send",
              }),
            });
            setConfirmTask(null);
            onRefresh();
          }}
          onCancel={async () => {
             await fetch("/api/tasks/confirm-outreach", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                taskId: confirmTask.id,
                projectId: project.id,
                action: "cancel",
              }),
            });
            setConfirmTask(null);
            onRefresh();
          }}
        />
      )}
    </>
  );
}
