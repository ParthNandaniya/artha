"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bot,
  Zap,
  Mail,
  Search,
  FileText,
  BarChart3,
  Twitter,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  SkipForward,
  Brain,
} from "lucide-react";
import { useAgentActivity, type AgentActivity } from "@/hooks/use-agent-activity";
import type { Project } from "@/lib/types";

// ── Helpers ──

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  const diffWeek = Math.floor(diffDay / 7);
  return `${diffWeek}w ago`;
}

function getDayGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const weekAgo = new Date(today.getTime() - 7 * 86_400_000);
  const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (itemDate.getTime() >= today.getTime()) return "Today";
  if (itemDate.getTime() >= yesterday.getTime()) return "Yesterday";
  if (itemDate.getTime() >= weekAgo.getTime()) return "Earlier this week";
  return "Older";
}

function groupByDay(activities: AgentActivity[]): Map<string, AgentActivity[]> {
  const groups = new Map<string, AgentActivity[]>();
  for (const a of activities) {
    const key = getDayGroup(a.created_at);
    const list = groups.get(key) ?? [];
    list.push(a);
    groups.set(key, list);
  }
  return groups;
}

const AGENT_ICONS: Record<string, React.ElementType> = {
  orchestrator: Bot,
  research: Search,
  email: Mail,
  email_writer: Mail,
  email_replier: Mail,
  twitter: Twitter,
  social_media_manager: Twitter,
  website_builder: FileText,
  analytics: BarChart3,
  analytics_agent: BarChart3,
  lead_finder: Users,
  task_generator: Zap,
  content_planner: FileText,
  blog_writer: FileText,
  seo_agent: Search,
  competitive_monitor: BarChart3,
  database_manager: Brain,
  stripe_agent: Zap,
  video_generator: Zap,
  sales_sequencer: Users,
};

const ACTION_STYLES: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  decided: { variant: "default", label: "Decided" },
  executed: { variant: "secondary", label: "Executed" },
  completed: { variant: "secondary", label: "Completed" },
  skipped: { variant: "outline", label: "Skipped" },
  failed: { variant: "destructive", label: "Failed" },
  started: { variant: "default", label: "Started" },
  scheduled: { variant: "outline", label: "Scheduled" },
};

function getActionIcon(action: string) {
  switch (action) {
    case "completed":
    case "executed":
      return CheckCircle2;
    case "failed":
      return XCircle;
    case "skipped":
      return SkipForward;
    default:
      return Clock;
  }
}

function agentLabel(agentType: string): string {
  return agentType
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── Summary Stats ──

function SummaryStats({ activities }: { activities: AgentActivity[] }) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart = todayStart - 7 * 86_400_000;

  const actionsToday = activities.filter((a) => new Date(a.created_at).getTime() >= todayStart).length;
  const actionsWeek = activities.filter((a) => new Date(a.created_at).getTime() >= weekStart).length;

  // Estimate credits from metadata if available
  const creditsUsed = activities.reduce((sum, a) => {
    const cost = typeof a.metadata?.credits_cost === "number" ? a.metadata.credits_cost : 0;
    return sum + cost;
  }, 0);

  return (
    <div className="grid grid-cols-3 gap-3">
      <Card>
        <CardContent className="pt-4 pb-3 px-4">
          <p className="text-2xl font-semibold text-foreground">{actionsToday}</p>
          <p className="text-xs text-muted-foreground">Actions today</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3 px-4">
          <p className="text-2xl font-semibold text-foreground">{actionsWeek}</p>
          <p className="text-xs text-muted-foreground">This week</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3 px-4">
          <p className="text-2xl font-semibold text-foreground">{creditsUsed > 0 ? creditsUsed.toFixed(1) : "--"}</p>
          <p className="text-xs text-muted-foreground">Credits used</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Activity Item ──

function ActivityItem({ activity }: { activity: AgentActivity }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = AGENT_ICONS[activity.agent_type] ?? Bot;
  const ActionIcon = getActionIcon(activity.action);
  const style = ACTION_STYLES[activity.action] ?? { variant: "outline" as const, label: activity.action };

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="flex items-start gap-3 w-full text-left py-3 px-1 rounded-md hover:bg-accent/50 transition-colors cursor-pointer"
    >
      {/* Icon */}
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-foreground">{activity.title}</span>
          <Badge variant={style.variant} className="text-[10px] px-1.5 py-0 h-4 leading-none">
            <ActionIcon className="h-2.5 w-2.5 mr-0.5" />
            {style.label}
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{agentLabel(activity.agent_type)}</span>
          <span>-</span>
          <span>{timeAgo(activity.created_at)}</span>
        </div>

        {activity.description && (
          <p
            className={
              expanded
                ? "text-xs text-muted-foreground mt-1"
                : "text-xs text-muted-foreground mt-1 line-clamp-2"
            }
          >
            {activity.description}
          </p>
        )}
      </div>
    </button>
  );
}

// ── Loading Skeleton ──

function ActivitySkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-4 w-24" />
          {[1, 2].map((j) => (
            <div key={j} className="flex items-start gap-3 py-3 px-1">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Main Panel ──

interface AgentActivityPanelProps {
  project: Project;
}

export function AgentActivityPanel({ project }: AgentActivityPanelProps) {
  const { data: activities = [], isLoading } = useAgentActivity(project.id);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Agent Activity</h2>
          <p className="text-sm text-muted-foreground">Your AI agents working autonomously</p>
        </div>
        <ActivitySkeleton />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Agent Activity</h2>
          <p className="text-sm text-muted-foreground">Your AI agents working autonomously</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <Bot className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No agent activity yet. Your AI agents will start working autonomously soon.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const grouped = groupByDay(activities);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Agent Activity</h2>
        <p className="text-sm text-muted-foreground">Your AI agents working autonomously</p>
      </div>

      <SummaryStats activities={activities} />

      <div className="space-y-6">
        {Array.from(grouped.entries()).map(([day, items]) => (
          <Card key={day}>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {day}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-2 divide-y divide-border">
              {items.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
