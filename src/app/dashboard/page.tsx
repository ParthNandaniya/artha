"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewCompanyModal } from "@/components/modals/new-company-modal";
import { LivePipelineFeed } from "@/components/onboarding/live-pipeline-feed";
import { PipelineLiveActivity } from "@/components/onboarding/pipeline-live-activity";
import { usePipeline } from "@/hooks/use-pipeline";
import { fireSignupConversion } from "@/lib/google-ads";
import { ArthaIcon } from "@/components/icons/artha-icon";
import { ArthaLoader } from "@/components/icons/artha-loader";
import type { Project } from "@/lib/types";

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showNewCompany, setShowNewCompany] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pipeline = usePipeline();
  const { runPipeline } = pipeline;

  useEffect(() => {
    async function load() {
      try {
        const [projectsRes, pendingRes] = await Promise.all([
          fetch("/api/projects"),
          fetch("/api/onboarding/pending-prompt"),
        ]);
        if (projectsRes.status === 401) {
          router.push("/");
          return;
        }
        const data = await projectsRes.json();
        setProjects(data || []);

        const pending = await pendingRes.json();
        if (pending?.prompt) {
          await runPipeline(pending.prompt);
        }
      } catch {
        router.push("/");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router, runPipeline]);

  async function handleCreateCompany(prompt: string, meta: { url?: string }) {
    setShowNewCompany(false);
    await runPipeline(prompt, meta);
  }

  useEffect(() => {
    if (!pipeline.isRunning && pipeline.projectSlug) {
      const slug = pipeline.projectSlug;
      fireSignupConversion(slug).finally(() => {
        router.push(`/dashboard/${slug}`);
      });
    }
  }, [pipeline.isRunning, pipeline.projectSlug, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ArthaLoader size={48} className="text-foreground" />
      </div>
    );
  }

  const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
  const MAX_FREE_PROJECTS = 3;
  const hasActiveSubscription = projects.some((p) => p.subscription_status === "active");
  const canCreateMore = projects.length < MAX_FREE_PROJECTS || hasActiveSubscription;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ArthaIcon size={20} />
            <span className="text-lg font-bold tracking-tight">artha</span>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={() => setShowNewCompany(true)} disabled={!canCreateMore} title={!canCreateMore ? "Subscribe to a company to create more" : undefined}>
              + New Company
            </Button>
            <form action="/api/auth/logout" method="POST">
              <Button variant="ghost" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </div>

      {pipeline.isRunning && (
        <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col md:flex-row gap-6">
          <div className="w-full md:max-w-md">
            <LivePipelineFeed
              steps={pipeline.steps}
              isRunning={pipeline.isRunning}
              jobStatus={pipeline.jobStatus}
              statusMessage={pipeline.statusMessage}
              stepStartTimes={pipeline.stepStartTimes}
            />
          </div>
          <div className="flex-1">
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
      )}

      {!pipeline.isRunning && (
        <div className="max-w-5xl mx-auto px-4 py-8">
          {pipeline.error && (
            <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive animate-[reveal-down_300ms_ease-out_both]">
              {pipeline.error}
            </div>
          )}
          <h1 className="text-2xl font-bold mb-6 animate-[reveal-up_500ms_ease-out_both]">Your Companies</h1>

          {projects.length === 0 ? (
            <div className="text-center py-16 space-y-4 animate-[reveal-up_500ms_ease-out_100ms_both]">
              <h2 className="text-xl font-semibold">No companies yet</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Describe your company idea in one prompt, and we&apos;ll build
                everything — mission, market research, website, email, and
                automated tasks.
              </p>
              <Button
                size="lg"
                onClick={() => setShowNewCompany(true)}
                className="mt-4"
              >
                Build Your First Company
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project, i) => (
                <Card
                  key={project.id}
                  className="cursor-pointer hover:border-primary/50 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 animate-[reveal-up_400ms_ease-out_both]"
                  style={{ animationDelay: `${i * 80}ms` }}
                  onClick={() => router.push(`/dashboard/${project.slug}`)}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <h3 className="font-semibold text-sm line-clamp-2">
                        {project.name}
                      </h3>
                      <Badge
                        variant={project.subscription_status === "active" ? "default" : "secondary"}
                        className="text-[10px] shrink-0 ml-2"
                      >
                        {project.subscription_status === "active" ? "Pro" : project.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p className="font-mono">{project.slug}.{companyDomain}</p>
                      <div className="flex items-center gap-3">
                        {project.landing_page_published && (
                          <span className="text-primary">Website live</span>
                        )}
                      </div>
                      <p>Revenue: ${(project.revenue_balance_cents / 100).toFixed(2)}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {canCreateMore && (
                <Card
                  className="cursor-pointer border-dashed hover:border-primary/50 hover:shadow-md transition-all duration-200 animate-[reveal-up_400ms_ease-out_both]"
                  style={{ animationDelay: `${projects.length * 80}ms` }}
                  onClick={() => setShowNewCompany(true)}
                >
                  <CardContent className="p-4 flex items-center justify-center h-full min-h-[120px]">
                    <span className="text-muted-foreground text-sm">+ New Company</span>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      <NewCompanyModal
        isOpen={showNewCompany}
        onClose={() => setShowNewCompany(false)}
        onSubmit={handleCreateCompany}
        isRunning={pipeline.isRunning}
      />
    </div>
  );
}
