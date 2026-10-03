"use client";

import { useEffect, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OutreachConfirmationModal } from "@/components/modals/outreach-confirmation-modal";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  GripVertical,
  ListTodo,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { ArthaLoader } from "@/components/icons/artha-loader";
import type { OutreachEmail, Project, Task } from "@/lib/types";
import { canSendProjectEmail, getEmailSetupBlockedReason } from "@/lib/project-integrations";
import { useReorderTasks, useConfirmOutreach } from "@/hooks/use-tasks";
import { useInlineAction } from "@/hooks/use-inline-action";

interface TasksPanelProps {
  tasks: Task[];
  project: Project;
  onRunTask: (taskId: string) => void;
  onViewTask: (taskId: string) => void;
  onViewDocument: (docId: string) => void;
  onRefresh?: () => void;
  onSubscribe?: () => void;
  onCreateTask?: () => void;
  checkoutLoading?: boolean;
}

type FilterType = "all" | "queued" | "running" | "completed" | "failed";

const STATUS_CONFIG: Record<string, {
  label: string;
  leftBorder: string;
  bg: string;
  pillBg: string;
  pillText: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = {
  queued: {
    label: "Queued",
    leftBorder: "border-l-blue-400",
    bg: "bg-card",
    pillBg: "bg-blue-50 border-blue-200",
    pillText: "text-blue-700",
    Icon: Clock,
  },
  pending: {
    label: "Pending",
    leftBorder: "border-l-slate-300",
    bg: "bg-card",
    pillBg: "bg-slate-100 border-slate-200",
    pillText: "text-slate-600",
    Icon: Clock,
  },
  running: {
    label: "Running",
    leftBorder: "border-l-yellow-400",
    bg: "bg-yellow-50/40",
    pillBg: "bg-yellow-50 border-yellow-200",
    pillText: "text-yellow-700",
    Icon: Clock,
  },
  pending_confirmation: {
    label: "Needs Review",
    leftBorder: "border-l-amber-400",
    bg: "bg-amber-50/40",
    pillBg: "bg-amber-50 border-amber-200",
    pillText: "text-amber-700",
    Icon: AlertCircle,
  },
  completed: {
    label: "Completed",
    leftBorder: "border-l-green-400",
    bg: "bg-card",
    pillBg: "bg-green-50 border-green-200",
    pillText: "text-green-700",
    Icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    leftBorder: "border-l-red-400",
    bg: "bg-card",
    pillBg: "bg-red-50 border-red-200",
    pillText: "text-red-700",
    Icon: XCircle,
  },
  rejected: {
    label: "Rejected",
    leftBorder: "border-l-zinc-300",
    bg: "bg-card",
    pillBg: "bg-zinc-100 border-zinc-200",
    pillText: "text-zinc-500",
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

interface TaskRowProps {
  task: Task;
  project: Project;
  queuePosition?: number;
  isTonightTask?: boolean;
  canSendEmails: boolean;
  isDragging?: boolean;
  isQueueSaving?: boolean;
  dragHandle?: React.ReactNode;
  onViewTask: (taskId: string) => void;
  onViewDocument: (docId: string) => void;
  onRunTask: (taskId: string) => void;
  onOpenConfirm: (task: Task) => void;
}

function StatusPill({ status }: { status: string }) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;
  const { Icon, pillBg, pillText, label } = config;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${pillBg} ${pillText}`}
    >
      {status === "running" ? (
        <ArthaLoader size={10} className="text-yellow-700" />
      ) : (
        <Icon className="h-2.5 w-2.5" />
      )}
      {label}
    </span>
  );
}

function TagBadge({ tag }: { tag: string | null }) {
  if (!tag) return null;
  const color = TAG_COLORS[tag] || "bg-gray-100 text-gray-600";

  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${color}`}>
      {tag.replace("-", " ")}
    </span>
  );
}

function sortQueuedTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const priorityDiff = (a.priority || 0) - (b.priority || 0);
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

function sortCompletedTasks(tasks: Task[]) {
  return [...tasks].sort(
    (a, b) =>
      new Date(b.completed_at || b.created_at).getTime() -
      new Date(a.completed_at || a.created_at).getTime()
  );
}

function applyQueuedOrder(tasks: Task[], orderedQueuedIds: string[]) {
  const priorityById = new Map(
    orderedQueuedIds.map((taskId, priorityIndex) => [taskId, priorityIndex + 1])
  );

  return tasks.map((task) =>
    priorityById.has(task.id)
      ? { ...task, priority: priorityById.get(task.id)! }
      : task
  );
}

