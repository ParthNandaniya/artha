"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { X, Pencil, Loader2, Sparkles } from "lucide-react";
import { useFounderDirectives, useUpdateFounderDirectives, useGenerateDirectives } from "@/hooks/use-direction";
import { useAnalytics } from "@/hooks/use-analytics";
import { useLeads } from "@/hooks/use-leads";
import { useOutreachMetrics } from "@/hooks/use-outreach-metrics";
import { MorningBriefing } from "@/components/dashboard/morning-briefing";
import type { Project, Document, Task } from "@/lib/types";

interface OverviewPanelProps {
  project: Project;
  documents: Document[];
  tasks: Task[];
  onSubscribe: (plan?: string) => void;
  onViewDocument: (id: string) => void;
  onSwitchPanel: (panel: string) => void;
  onSendChat?: (message: string) => void;
}

export function OverviewPanel({
  project,
  documents,
  tasks,
  onSubscribe,
  onViewDocument,
  onSwitchPanel,
  onSendChat,
}: OverviewPanelProps) {
  const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
  const { data: analyticsData } = useAnalytics(project.id, 7);
  const { data: leads = [] } = useLeads(project.id);
  const { data: outreach } = useOutreachMetrics(project.id);
  const completedTasks = tasks.filter((t) => t.status === "completed");
  const queuedTasks = [...tasks]
    .filter((t) => t.status === "queued")
    .sort((a, b) => {
      const priorityDiff = (a.priority || 0) - (b.priority || 0);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  const tonightTaskId =
    project.task_credits > 0 ? queuedTasks[0]?.id ?? null : null;
  const recentTasks = [
    ...(tonightTaskId ? tasks.filter((task) => task.id === tonightTaskId) : []),
    ...tasks.filter((task) => task.id !== tonightTaskId),
  ].slice(0, 4);
  const missionDoc = documents.find((d) => d.type === "mission");
  const [stripeDismissed, setStripeDismissed] = useState(false);
  const [taskCtaDismissed, setTaskCtaDismissed] = useState(false);

  const DISMISSAL_DAYS = 30;

  useEffect(() => {
    const now = Date.now();
    const intervalMs = DISMISSAL_DAYS * 24 * 60 * 60 * 1000;
    const stripeDismissedAt = localStorage.getItem(`stripe_banner_dismissed_${project.id}`);
    if (stripeDismissedAt && now - parseInt(stripeDismissedAt) < intervalMs) {
      setStripeDismissed(true);
    }
    const taskDismissedAt = localStorage.getItem(`task_cta_dismissed_${project.id}`);
    if (taskDismissedAt && now - parseInt(taskDismissedAt) < intervalMs) {
      setTaskCtaDismissed(true);
    }
  }, [project.id]);

  const handleDismissStripe = () => {
    localStorage.setItem(`stripe_banner_dismissed_${project.id}`, Date.now().toString());
    setStripeDismissed(true);
  };

  const handleDismissTaskCta = () => {
    localStorage.setItem(`task_cta_dismissed_${project.id}`, Date.now().toString());
    setTaskCtaDismissed(true);
  };

  const showSubscriptionBanner = project.subscription_status !== "active" && project.status === "active";

  // Founder directives
  const directivesQuery = useFounderDirectives(project.id);
  const updateDirectives = useUpdateFounderDirectives(project.id);
  const generateDirectives = useGenerateDirectives(project.id);
  const [directives, setDirectives] = useState("");
  const [isEditingDirection, setIsEditingDirection] = useState(false);

  useEffect(() => {
    if (directivesQuery.data?.directives !== undefined) {
      setDirectives(directivesQuery.data.directives);
    }
  }, [directivesQuery.data]);

  const handleSaveDirectives = () => {
    updateDirectives.mutate(directives, {
      onSuccess: () => setIsEditingDirection(false),
    });
  };

  const handleGenerate = () => {
    generateDirectives.mutate(undefined, {
      onSuccess: (data) => {
        setDirectives(data.directives);
        setIsEditingDirection(true);
      },
    });
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
      {onSendChat && (
        <MorningBriefing
          projectId={project.id}
          onSwitchPanel={onSwitchPanel}
          onSendChat={onSendChat}
        />
      )}

      {showSubscriptionBanner && (
        <Card className="border-primary/50 bg-primary/5 animate-[reveal-up_400ms_ease-out_both]">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Your company is ready!</h3>
              <p className="text-sm text-muted-foreground">
                Subscribe to automate lead finding, outreach, content, and research every night.
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => onSubscribe("pro")}>Pro — $49/mo</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Revenue setup CTA — shown when marketplace is enabled but user hasn't set up payments */}
      {!stripeDismissed && project.marketplace_enabled && project.revenue_balance_cents === 0 && (
        <Card className="border-green-500/50 bg-green-50 dark:bg-green-950/20 relative animate-[reveal-up_400ms_ease-out_100ms_both]">
          <button
            onClick={handleDismissStripe}
            className="absolute top-2 right-2 p-1 rounded-md hover:bg-green-200 dark:hover:bg-green-900 transition-colors"
          >
            <X className="w-4 h-4 text-green-600 dark:text-green-400" />
          </button>
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pr-10">
            <div>
              <h3 className="font-semibold text-green-800 dark:text-green-300">Setup Payments</h3>
              <p className="text-sm text-green-700 dark:text-green-400">
                Your pricing plans are live. Connect your bank account to receive payments.
              </p>
            </div>
            <Button
              variant="default"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => onSwitchPanel("revenue")}
            >
              Connect Payments
            </Button>
          </CardContent>
        </Card>
      )}

      {/* First task CTA — shown when no tasks have been executed */}
      {!taskCtaDismissed && completedTasks.length === 0 && queuedTasks.length > 0 && (
        <Card className="border-blue-500/50 bg-blue-50 dark:bg-blue-950/20 relative animate-[reveal-up_400ms_ease-out_200ms_both]">
          <button
            onClick={handleDismissTaskCta}
            className="absolute top-2 right-2 p-1 rounded-md hover:bg-blue-200 dark:hover:bg-blue-900 transition-colors"
          >
            <X className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </button>
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pr-10">
            <div>
              <h3 className="font-semibold text-blue-800 dark:text-blue-300">Run Your First Task</h3>
              <p className="text-sm text-blue-700 dark:text-blue-400">
                You have {queuedTasks.length} tasks ready. Run one to start growing your business.
              </p>
            </div>
            <Button
              variant="default"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => onSwitchPanel("tasks")}
            >
              View Tasks
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="animate-[reveal-up_400ms_ease-out_both]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
              Status
              <Badge
                variant={project.subscription_status === "active" ? "default" : "secondary"}
              >
                {project.subscription_status === "active" ? "Pro" : "Free"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {project.landing_page_published && (
              <a
                href={`https://${project.slug}.${companyDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline font-mono"
              >
                {project.slug}.{companyDomain}
              </a>
            )}
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:bg-muted/50 transition-colors animate-[reveal-up_400ms_ease-out_80ms_both]"
          onClick={() => onSwitchPanel("analytics")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unique Visitors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analyticsData?.summary?.uniqueVisitors ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              last 7 days
            </p>
          </CardContent>
        </Card>

        <Card className="animate-[reveal-up_400ms_ease-out_160ms_both]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tasks Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedTasks.length}</div>
            <p className="text-xs text-muted-foreground">
              {queuedTasks.length} queued
            </p>
          </CardContent>
        </Card>

        <Card className="animate-[reveal-up_400ms_ease-out_240ms_both]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${(project.revenue_balance_cents / 100).toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ROI Tracking */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What Artha Did For You</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-2xl font-bold">{outreach?.email.totalSent ?? leads.filter((l) => l.contacted).length}</p>
              <p className="text-xs text-muted-foreground">Emails sent</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{outreach?.email.openRate ?? 0}%</p>
              <p className="text-xs text-muted-foreground">Open rate</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{outreach?.leads.replied ?? leads.filter((l) => l.status === "replied").length}</p>
              <p className="text-xs text-muted-foreground">Replies</p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                {completedTasks.length > 0
                  ? `~${Math.round(completedTasks.length * 0.5)}h`
                  : "0h"}
              </p>
              <p className="text-xs text-muted-foreground">Time saved (est.)</p>
            </div>
          </div>

          {/* Lead funnel */}
          {outreach && outreach.leads.total > 0 && (
            <div className="pt-3 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-2">Lead Pipeline</p>
              <div className="flex items-center gap-1 text-xs flex-wrap">
                <span className="px-2 py-1 rounded bg-muted">{outreach.leads.total} found</span>
                <span className="text-muted-foreground">&rarr;</span>
                <span className="px-2 py-1 rounded bg-blue-50 text-blue-700">{outreach.leads.contacted} contacted</span>
                <span className="text-muted-foreground">&rarr;</span>
                <span className="px-2 py-1 rounded bg-green-50 text-green-700">{outreach.leads.replied} replied</span>
                {outreach.leads.converted > 0 && (
                  <>
                    <span className="text-muted-foreground">&rarr;</span>
                    <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700">{outreach.leads.converted} converted</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Weekly snapshot */}
          {outreach && outreach.weekly.sent > 0 && (
            <div className="pt-3 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-1">This week</p>
              <p className="text-xs text-muted-foreground">
                {outreach.weekly.sent} emails sent &middot; {outreach.weekly.opened} opened &middot; {outreach.weekly.replies} replies
              </p>
            </div>
          )}

          {completedTasks.length > 0 && (
            <p className="text-xs text-muted-foreground pt-3 border-t">
              {completedTasks.length} tasks completed &middot;{" "}
              {tasks.filter((t) => t.tag === "research").length} research &middot;{" "}
              {tasks.filter((t) => t.tag === "cold-outreach").length} outreach &middot;{" "}
              {tasks.filter((t) => t.tag === "content" || t.tag === "social").length} content
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              Documents
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSwitchPanel("documents")}
              >
                View all
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents yet</p>
            ) : (
              documents.slice(0, 3).map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => onViewDocument(doc.id)}
                  className="w-full text-left p-2 rounded hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {doc.title}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {doc.type.replace("_", " ")}
                    </Badge>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              Recent Tasks
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSwitchPanel("tasks")}
              >
                View all
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks yet</p>
            ) : (
              recentTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between text-sm p-2"
                >
                  <span className="truncate">{task.title}</span>
                  <div className="flex items-center gap-1.5">
                    {task.id === tonightTaskId && (
                      <Badge className="bg-violet-100 text-[10px] text-violet-700 hover:bg-violet-100">
                        Tonight
                      </Badge>
                    )}
                    <Badge
                      variant={
                        task.status === "completed"
                          ? "default"
                          : task.status === "running"
                            ? "secondary"
                            : "outline"
                      }
                      className="text-[10px] shrink-0"
                    >
                      {task.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {missionDoc && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mission</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground line-clamp-4">
              {missionDoc.content.slice(0, 400)}...
            </p>
            <Button
              variant="link"
              className="px-0 mt-1"
              onClick={() => onViewDocument(missionDoc.id)}
            >
              Read full mission
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            Company Direction
            {!isEditingDirection ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditingDirection(true)}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                {directivesQuery.data?.directives ? "Edit" : "Set direction"}
              </Button>
            ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={generateDirectives.isPending || updateDirectives.isPending}
                >
                  {generateDirectives.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                  Generate with AI
                </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isEditingDirection ? (
            <div className="space-y-3">
              <Textarea
                value={directives}
                onChange={(e) => setDirectives(e.target.value)}
                placeholder="Tell your agents what to focus on. E.g., Pivoting to B2B. Focus on European market. Priority: get 100 users this month."
                className="min-h-[120px] text-sm"
                maxLength={2000}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {directives.length}/2000
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDirectives(directivesQuery.data?.directives || "");
                      setIsEditingDirection(false);
                    }}
                    disabled={updateDirectives.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveDirectives}
                    disabled={updateDirectives.isPending}
                  >
                    {updateDirectives.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    Save
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {directivesQuery.data?.directives || "No direction set yet. Tell your agents what to focus on — your priorities, target market, or strategic shifts."}
            </p>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
