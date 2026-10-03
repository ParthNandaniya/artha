"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TopBar } from "@/components/layout/top-bar";
import { PanelTabs } from "@/components/layout/panel-tabs";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { OverviewPanel } from "@/components/panels/overview-panel";
import { TasksPanel } from "@/components/panels/tasks-panel";
import { DocumentsPanel } from "@/components/panels/documents-panel";
import { WebsitePanel } from "@/components/panels/landing-page-panel";
import { AnalyticsPanel } from "@/components/panels/analytics-panel";
import { EmailPanel } from "@/components/panels/email-panel";
import { TwitterPanel } from "@/components/panels/twitter-panel";
import { RevenuePanel } from "@/components/panels/revenue-panel";
import { SettingsPanel } from "@/components/panels/settings-panel";
import { ResearchPanel } from "@/components/panels/research-panel";
import { LeadsPanel } from "@/components/panels/leads-panel";
import { AdsPanel } from "@/components/panels/ads-panel";
import { MarketplacePanel } from "@/components/panels/marketplace-panel";
import { AutomationsPanel } from "@/components/panels/automations-panel";
import { AgentActivityPanel } from "@/components/panels/agent-activity-panel";
import { MorningBriefing } from "@/components/dashboard/morning-briefing";
import { CommandBar } from "@/components/command-bar/command-bar";
import { DocumentDetail } from "@/components/slide-overs/document-detail";
import { TaskDetail } from "@/components/slide-overs/task-detail";
import { NewCompanyModal } from "@/components/modals/new-company-modal";
import { SubscriptionPaywallModal } from "@/components/modals/subscription-paywall-modal";
import { CelebrationModal } from "@/components/modals/celebration-modal";
import { SubscriptionProvider } from "@/contexts/subscription-context";
import { TasksModal } from "@/components/modals/tasks-modal";
import { CreateTaskModal } from "@/components/modals/create-task-modal";
import { LivePipelineFeed } from "@/components/onboarding/live-pipeline-feed";
import { PipelineLiveActivity } from "@/components/onboarding/pipeline-live-activity";
import { LiveTaskRunCard } from "@/components/dashboard/live-task-run-card";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { useActivePanel } from "@/hooks/use-active-panel";
import { useLiveTaskRun } from "@/hooks/use-live-task-run";
import { useSlideOver } from "@/hooks/use-slide-over";
import { useProjectBySlug } from "@/hooks/use-projects";
import { useDocuments } from "@/hooks/use-documents";
import { useTasks, useRunTask, useCreateTask, useGenerateTask } from "@/hooks/use-tasks";
import { useLeads, useUpdateLead, useBulkUpdateLeads } from "@/hooks/use-leads";
import { useResearchTags, useRunResearch, useCreateResearchTag, useDeleteResearchTag } from "@/hooks/use-research";
import { useWebsite, useDeployWebsite } from "@/hooks/use-website";
import { usePipeline } from "@/hooks/use-pipeline";
import { fireSubscriptionConversion } from "@/lib/google-ads";
import { ArthaLoader } from "@/components/icons/artha-loader";
import { cn } from "@/lib/utils";
import type { Project, PanelType } from "@/lib/types";

const LAST_PROJECT_COOKIE = "artha_last_project_slug";

