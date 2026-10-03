"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { LivePipelineFeed } from "@/components/onboarding/live-pipeline-feed";
import { PipelineLiveActivity } from "@/components/onboarding/pipeline-live-activity";
import type { PipelineStep } from "@/lib/types";
import type { PipelineActivity, PipelineJobStatus } from "@/hooks/use-pipeline";

const STEPS: PipelineStep[] = [
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

const FAKE_LOGS: Record<string, string[]> = {
  user_research: [
    "Searching LinkedIn and public profiles...",
    "Found founder background in AI/SaaS",
    "Compiled founder context for personalization",
  ],
  research_idea: [
    "Analyzing idea: AI-powered task management",
    "Scanning 47 competitors in the space",
    "Identified key differentiators and gaps",
  ],
  save_profile: ["Saving founder profile to platform", "Profile stored successfully"],
  name_company: [
    "Generating name candidates...",
    'Selected name: "Taskflow AI"',
    "Checking domain availability for taskflow-ai",
  ],
  create_project: ["Creating project record", "Project ID assigned: proj_demo_abc123"],
  provision_db: ["Spinning up isolated Neon database", "Database provisioned in us-east-1"],
  init_schema: ["Running schema migrations", "Created 12 tables, 8 indexes"],
  mission: [
    "Crafting mission statement with AI...",
    "Aligning mission with market positioning",
    "Mission: Simplify work through intelligent automation",
  ],
  market_research: [
    "Searching for market size data...",
    "Found TAM of $12.4B in task management",
    "Identified 3 primary customer segments",
    "Compiled competitive landscape report",
  ],
  landing_page: [
    "Generating hero section copy...",
    "Building features section with 4 highlights",
    "Designing CTA and pricing layout",
    "Landing page HTML generated (2.4KB)",
  ],
  tweet_launch: ["Composing launch tweet", "Tweet draft ready for review"],
  email_setup: [
    "Configuring Postmark sender identity",
    "Email domain verified: taskflow-ai@tryartha.com",
  ],
  github_repo: ["Creating GitHub repository", "Repo initialized with landing page files"],
  push_website: ["Pushing landing page to repository", "Deployed 3 files to main branch"],
  cloudflare_setup: [
    "Creating Cloudflare Pages project",
    "DNS configured: taskflow-ai.tryartha.com",
    "SSL certificate provisioned",
  ],
  task_queue: [
    "Generating initial task queue...",
    "Created 8 onboarding tasks",
    "Prioritized tasks by impact score",
  ],
  welcome_email: ["Composing welcome email", "Welcome email sent to founder"],
};

type Speed = 1 | 2 | 4;

function deepCloneSteps(): PipelineStep[] {
  return STEPS.map((s) => ({ ...s, logs: [] }));
}

export default function TestOnboardingPage() {
  const [steps, setSteps] = useState<PipelineStep[]>(deepCloneSteps);
  const [activities, setActivities] = useState<PipelineActivity[]>([]);
  const [jobStatus, setJobStatus] = useState<PipelineJobStatus | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runningForSeconds, setRunningForSeconds] = useState<number | null>(null);
  const [stepStartTimes, setStepStartTimes] = useState<Record<string, number>>({});
  const [speed, setSpeed] = useState<Speed>(2);

  const cancelRef = useRef(false);
  const actIdRef = useRef(0);

  const addActivity = useCallback(
    (message: string, type: "info" | "success" | "error", stepId?: string) => {
      const id = `act_${++actIdRef.current}`;
      setActivities((prev) => [
        ...prev,
        { id, timestamp: Date.now(), message, type, source: "pipeline" as const, stepId },
      ]);
    },
    []
  );

  const sleep = useCallback((ms: number, currentSpeed: Speed) => {
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, ms / currentSpeed);
      // Store for potential cleanup — not critical for demo
      void timeout;
    });
  }, []);

  const runSimulation = useCallback(async () => {
    cancelRef.current = false;
    const freshSteps = deepCloneSteps();
    setSteps(freshSteps);
    setActivities([]);
    setJobStatus("running");
    setIsRunning(true);
    setStatusMessage("Building your company...");
    setRunningForSeconds(0);

    const startTime = Date.now();
    const runningTimer = setInterval(() => {
      setRunningForSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    for (let i = 0; i < freshSteps.length; i++) {
      if (cancelRef.current) break;

      const step = freshSteps[i];
      const logs = FAKE_LOGS[step.id] || ["Processing..."];

      // Mark step as running
      setSteps((prev) =>
        prev.map((s, idx) => (idx === i ? { ...s, status: "running" as const } : s))
      );
      setStepStartTimes((prev) => ({ ...prev, [step.id]: Date.now() }));
      addActivity(`Started: ${step.label}`, "info", step.id);
      setStatusMessage(step.label);

      // Emit fake logs one by one
      for (const log of logs) {
        if (cancelRef.current) break;
        await sleep(400 + Math.random() * 600, speed);
        addActivity(log, "info", step.id);
        setSteps((prev) =>
          prev.map((s, idx) =>
            idx === i
              ? { ...s, logs: [...s.logs, { timestamp: Date.now(), message: log, type: "info" as const }] }
              : s
          )
        );
      }

      if (cancelRef.current) break;

      // Small pause then complete
      await sleep(300, speed);
      setSteps((prev) =>
        prev.map((s, idx) => (idx === i ? { ...s, status: "completed" as const } : s))
      );
      addActivity(`Completed: ${step.label}`, "success", step.id);

      // Brief gap between steps
      await sleep(500 + Math.random() * 400, speed);
    }

    clearInterval(runningTimer);

    if (!cancelRef.current) {
      setJobStatus("completed");
      setStatusMessage("All phases complete!");
      setIsRunning(false);
      addActivity("Company build complete! Redirecting to dashboard...", "success");
    }
  }, [speed, addActivity, sleep]);

  const reset = useCallback(() => {
    cancelRef.current = true;
    setSteps(deepCloneSteps());
    setActivities([]);
    setJobStatus(null);
    setStatusMessage(null);
    setIsRunning(false);
    setRunningForSeconds(null);
    setStepStartTimes({});
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelRef.current = true;
    };
  }, []);

  const noop = async () => {};

  return (
    <div className="min-h-screen bg-background">
      {/* Controls bar */}
      <div className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
            DEV
          </span>
          <h1 className="text-sm font-semibold text-foreground">Onboarding UI Test</h1>
          <div className="ml-auto flex items-center gap-2">
            {/* Speed toggle */}
            <div className="flex items-center border border-border rounded-md overflow-hidden">
              {([1, 2, 4] as Speed[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`px-2.5 py-1 text-xs font-mono transition-colors ${
                    speed === s
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
            {!isRunning && jobStatus !== "running" ? (
              <button
                onClick={runSimulation}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {jobStatus === "completed" ? "Run Again" : "Start Demo"}
              </button>
            ) : (
              <button
                onClick={reset}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-muted text-foreground hover:bg-muted/80 transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Same layout as real onboarding */}
      <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-[320px] shrink-0">
          <LivePipelineFeed
            steps={steps}
            isRunning={isRunning}
            jobStatus={jobStatus}
            statusMessage={statusMessage}
            stepStartTimes={stepStartTimes}
          />
        </div>
        <div className="flex-1 min-w-0">
          <PipelineLiveActivity
            statusMessage={statusMessage}
            error={null}
            jobStatus={jobStatus}
            queueReason={null}
            pendingForSeconds={null}
            runningForSeconds={runningForSeconds}
            isStalled={false}
            stalledReason={null}
            activities={activities}
            recoveryAction={null}
            onRunNow={noop}
            onRetry={noop}
            onRefresh={noop}
          />
        </div>
      </div>
    </div>
  );
}
