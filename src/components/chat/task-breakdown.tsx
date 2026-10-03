"use client";

import { cn } from "@/lib/utils";
import {
  Search,
  Globe,
  Mail,
  ListTodo,
  Twitter,
  CheckCircle2,
  Circle,
  XCircle,
  StopCircle,
  Zap,
  ArrowUpRight,
  RotateCcw,
} from "lucide-react";
import { ArthaLoader } from "@/components/icons/artha-loader";
import { StreamingActivityBox } from "@/components/chat/streaming-activity-box";
import type { TaskBreakdownItem } from "@/hooks/use-chat";

interface TaskBreakdownProps {
  items: TaskBreakdownItem[];
  isComplete: boolean;
  completionMessage?: string;
  onHashNavigate?: (hash: string) => void;
  onRetry?: (message: string) => void;
}

const AGENT_CONFIG: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; label: string; chipClass: string }
> = {
  research: {
    icon: Search,
    label: "Research",
    chipClass:
      "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400",
  },
  website_builder: {
    icon: Globe,
    label: "Website",
    chipClass:
      "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-400",
  },
  email_writer: {
    icon: Mail,
    label: "Email",
    chipClass:
      "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400",
  },
  task_generator: {
    icon: ListTodo,
    label: "Tasks",
    chipClass:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400",
  },
  twitter: {
    icon: Twitter,
    label: "Twitter",
    chipClass:
      "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400",
  },
};

const DEFAULT_CONFIG = {
  icon: ListTodo,
  label: "Agent",
  chipClass: "bg-muted text-muted-foreground",
};

function AgentChip({ agent }: { agent: string }) {
  const config = AGENT_CONFIG[agent] || DEFAULT_CONFIG;
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 select-none",
        config.chipClass
      )}
    >
      <Icon className="w-2.5 h-2.5" />
      {config.label}
    </span>
  );
}

export function TaskBreakdown({
  items,
  isComplete,
  completionMessage,
  onHashNavigate,
  onRetry,
}: TaskBreakdownProps) {
  const runningCount = items.filter((i) => i.status === "running").length;
  const completedCount = items.filter((i) => i.status === "completed").length;
  const failedCount = items.filter((i) => i.status === "failed").length;
  const cancelledCount = items.filter((i) => i.status === "cancelled").length;
  const totalCount = items.length;
  const multipleRunning = runningCount > 1;

  return (
    <div className="w-full">
      {/* ── Header ─────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-border/60">
        <div className="flex items-center gap-1.5">
          <Zap
            className={cn(
              "w-3 h-3 shrink-0 transition-colors",
              isComplete
                ? cancelledCount > 0 ? "text-muted-foreground" : "text-emerald-600 dark:text-emerald-400"
                : "text-primary"
            )}
          />
          <span className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">
            {isComplete
              ? cancelledCount > 0
                ? `Cancelled${completedCount > 0 ? ` · ${completedCount} completed` : ""}`
                : failedCount > 0
                ? `Done · ${failedCount} failed`
                : "All done"
              : runningCount > 0
              ? multipleRunning
                ? `${runningCount} running in parallel`
                : "Working..."
              : "Starting up..."}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground/70 tabular-nums font-mono">
          {completedCount}/{totalCount}
        </span>
      </div>

      {/* ── Task rows ──────────────────────────────── */}
      <div className="space-y-1.5">
        {items.map((item, index) => (
          <div
            key={item.id}
            className={cn(
              "relative rounded-md border-l-2 px-2.5 py-2 transition-all duration-300",
              "animate-in fade-in slide-in-from-bottom-1",
              item.status === "pending" &&
                "border-l-border/40 opacity-50",
              item.status === "running" &&
                "border-l-primary bg-primary/[0.04]",
              item.status === "completed" &&
                "border-l-emerald-500/70 bg-emerald-500/[0.04]",
              item.status === "failed" &&
                "border-l-destructive bg-destructive/[0.04]",
              item.status === "cancelled" &&
                "border-l-border/40 opacity-50"
            )}
            style={{
              animationDelay: `${index * 60}ms`,
              animationFillMode: "backwards",
            }}
          >
            {/* Row: icon + description + chip */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="shrink-0 mt-px">
                {item.status === "completed" && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                )}
                {item.status === "running" && (
                  <ArthaLoader size={14} className="text-primary" />
                )}
                {item.status === "failed" && (
                  <XCircle className="w-3.5 h-3.5 text-destructive" />
                )}
                {item.status === "pending" && (
                  <Circle className="w-3.5 h-3.5 text-muted-foreground/40" />
                )}
                {item.status === "cancelled" && (
                  <StopCircle className="w-3.5 h-3.5 text-muted-foreground/50" />
                )}
              </div>

              <span
                className={cn(
                  "text-xs leading-snug flex-1 min-w-0 truncate",
                  item.status === "completed" && "text-foreground",
                  item.status === "running" && "text-foreground font-medium",
                  item.status === "failed" && "text-destructive",
                  item.status === "pending" && "text-muted-foreground",
                  item.status === "cancelled" && "text-muted-foreground line-through"
                )}
                title={item.description}
              >
                {item.description}
              </span>

              <AgentChip agent={item.agent} />
            </div>

            {/* Live streaming activity (while running) */}
            {item.status === "running" && item.thinkingHistory && item.thinkingHistory.length > 0 && (
              <div className="mt-1.5 pl-[22px]">
                <StreamingActivityBox
                  lines={item.thinkingHistory}
                  maxLines={5}
                />
              </div>
            )}

            {/* Summary (only when completed) */}
            {item.status === "completed" && item.summary && (
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed line-clamp-2 pl-[22px]">
                {item.summary}
              </p>
            )}

            {/* Links */}
            {item.status === "completed" && item.links && item.links.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1 pl-[22px]">
                {item.links.map((link, i) => {
                  const isHash = link.url.startsWith("#");
                  return (
                    <a
                      key={i}
                      href={link.url}
                      {...(!isHash && { target: "_blank", rel: "noopener noreferrer" })}
                      className="inline-flex items-center gap-0.5 text-[11px] text-primary font-medium hover:underline cursor-pointer"
                      onClick={isHash ? (e) => {
                        e.preventDefault();
                        onHashNavigate?.(link.url.replace("#", ""));
                      } : undefined}
                    >
                      {link.label}
                      <ArrowUpRight className="w-2.5 h-2.5" />
                    </a>
                  );
                })}
              </div>
            )}

            {/* Error */}
            {item.status === "failed" && item.error && (
              <p className="text-[11px] text-destructive mt-1 pl-[22px] leading-relaxed">
                {item.error}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* ── Retry failed tasks ─────────────────────── */}
      {isComplete && failedCount > 0 && onRetry && (
        <div className="mt-2.5 pt-2 border-t border-border/50">
          <button
            onClick={() => {
              const failedDescs = items
                .filter((i) => i.status === "failed")
                .map((i) => i.description)
                .join(", ");
              onRetry(`Retry the failed tasks: ${failedDescs}`);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Retry {failedCount} failed {failedCount === 1 ? "task" : "tasks"}
          </button>
        </div>
      )}

      {/* ── Completion footer ──────────────────────── */}
      {isComplete && completionMessage && (
        <div className={cn("mt-3 pt-2.5 border-t border-border/50", failedCount > 0 && onRetry && "mt-2")}>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {completionMessage}
          </p>
        </div>
      )}
    </div>
  );
}