export default function ProjectDashboard({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const { projectSlug } = use(params);

  // Frequency controls for subscription reminders
  const REMINDER_INTERVAL_DAYS = 1;
  
  const { project, isLoading: projectLoading } = useProjectBySlug(projectSlug);
  const { data: documents = [], isLoading: docsLoading } = useDocuments(project?.id);
  const { data: tasks = [], isLoading: tasksLoading } = useTasks(project?.id);
  const { data: leads = [], isLoading: leadsLoading } = useLeads(project?.id);
  const { data: researchTags = [], isLoading: researchLoading } = useResearchTags(project?.id);
  const { data: websiteData, isLoading: websiteLoading } = useWebsite(project?.id);
  const website = websiteData ?? null;

  const queryClient = useQueryClient();

  // Grace period: don't flash "Project not found" if project query just finished
  const [graceExpired, setGraceExpired] = useState(false);
  useEffect(() => {
    if (project || projectLoading) {
      setGraceExpired(false);
      return;
    }
    // Project not found + not loading — refetch and wait 3s before showing "not found"
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    const timer = setTimeout(() => setGraceExpired(true), 3000);
    return () => clearTimeout(timer);
  }, [project, projectLoading, queryClient]);

  const loading = projectLoading || docsLoading || tasksLoading || leadsLoading || researchLoading || websiteLoading;
  const { activePanel, switchPanel } = useActivePanel();
  const slideOver = useSlideOver();
  const pipeline = usePipeline();
  
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
      queryClient.invalidateQueries({ queryKey: ["website", project?.id] }),
      queryClient.invalidateQueries({ queryKey: ["leads", project?.id] }),
      queryClient.invalidateQueries({ queryKey: ["documents", project?.id] }),
    ]);
  };

  const liveTask = useLiveTaskRun({
    projectId: project?.id,
    tasks,
    onSettled: refresh, // We will update this later to specifically invalidate queries if needed
  });
  const router = useRouter();
  const searchParams = useSearchParams();

  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [showNewCompany, setShowNewCompany] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [triggerCreditModal, setTriggerCreditModal] = useState(false);
  const [showTasksModal, setShowTasksModal] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [pendingChatMessage, setPendingChatMessage] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [websiteDeploying, setWebsiteDeploying] = useState(false);
  const [websiteDeployError, setWebsiteDeployError] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"chat" | "panels">("panels");
  const [chatWidth, setChatWidth] = useState(440);
  const [commandBarOpen, setCommandBarOpen] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);

  // Cmd+K shortcut for command bar
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandBarOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = dragStartXRef.current - e.clientX;
      const newWidth = Math.min(Math.max(dragStartWidthRef.current + delta, 280), 600);
      setChatWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = chatWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [chatWidth]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/projects");
        if (res.status === 401) {
          router.push("/");
          return;
        }
        const data = await res.json();
        setAllProjects(data || []);
      } catch {
        router.push("/");
      }
    }
    load();
  }, [router]);



  // Verify subscription status after Stripe redirect
  const subscriptionVerifiedRef = useRef(false);
  useEffect(() => {
    if (searchParams.get("subscribed") !== "true" || !project || subscriptionVerifiedRef.current) return;

    // If webhook already processed, verify credits and refresh UI
    if (project.subscription_status === "active") {
      // Credits may not have been added yet (checkout.session.completed fires before invoice.paid)
      fetch("/api/stripe/verify-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      }).then(() => queryClient.invalidateQueries({ queryKey: ["projects"] })).catch(() => {});
      fireSubscriptionConversion({ projectId: project.id as string, plan: "pro" });
      toast.success("You're subscribed! Credits have been added.");
      const url = new URL(window.location.href);
      url.searchParams.delete("subscribed");
      router.replace(url.pathname + url.search, { scroll: false });
      return;
    }

    // Verify subscription directly with Stripe (bypasses webhook race condition)
    subscriptionVerifiedRef.current = true;
    let attempts = 0;
    const maxAttempts = 8;
    const verify = async () => {
      attempts++;
      try {
        const res = await fetch("/api/stripe/verify-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: project.id }),
        });
        const data = await res.json();
        if (data.status === "active") {
          await queryClient.invalidateQueries({ queryKey: ["projects"] });
          fireSubscriptionConversion({ projectId: project.id as string, plan: "pro" });
          toast.success("You're subscribed! Credits have been added.");
          const url = new URL(window.location.href);
          url.searchParams.delete("subscribed");
          router.replace(url.pathname + url.search, { scroll: false });
          return; // Done — stop polling
        }
      } catch {
        // Network error — will retry
      }

      if (attempts < maxAttempts) {
        setTimeout(verify, 2000);
      } else {
        toast.info("Subscription is being processed. Refresh in a moment.");
        const url = new URL(window.location.href);
        url.searchParams.delete("subscribed");
        router.replace(url.pathname + url.search, { scroll: false });
      }
    };

    // Start after a short delay to give webhook a chance
    const timer = setTimeout(verify, 1500);
    return () => {
      clearTimeout(timer);
      subscriptionVerifiedRef.current = false;
    };
  }, [searchParams, project, project?.subscription_status, queryClient, router]);

  useEffect(() => {
    if (searchParams.get("buy_credits") === "true") {
      setTriggerCreditModal(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("buy_credits");
      router.replace(url.pathname + url.search, { scroll: false });
    }

    // Automatically show celebration (first time) or paywall (subsequent) for active unsubscribed projects
    // IMPORTANT: celebration must always show first — never show paywall on the same session as celebration
    if (project && project.status === "active" && project.subscription_status === "none") {
      const celebrationKey = `celebration_shown_${project.id}`;
      const wasCelebrated = localStorage.getItem(celebrationKey);

      if (!wasCelebrated) {
        // First time seeing this active project — show celebration modal, never paywall
        setShowPaywall(false);
        const timer = setTimeout(() => {
          setShowCelebration(true);
          localStorage.setItem(celebrationKey, "true");
        }, 800);
        return () => clearTimeout(timer);
      }

      // Don't show paywall if celebration is still open
      if (showCelebration) return;

      // Existing paywall logic for subsequent visits (only after celebration was dismissed)
      const lastShown = localStorage.getItem(`paywall_last_shown_${project.id}`);
      const now = Date.now();
      const intervalMs = REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

      if (!lastShown || (now - parseInt(lastShown)) > intervalMs) {
        const timer = setTimeout(() => {
          setShowPaywall(true);
          localStorage.setItem(`paywall_last_shown_${project.id}`, now.toString());
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [project, searchParams, router, showCelebration]);

  useEffect(() => {
    if (!project?.slug) return;
    document.cookie = `${LAST_PROJECT_COOKIE}=${encodeURIComponent(project.slug)}; path=/; max-age=31536000; samesite=lax`;
  }, [project?.slug]);

  useEffect(() => {
    setWebsiteDeployError(null);
    setWebsiteDeploying(false);
  }, [project?.id]);

  async function handleSubscribe() {
    if (!project) return;
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("Checkout failed:", res.status, body);
        toast.error(body.error || "Failed to start checkout. Please try again.");
        return;
      }
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error("No checkout URL returned. Please try again.");
      }
    } catch (err) {
      console.error("Checkout error:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function handleBuyPack() {
    if (!project) return;
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/stripe/credit-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      if (!res.ok) {
        console.error("Credit pack checkout failed:", res.status);
        return;
      }
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setCheckoutLoading(false);
    }
  }

  const { mutateAsync: runTask } = useRunTask(project?.id ?? "");
  const { mutateAsync: createTask } = useCreateTask(project?.id ?? "");
  const { mutateAsync: generateTask } = useGenerateTask(project?.id ?? "");
  const { mutateAsync: runResearch } = useRunResearch(project?.id ?? "");
  const { mutateAsync: createResearchTag } = useCreateResearchTag(project?.id ?? "");
  const { mutateAsync: deleteResearchTag } = useDeleteResearchTag(project?.id ?? "");
  const { mutateAsync: updateLead } = useUpdateLead(project?.id ?? "");
  const { mutateAsync: bulkUpdateLeads } = useBulkUpdateLeads(project?.id ?? "");
  // findLeads now routes through AI chat via setPendingChatMessage
  const { mutateAsync: deployWebsite } = useDeployWebsite(project?.id ?? "");

  const handleFindLeads = useCallback((instructions?: string) => {
    if (!project) return;
    const msg = instructions
      ? `Find leads for ${project.name}: ${instructions}`
      : `Find leads and potential customers for ${project.name}`;
    setPendingChatMessage(msg);
  }, [project]);

  const handleLeadsCreated = useCallback(() => {
    if (!project) return;
    // Small delay to ensure DB write is fully committed before refetch
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["leads", project.id] });
      queryClient.invalidateQueries({ queryKey: ["documents", project.id] });
    }, 500);
  }, [project, queryClient]);

  async function handleRunTask(taskId: string) {
    if (!project) return;
    const task = tasks.find((item) => item.id === taskId);
    try {
      const { data } = await runTask(taskId);
      await liveTask.syncActiveTask({
        jobId: typeof data.jobId === "string" ? data.jobId : undefined,
        taskId,
        taskTitle: task?.title ?? null,
        taskStatus: task?.status ?? "queued",
      });
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleCreateTask(task: { title: string; description: string; isRecurring: boolean; recurrenceInterval?: string }) {
    await createTask(task);
  }

  async function handleCreateAndRunTask(task: { title: string; description: string; isRecurring: boolean; recurrenceInterval?: string }) {
    const created = await createTask(task);
    if (created?.id) {
      await handleRunTask(created.id);
    }
  }

  async function handleGenerateTask() {
    return generateTask();
  }

  function handleRunResearch(prompt: string, _tag: string) {
    if (!project) return;
    setPendingChatMessage(prompt);
  }

  async function handleDeleteResearchTag(tagId: string) {
    if (!project) return;
    try {
      await deleteResearchTag(tagId);
    } catch (err: any) {
      console.error(err);
    }
  }

  async function handleCreateResearchTag(tag: string, label: string, description: string) {
    if (!project) return;
    try {
      await createResearchTag({ tag, label, description });
    } catch (err: any) {
      console.error(err);
    }
  }

  async function handleUpdateLead(leadId: string, updates: Partial<typeof leads[number]>) {
    if (!project) return;
    try {
      await updateLead({ leadId, updates });
    } catch (err: any) {
      console.error(err);
    }
  }

  async function handleBulkUpdateLeads(leadIds: string[], updates: Partial<typeof leads[number]>) {
    if (!project) return;
    try {
      await bulkUpdateLeads({ leadIds, updates });
    } catch (err: any) {
      console.error(err);
    }
  }

  async function handleNewCompany(prompt: string, meta: { url?: string }) {
    setShowNewCompany(false);
    await pipeline.runPipeline(prompt, meta);
  }

  async function handleDeployWebsite() {
    if (!project) return;
    setWebsiteDeployError(null);
    setWebsiteDeploying(true);
    try {
      await deployWebsite();
      await refresh();
    } catch (err: any) {
      setWebsiteDeployError(err.message || "Website deploy failed.");
    } finally {
      setWebsiteDeploying(false);
    }
  }

  useEffect(() => {
    if (!pipeline.isRunning && pipeline.projectSlug && pipeline.projectSlug !== projectSlug) {
      router.push(`/dashboard/${pipeline.projectSlug}`);
    }
  }, [pipeline.isRunning, pipeline.projectSlug, projectSlug, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ArthaLoader size={48} className="text-foreground" />
      </div>
    );
  }

  if (!project) {
    if (!graceExpired) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <ArthaLoader size={48} className="text-foreground" />
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">Project not found</p>
          <button onClick={() => router.push("/dashboard")} className="text-primary hover:underline text-sm">
            Go to dashboard
          </button>
        </div>
      </div>
    );
  }

  if (pipeline.isRunning) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar
          projects={allProjects}
          currentProject={project}
          onSwitchProject={(slug) => router.push(`/dashboard/${slug}`)}
          onNewCompany={() => setShowNewCompany(true)}
        />
        <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-[320px] shrink-0">
            <LivePipelineFeed
              steps={pipeline.steps}
              isRunning={pipeline.isRunning}
              jobStatus={pipeline.jobStatus}
              statusMessage={pipeline.statusMessage}
              stepStartTimes={pipeline.stepStartTimes}
            />
          </div>
          <div className="flex-1 min-w-0">
            <PipelineLiveActivity
              statusMessage={pipeline.statusMessage}
              error={pipeline.error}
              jobStatus={pipeline.jobStatus}
              queueReason={pipeline.queueReason}
              pendingForSeconds={pipeline.pendingForSeconds}
              runningForSeconds={pipeline.runningForSeconds}
              isStalled={pipeline.isStalled}
              stalledReason={pipeline.stalledReason}
              activities={pipeline.activities}
              recoveryAction={pipeline.recoveryAction}
              onRunNow={pipeline.runPipelineManually}
              onRetry={pipeline.retryJob}
              onRefresh={pipeline.refreshStatus}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <SubscriptionProvider
      project={project}
      onSubscribe={handleSubscribe}
      onBuyPack={handleBuyPack}
      checkoutLoading={checkoutLoading}
      externalOpen={triggerCreditModal}
      onExternalOpenHandled={() => setTriggerCreditModal(false)}
    >
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <TopBar
        projects={allProjects}
        currentProject={project}
        onSwitchProject={(slug) => router.push(`/dashboard/${slug}`)}
        onNewCompany={() => setShowNewCompany(true)}
        onSubscribe={handleSubscribe}
      />
      {pipeline.error && (
        <div className="px-4 pt-4">
          <div className="mx-auto max-w-5xl rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {pipeline.error}
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] md:pb-0">
        <div className={cn(
          "flex-1 flex flex-col overflow-hidden min-w-0",
          "md:flex",
          mobileView === "panels" ? "flex" : "hidden"
        )}>
          <PanelTabs
            activePanel={activePanel}
            onSwitch={switchPanel}
            warnings={{
              settings: project ? (
                project.email_setup_status === "failed" ||
                project.tweet_setup_status === "failed" ||
                project.cloudflare_setup_status === "failed" ||
                website?.deploymentStatus === "failed"
              ) : false,
            }}
          />

          {liveTask.visible && (
            <div className="px-6 pt-4">
              <LiveTaskRunCard
                taskTitle={liveTask.taskTitle || "Task in progress"}
                taskStatus={liveTask.taskStatus}
                jobStatus={liveTask.jobStatus}
                statusMessage={liveTask.statusMessage}
                error={liveTask.error}
                activities={liveTask.activities}
                pendingForSeconds={liveTask.pendingForSeconds}
                runningForSeconds={liveTask.runningForSeconds}
                isStalled={liveTask.isStalled}
                stalledReason={liveTask.stalledReason}
                onViewTask={liveTask.taskId ? () => slideOver.openTask(liveTask.taskId!) : undefined}
                onDismiss={liveTask.dismiss}
              />
            </div>
          )}

          <div key={activePanel} className="flex-1 overflow-auto animate-[reveal-up_200ms_ease-out_both]">
            {activePanel === "overview" && (
              <OverviewPanel
                project={project}
                documents={documents}
                tasks={tasks}
                onSubscribe={handleSubscribe}
                onViewDocument={slideOver.openDocument}
                onSwitchPanel={(p) => switchPanel(p as PanelType)}
                onSendChat={(msg) => setPendingChatMessage(msg)}
              />
            )}
            {activePanel === "tasks" && (
              <TasksPanel
                tasks={tasks}
                project={project}
                onRunTask={handleRunTask}
                onViewTask={slideOver.openTask}
                onViewDocument={slideOver.openDocument}
                onRefresh={refresh}
                onSubscribe={() => setShowPaywall(true)}
                onCreateTask={() => setShowCreateTask(true)}
                checkoutLoading={checkoutLoading}
              />
            )}
            {activePanel === "agent-activity" && (
              <AgentActivityPanel project={project} />
            )}
            {activePanel === "research" && (
              <ResearchPanel
                project={project}
                documents={documents}
                researchTags={researchTags}
                onRunResearch={handleRunResearch}
                onViewDocument={slideOver.openDocument}
                onCreateTag={handleCreateResearchTag}
                onDeleteTag={handleDeleteResearchTag}
                onBuyCredits={() => setTriggerCreditModal(true)}
              />
            )}
            {activePanel === "ads" && (
              <AdsPanel
                project={project}
              />
            )}
            {activePanel === "leads" && (
              <LeadsPanel
                project={project}
                leads={leads}
                onUpdateLead={handleUpdateLead}
                onBulkUpdateLeads={handleBulkUpdateLeads}
                onViewDocument={slideOver.openDocument}
                onFindLeads={handleFindLeads}
                findingLeads={false}
              />
            )}
            {activePanel === "documents" && (
              <DocumentsPanel documents={documents} projectId={project.id} onViewDocument={slideOver.openDocument} />
            )}
            {activePanel === "landing-page" && (
              <WebsitePanel
                project={project}
                website={website}
                deploying={websiteDeploying}
                deployError={websiteDeployError}
                onDeploy={handleDeployWebsite}
                onRefresh={refresh}
                onSendChat={(msg) => setPendingChatMessage(msg)}
              />
            )}
            {activePanel === "analytics" && <AnalyticsPanel project={project} />}
            {activePanel === "email" && <EmailPanel project={project} tasks={tasks} onRefresh={refresh} onBuyCredits={() => setTriggerCreditModal(true)} />}
            {activePanel === "twitter" && <TwitterPanel project={project} onRefresh={refresh} />}
            {activePanel === "revenue" && (
              <RevenuePanel
                project={project}
                onSubscribe={() => setShowPaywall(true)}
                checkoutLoading={checkoutLoading}
              />
            )}
            {activePanel === "marketplace" && (
              <MarketplacePanel project={project} onRefresh={refresh} />
            )}
            {activePanel === "automations" && (
              <AutomationsPanel project={project} />
            )}
            {activePanel === "settings" && (
              <SettingsPanel
                project={project}
                website={website}
                onRefresh={refresh}
                onDeployWebsite={handleDeployWebsite}
                websiteDeploying={websiteDeploying}
                websiteDeployError={websiteDeployError}
              />
            )}
          </div>
        </div>

        {/* ── Drag handle ── */}
        <div
          onMouseDown={handleDragStart}
          className={cn(
            "hidden md:flex w-1 cursor-col-resize items-center justify-center hover:bg-primary/10 active:bg-primary/20 transition-colors group shrink-0",
            mobileView === "panels" ? "" : "!hidden"
          )}
        >
          <div className="w-1 h-8 rounded-full bg-border group-hover:bg-primary/40 transition-colors" />
        </div>

        <div
          className={cn(
            "shrink-0 md:flex",
            mobileView === "chat" ? "flex w-full" : "hidden"
          )}
          style={{ width: mobileView === "chat" ? undefined : chatWidth }}
        >
          <ChatSidebar
            projectId={project.id}
            activePanel={activePanel}
            onConversationSettled={() => {
              refresh();
              liveTask.syncActiveTask();
            }}
            onLeadsCreated={handleLeadsCreated}
            onBuyCredits={() => setTriggerCreditModal(true)}
            onHashNavigate={(panel) => {
              switchPanel(panel as PanelType);
              setMobileView("panels");
            }}
            externalMessage={pendingChatMessage}
            onExternalMessageHandled={() => setPendingChatMessage(null)}
          />
        </div>
      </div>

      <MobileTabBar
        mobileView={mobileView}
        onSwitch={setMobileView}
      />

      <DocumentDetail
        document={
          slideOver.type === "document"
            ? documents.find((doc) => doc.id === slideOver.id) ?? null
            : null
        }
        isOpen={slideOver.type === "document"}
        onClose={slideOver.close}
        projectId={project.id}
      />
      <TaskDetail
        taskId={slideOver.type === "task" ? slideOver.id : null}
        tasks={tasks}
        projectId={project.id}
        subscriptionStatus={project.subscription_status}
        taskCredits={project.task_credits}
        isOpen={slideOver.type === "task"}
        onClose={slideOver.close}
        onRunTask={handleRunTask}
        onRefresh={refresh}
        onViewDocument={(docId) => {
          slideOver.close();
          setTimeout(() => slideOver.openDocument(docId), 200);
        }}
      />
      <TasksModal
        isOpen={showTasksModal}
        onClose={() => setShowTasksModal(false)}
        tasks={tasks}
        project={project}
        onRunTask={handleRunTask}
        onRefresh={refresh}
        onBuyCredits={() => setTriggerCreditModal(true)}
        onCreateTask={() => setShowCreateTask(true)}
      />
      <CommandBar
        open={commandBarOpen}
        onOpenChange={setCommandBarOpen}
        onSwitchPanel={switchPanel}
        onSendChat={(msg) => setPendingChatMessage(msg)}
      />
      <CreateTaskModal
        isOpen={showCreateTask}
        onClose={() => setShowCreateTask(false)}
        projectId={project?.id}
        onCreateTask={handleCreateTask}
        onCreateAndRun={handleCreateAndRunTask}
        onGenerateWithAI={handleGenerateTask}
        hasCredits={(project?.task_credits ?? 0) >= 0.2}
      />
      <NewCompanyModal
        isOpen={showNewCompany}
        onClose={() => setShowNewCompany(false)}
        onSubmit={handleNewCompany}
        isRunning={pipeline.isRunning}
      />
      <SubscriptionPaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSubscribe={handleSubscribe}
        loading={checkoutLoading}
        projectName={project.name}
        projectSlug={project.slug}
      />
      <CelebrationModal
        isOpen={showCelebration}
        onClose={() => setShowCelebration(false)}
        projectName={project.name}
        projectSlug={project.slug}
        suggestedTasks={tasks.filter((t) => t.status === "queued").slice(0, 2)}
        onRunTask={handleRunTask}
      />
    </div>
    </SubscriptionProvider>
  );
}