function TaskRow({
  task,
  project,
  queuePosition,
  isTonightTask = false,
  canSendEmails,
  isDragging = false,
  isQueueSaving = false,
  dragHandle,
  onViewTask,
  onViewDocument,
  onRunTask,
  onOpenConfirm,
}: TaskRowProps) {
  const config = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
  const isQueuedTask = task.status === "queued" || task.status === "pending";
  const isPendingConfirmation = task.status === "pending_confirmation";

  return (
    <div
      onClick={() => onViewTask(task.id)}
      className={`group flex cursor-pointer items-stretch gap-0 rounded-lg border border-l-4 transition-all ${
        config.leftBorder
      } ${config.bg} ${isPendingConfirmation ? "ring-1 ring-amber-200" : ""} ${
        isDragging ? "scale-[1.01] shadow-lg" : "hover:shadow-sm"
      }`}
    >
      {dragHandle && (
        <div
          className="flex shrink-0 items-center pl-2 pr-1"
          onClick={(event) => event.stopPropagation()}
        >
          {dragHandle}
        </div>
      )}

      <div className="min-w-0 flex-1 px-4 py-3">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {typeof queuePosition === "number" && (
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              #{queuePosition + 1}
            </span>
          )}
          <StatusPill status={task.status} />
          {task.is_recurring && (
            <span className="flex shrink-0 items-center gap-0.5 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
              <RefreshCw className="h-2.5 w-2.5" /> Recurring
            </span>
          )}
          {isTonightTask && (
            <span className="shrink-0 rounded bg-slate-950 px-1.5 py-0.5 text-[10px] font-medium text-white">
              Tonight
            </span>
          )}
        </div>

        <p className="text-sm font-medium leading-snug">{task.title}</p>

        {task.summary && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.summary}</p>
        )}

        {!task.summary && task.description && (
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{task.description}</p>
        )}

        {(task.output_document_id || task.output_url) && (
          <div className="mt-2 flex gap-3">
            {task.output_document_id && (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onViewDocument(task.output_document_id!);
                }}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <FileText className="h-3 w-3" />
                View Document
              </button>
            )}
            {task.output_url && (
              <a
                href={task.output_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                View Output
              </a>
            )}
          </div>
        )}

        {task.completed_at && (
          <p className="mt-1.5 text-[11px] text-muted-foreground/60">
            {new Date(task.completed_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        )}
      </div>

      <div className="shrink-0 self-center py-3 pr-3">
        <div className="flex items-center gap-2">
          {isPendingConfirmation && (
            <Button
              size="sm"
              className="h-7 bg-amber-600 text-xs text-white hover:bg-amber-700"
              onClick={(event) => {
                event.stopPropagation();
                onOpenConfirm(task);
              }}
            >
              {canSendEmails ? "Review & Send" : "Review Draft"}
            </Button>
          )}

          {isQueuedTask && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs sm:opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(event) => {
                event.stopPropagation();
                onRunTask(task.id);
              }}
              disabled={project.task_credits <= 0 || isQueueSaving}
              title="Run this task now"
            >
              <Play className="mr-1 h-3 w-3" />
              Run Now
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface SortableQueuedTaskRowProps extends Omit<TaskRowProps, "dragHandle" | "isDragging"> {
  queuePosition: number;
  disabled?: boolean;
}

function SortableQueuedTaskRow({
  task,
  project,
  queuePosition,
  isTonightTask = false,
  canSendEmails,
  isQueueSaving = false,
  onViewTask,
  onViewDocument,
  onRunTask,
  onOpenConfirm,
  disabled = false,
}: SortableQueuedTaskRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      <TaskRow
        task={task}
        project={project}
        queuePosition={queuePosition}
        isTonightTask={isTonightTask}
        canSendEmails={canSendEmails}
        isDragging={isDragging}
        isQueueSaving={isQueueSaving}
        onViewTask={onViewTask}
        onViewDocument={onViewDocument}
        onRunTask={onRunTask}
        onOpenConfirm={onOpenConfirm}
        dragHandle={
          <button
            type="button"
            {...attributes}
            {...listeners}
            onClick={(event) => event.stopPropagation()}
            disabled={disabled}
            aria-label={`Drag ${task.title}`}
            title={disabled ? "Saving queue order..." : "Drag to reorder"}
            className="inline-flex h-8 w-8 cursor-grab items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        }
      />
    </div>
  );
}

export function TasksPanel({
  tasks,
  project,
  onRunTask,
  onViewTask,
  onViewDocument,
  onRefresh,
  onSubscribe,
  onCreateTask,
  checkoutLoading,
}: TasksPanelProps) {
  const isSubscribed = project.subscription_status === "active";
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks);
  const [filter, setFilter] = useState<FilterType>("all");
  const [confirmTask, setConfirmTask] = useState<Task | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [savingQueue, setSavingQueue] = useState(false);
  const canSendEmails = canSendProjectEmail(project);
  const emailSendBlockedReason = getEmailSetupBlockedReason(project);
  
  const { mutateAsync: reorderTasks } = useReorderTasks(project.id);
  const { mutateAsync: confirmOutreach } = useConfirmOutreach(project.id);

  // AI Suggest Next Steps
  const [suggestions, setSuggestions] = useState<{ title: string; description: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { execute: fetchSuggestions, loading: suggestLoading } = useInlineAction<{
    suggestions: { title: string; description: string }[];
  }>({
    projectId: project.id,
    action: "suggest_next_steps",
    onSuccess: (result) => {
      if (result.suggestions) {
        setSuggestions(result.suggestions);
        setShowSuggestions(true);
      }
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  const queued = sortQueuedTasks(
    localTasks.filter((task) => task.status === "queued" || task.status === "pending")
  );
  const active = localTasks.filter(
    (task) => task.status === "running" || task.status === "pending_confirmation"
  );
  const completed = sortCompletedTasks(
    localTasks.filter((task) => task.status === "completed")
  );
  const failed = sortCompletedTasks(
    localTasks.filter((task) => task.status === "failed" || task.status === "rejected")
  );
  const recentCompleted = completed.slice(0, 10);
  const recentFailed = failed.slice(0, 5);
  const tonightTaskId =
    filter === "queued"
      ? queued[0]?.id ?? null
      : filter === "running"
        ? active[0]?.id ?? null
        : filter === "completed"
          ? completed[0]?.id ?? null
          : filter === "failed"
            ? failed[0]?.id ?? null
            : active[0]?.id ?? queued[0]?.id ?? recentCompleted[0]?.id ?? recentFailed[0]?.id ?? null;

  const visibleCount =
    filter === "all"
      ? active.length + queued.length + recentCompleted.length + recentFailed.length
      : filter === "queued"
        ? queued.length
        : filter === "running"
          ? active.length
          : filter === "completed"
            ? completed.length
            : failed.length;

  const filters: { key: FilterType; label: string; count?: number; countColor?: string }[] = [
    { key: "all", label: "All" },
    { key: "queued", label: "Queued", count: queued.length, countColor: "bg-blue-100 text-blue-700" },
    { key: "running", label: "Active", count: active.length, countColor: "bg-yellow-100 text-yellow-700" },
    { key: "completed", label: "Done", count: completed.length, countColor: "bg-green-100 text-green-700" },
    { key: "failed", label: "Failed", count: failed.length, countColor: "bg-red-100 text-red-600" },
  ];

  async function persistQueuedOrder(orderedQueuedIds: string[], previousTasks: Task[]) {
    try {
      await reorderTasks(orderedQueuedIds);
      onRefresh?.();
    } catch (error) {
      console.error("Failed to reorder tasks:", error);
      setLocalTasks(previousTasks);
    } finally {
      setSavingQueue(false);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggingTaskId(String(event.active.id));
  }

  function handleDragCancel() {
    setDraggingTaskId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingTaskId(null);

    if (savingQueue) return;
    if (!event.over || event.active.id === event.over.id) return;

    const activeIndex = queued.findIndex((task) => task.id === event.active.id);
    const overIndex = queued.findIndex((task) => task.id === event.over?.id);

    if (activeIndex === -1 || overIndex === -1) return;

    const reorderedQueued = arrayMove(queued, activeIndex, overIndex);
    const previousTasks = localTasks;

    setSavingQueue(true);
    setLocalTasks(applyQueuedOrder(localTasks, reorderedQueued.map((task) => task.id)));
    void persistQueuedOrder(reorderedQueued.map((task) => task.id), previousTasks);
  }

  function renderStaticRows(items: Task[]) {
    return items.map((task) => {
      const queuePosition =
        task.status === "queued" || task.status === "pending"
          ? queued.findIndex((queuedTask) => queuedTask.id === task.id)
          : undefined;

      return (
        <TaskRow
          key={task.id}
          task={task}
          project={project}
          queuePosition={queuePosition}
          isTonightTask={task.id === tonightTaskId}
          canSendEmails={canSendEmails}
          isQueueSaving={savingQueue}
          onViewTask={onViewTask}
          onViewDocument={onViewDocument}
          onRunTask={onRunTask}
          onOpenConfirm={setConfirmTask}
        />
      );
    });
  }

  function renderQueuedRows(items: Task[]) {
    if (items.length === 0) return null;

    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((task) => task.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((task, index) => (
            <SortableQueuedTaskRow
              key={task.id}
              task={task}
              project={project}
              queuePosition={index}
              isTonightTask={task.id === tonightTaskId}
              canSendEmails={canSendEmails}
              isQueueSaving={savingQueue}
              onViewTask={onViewTask}
              onViewDocument={onViewDocument}
              onRunTask={onRunTask}
              onOpenConfirm={setConfirmTask}
              disabled={savingQueue}
            />
          ))}
        </SortableContext>
      </DndContext>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 border-b bg-background px-4 sm:px-6 pb-4 pt-5">
        <div className="mb-4 flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
          <div>
            <h2 className="text-base font-semibold">Tasks</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {queued.length > 0 ? `${queued.length} queued · ` : ""}
              {active.length > 0 ? `${active.length} running · ` : ""}
              {completed.length} completed
            </p>
            {(filter === "all" || filter === "queued") && queued.length > 1 && (
              <p className="mt-1 text-[11px] text-muted-foreground/80">
                {draggingTaskId
                  ? "Drop to set the new queue order."
                  : "Drag queued tasks from the left handle to reorder them."}
                {savingQueue ? " Saving..." : ""}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchSuggestions()}
              disabled={suggestLoading}
            >
              {suggestLoading ? (
                <ArthaLoader size={14} className="mr-1.5 text-current" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              {suggestLoading ? "Thinking..." : "AI Suggest"}
            </Button>
            {onCreateTask && (
              <Button size="sm" onClick={onCreateTask}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New Task
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {filters.map(({ key, label, count, countColor }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                filter === key
                  ? "bg-foreground text-background shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              }`}
            >
              {label}
              {count !== undefined && count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${
                    filter === key ? "bg-background/20 text-background" : countColor
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-4xl space-y-2 px-4 sm:px-6 py-4">
          {showSuggestions && suggestions.length > 0 && (
            <div className="mb-4 rounded-lg border border-primary/20 bg-primary/[0.02] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Suggested Next Steps
                </h3>
                <button
                  onClick={() => { setShowSuggestions(false); setSuggestions([]); }}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                {suggestions.map((s, i) => (
                  <div
                    key={i}
                    className="group flex items-start justify-between gap-3 rounded-md border bg-background p-3 transition-colors hover:border-primary/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{s.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{s.description}</p>
                    </div>
                    {onCreateTask && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-xs opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => {
                          // Pre-fill via the create task modal by dispatching a custom event
                          window.dispatchEvent(new CustomEvent("artha:create-task", { detail: s }));
                          onCreateTask();
                        }}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Add
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {!isSubscribed && onSubscribe && (
            <div className="mb-4 rounded-lg border border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10 p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-base mb-1">Unlock Automatic Task Execution</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Subscribe to get 35 task credits every month and automatic nightly runs.
                    Your AI company will execute tasks while you sleep.
                  </p>
                  <div className="flex items-center gap-3">
                    <Button onClick={onSubscribe} disabled={checkoutLoading} size="sm">
                      {checkoutLoading ? "Redirecting..." : "Subscribe — $49/mo"}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Cancel anytime
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
          {visibleCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                <ListTodo className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No tasks yet</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Chat with Artha to generate tasks for your project.
              </p>
            </div>
          ) : (
            <>
              {filter === "all" && (
                <>
                  {renderStaticRows(active)}
                  {renderQueuedRows(queued)}
                  {renderStaticRows(recentCompleted)}
                  {renderStaticRows(recentFailed)}
                </>
              )}

              {filter === "queued" && renderQueuedRows(queued)}
              {filter === "running" && renderStaticRows(active)}
              {filter === "completed" && renderStaticRows(completed)}
              {filter === "failed" && renderStaticRows(failed)}
            </>
          )}
        </div>
      </ScrollArea>

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
            await confirmOutreach({
              taskId: confirmTask.id,
              emails,
              action: "send",
            });

            setConfirmTask(null);
            onRefresh?.();
          }}
          onCancel={async () => {
            await confirmOutreach({
              taskId: confirmTask.id,
              action: "cancel",
            });

            setConfirmTask(null);
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
}

function parseTaskEmails(task: Task): OutreachEmail[] {
  if (!task.result) return [];

  try {
    const result = typeof task.result === "string" ? JSON.parse(task.result) : task.result;
    return (result.emails || []).map((email: Record<string, string>) => ({
      to: email.to || "",
      toName: email.toName,
      company: email.company,
      role: email.role,
      subject: email.subject || "",
      body: email.body || "",
    }));
  } catch {
    return [];
  }
}
