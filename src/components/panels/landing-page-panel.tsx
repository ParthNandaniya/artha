"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Undo2, Redo2, AlertTriangle } from "lucide-react";
import { useWebsiteDatabase } from "@/hooks/use-website";
import { DatabaseSection } from "@/components/panels/database-section";
import type { Project, ProjectWebsite } from "@/lib/types";

interface WebsitePanelProps {
  project: Project;
  website: ProjectWebsite | null;
  deploying: boolean;
  deployError: string | null;
  onDeploy: () => Promise<void>;
  onRefresh: () => void | Promise<void>;
  onSendChat?: (message: string) => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Prepare HTML for safe preview inside an iframe.
 * - Strips any <base> tags (prevents resolving relative links to external domains)
 * - Injects a script that blocks all navigation (link clicks, form submissions, window.open)
 * - Injects an error-capture script that posts JS errors to the parent window via postMessage
 * - Allows only in-page hash scrolling
 */
function preparePreviewHtml(html: string): string {
  if (!html) return html;

  // Remove any existing <base> tags that would redirect relative links
  let safe = html.replace(/<base\b[^>]*\/?>/gi, "");

  // This runs first (before any user scripts) — captures errors + blocks navigation
  const script = `<script>(function(){
    // Forward all JS errors to the parent so the panel can surface them
    window.addEventListener("error",function(e){
      try{parent.postMessage({type:"preview_error",message:e.message,source:e.filename||"",line:e.lineno||0,col:e.colno||0},"*")}catch(_){}
    });
    window.addEventListener("unhandledrejection",function(e){
      try{var m=e.reason&&e.reason.message?e.reason.message:String(e.reason);parent.postMessage({type:"preview_error",message:"Unhandled promise rejection: "+m,source:"",line:0,col:0},"*")}catch(_){}
    });
    // Block ALL navigation — handle hash scrolling manually
    document.addEventListener("click",function(e){
      var t=e.target;
      while(t&&t.nodeType===1){
        if(t.tagName==="A"){
          var h=t.getAttribute("href");
          e.preventDefault();e.stopImmediatePropagation();
          if(h&&h.charAt(0)==="#"){
            if(h==="#"){window.scrollTo({top:0,behavior:"smooth"});return}
            var el=document.querySelector(h);
            if(el)el.scrollIntoView({behavior:"smooth",block:"start"});
          }
          return false;
        }
        t=t.parentElement;
      }
    },true);
    document.addEventListener("submit",function(e){e.preventDefault();e.stopImmediatePropagation()},true);
    window.open=function(){return null};
  })()</script>`;

  if (safe.includes("</head>")) return safe.replace("</head>", script + "\n</head>");
  if (safe.includes("<body")) return safe.replace(/<body[^>]*>/, (m) => m + "\n" + script);
  return safe + script;
}

export function WebsitePanel({
  project,
  website,
  deploying,
  deployError,
  onDeploy,
  onRefresh,
  onSendChat,
}: WebsitePanelProps) {
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"preview" | "database">("preview");
  const [recreating, setRecreating] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [previewErrors, setPreviewErrors] = useState<string[]>([]);
  const previewKeyRef = useRef(0); // incremented on HTML change to reset error list

  // Listen for JS errors forwarded from the preview iframe
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === "preview_error" && typeof e.data.message === "string") {
        const msg = e.data.line
          ? `${e.data.message} (line ${e.data.line})`
          : e.data.message;
        setPreviewErrors((prev) => prev.includes(msg) ? prev : [...prev, msg]);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Reset errors whenever the preview HTML changes
  const rawPreviewHtml = website?.previewHtml || project.landing_page_html || "";
  useEffect(() => {
    setPreviewErrors([]);
    previewKeyRef.current += 1;
  }, [rawPreviewHtml]);

  const isDev = process.env.NODE_ENV === "development";
  const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
  const liveUrl = website?.liveUrl || `https://${project.slug}.${companyDomain}`;
  const hasPreview = Boolean(website?.previewHtml || project.landing_page_html);
  const hasUnpublishedChanges = Boolean(website?.hasUnpublishedChanges);
  const isDeployFailed = website?.deploymentStatus === "failed" || project.cloudflare_setup_status === "failed";
  const deploymentError = setupError || deployError || (isDeployFailed ? (website?.deploymentError || project.cloudflare_setup_error) : null);
  const deployLabel = website?.deploymentStatus === "failed" || project.cloudflare_setup_status === "failed"
    ? "Retry deploy"
    : !website?.published
    ? "Deploy website"
    : hasUnpublishedChanges
      ? "Deploy draft"
      : "Redeploy";
  const websiteStatusLabel = !hasPreview
    ? "Not setup"
    : website?.published
      ? "Live"
      : "Preview only";

  const { data: dbStats } = useWebsiteDatabase(project.id);
  const hasDb = Boolean(project.neon_connection_url);

  async function handleSetupWebsite() {
    setSetupLoading(true);
    setSetupError(null);
    setSetupMessage(null);
    try {
      const res = await fetch("/api/projects/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, action: "setup" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Website setup failed");
      }
      setSetupMessage("Website draft is ready in preview.");
      await onRefresh();
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "Website setup failed");
    } finally {
      setSetupLoading(false);
    }
  }

  async function handleRecreateWebsite() {
    setRecreating(true);
    setSetupError(null);
    setSetupMessage(null);
    try {
      const res = await fetch("/api/projects/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, action: "recreate" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Website recreate failed");
      }
      setSetupMessage("Website recreated with new template.");
      await onRefresh();
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "Website recreate failed");
    } finally {
      setRecreating(false);
    }
  }

  async function handleRevertToLive() {
    setReverting(true);
    setSetupError(null);
    try {
      const res = await fetch("/api/projects/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, action: "revert-to-live" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to revert");
      }
      await onRefresh();
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "Revert failed");
    } finally {
      setReverting(false);
    }
  }

  async function handleRestoreDraft() {
    setRestoring(true);
    setSetupError(null);
    try {
      const res = await fetch("/api/projects/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, action: "restore-draft" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to restore draft");
      }
      await onRefresh();
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setRestoring(false);
    }
  }

  // If the HTML is already a full document, use it directly; otherwise wrap it
  const wrappedHtml = rawPreviewHtml.trim().startsWith("<!DOCTYPE") || rawPreviewHtml.trim().startsWith("<html")
    ? rawPreviewHtml
    : rawPreviewHtml
      ? `<!DOCTYPE html><html><head><base href="${liveUrl.endsWith("/") ? liveUrl : `${liveUrl}/`}" target="_blank" /></head><body>${rawPreviewHtml}</body></html>`
      : "";
  // Strip <base> tags and inject link prevention for safe preview
  const previewHtml = preparePreviewHtml(wrappedHtml);

  return (
    <div className="p-4 sm:p-6 space-y-4 h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold">Website</h2>
            <Badge variant={website?.published ? "default" : "secondary"}>
              {websiteStatusLabel}
            </Badge>
            {hasUnpublishedChanges && (
              <Badge variant="secondary">Draft changes</Badge>
            )}
            {website?.deploymentStatus === "failed" && (
              <Badge variant="destructive">Deploy failed</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {website?.published ? (
              <>
                Live at{" "}
                <a
                  href={project.custom_domain ? `https://${project.custom_domain}` : liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-mono"
                >
                  {project.custom_domain || `${project.slug}.${companyDomain}`}
                </a>
              </>
            ) : hasPreview ? (
              "Changes from chat stay in preview until you deploy."
            ) : (
              "Website is not set up yet. Generate the first draft here."
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Segment toggle */}
          {hasPreview && (
            <div className="flex items-center rounded-md border bg-muted/40 p-0.5">
              <button
                onClick={() => setActiveView("preview")}
                className={`px-3 py-1 text-sm rounded font-medium transition-colors ${
                  activeView === "preview"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Preview
              </button>
              <button
                onClick={() => setActiveView("database")}
                className={`px-3 py-1 text-sm rounded font-medium transition-colors ${
                  activeView === "database"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Database
              </button>
            </div>
          )}

          {!hasPreview && (
            <Button
              size="sm"
              onClick={() => void handleSetupWebsite()}
              disabled={setupLoading}
            >
              {setupLoading ? "Setting up..." : "Set up website"}
            </Button>
          )}
          {website?.published && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(liveUrl, "_blank")}
            >
              Open live
            </Button>
          )}
          {hasPreview && (
            <Button
              size="sm"
              onClick={() => void onDeploy()}
              disabled={deploying}
            >
              {deploying ? <><Loader2 className="h-4 w-4 animate-spin" /> Deploying...</> : deployLabel}
            </Button>
          )}
          {isDev && hasPreview && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleRecreateWebsite()}
              disabled={recreating}
              className="border-dashed border-orange-400 text-orange-600 hover:bg-orange-50"
            >
              {recreating ? <><Loader2 className="h-4 w-4 animate-spin" /> Recreating...</> : "Recreate"}
            </Button>
          )}
        </div>
      </div>

      {setupMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shrink-0">
          {setupMessage}
        </div>
      )}

      {(hasUnpublishedChanges || deploymentError || website?.hasStashedDraft) && (
        <div className={`rounded-lg border px-4 py-3 text-sm shrink-0 ${
          deploymentError
            ? "border-destructive/30 bg-destructive/5 text-destructive"
            : website?.hasStashedDraft && !hasUnpublishedChanges
              ? "border-blue-200 bg-blue-50 text-blue-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
        }`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span>
              {deploymentError
                || (website?.hasStashedDraft && !hasUnpublishedChanges
                  ? "Reverted to live version. Your draft changes are stashed."
                  : "This draft is only visible in preview until you deploy it.")}
            </span>
            <div className="flex items-center gap-2">
              {hasUnpublishedChanges && website?.published && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleRevertToLive()}
                  disabled={reverting}
                  className="h-7 text-xs"
                >
                  {reverting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Undo2 className="h-3 w-3 mr-1" />}
                  Revert to live
                </Button>
              )}
              {website?.hasStashedDraft && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleRestoreDraft()}
                  disabled={restoring}
                  className="h-7 text-xs"
                >
                  {restoring ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Redo2 className="h-3 w-3 mr-1" />}
                  Restore draft
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Script errors caught from the preview iframe */}
      {previewErrors.length > 0 && activeView === "preview" && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="space-y-1 min-w-0">
                <p className="font-medium">Script error in preview</p>
                {previewErrors.map((err, i) => (
                  <p key={i} className="font-mono text-xs break-all opacity-80">{err}</p>
                ))}
              </div>
            </div>
            {onSendChat && (
              <Button
                size="sm"
                variant="destructive"
                className="shrink-0 h-7 text-xs"
                onClick={() => onSendChat(
                  `The website has a script error and the preview is blank: "${previewErrors[0]}". Rebuild the website from scratch using the template system so it works correctly — make sure all React/JSX code is inside <script type="text/babel"> and that React, ReactDOM, and Babel CDN scripts are loaded in the <head>.`
                )}
              >
                Fix with AI
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Main content area - full screen */}
      {activeView === "preview" ? (
        hasPreview ? (
          <div className="border rounded-lg overflow-hidden bg-white flex-1 min-h-[300px]">
            <iframe
              key={previewKeyRef.current}
              srcDoc={previewHtml || undefined}
              className="w-full h-full"
              title="Website preview"
              sandbox="allow-scripts allow-same-origin"
              allow="autoplay; fullscreen"
            />
          </div>
        ) : (
          <div className="flex items-center justify-center border rounded-lg bg-muted/30 flex-1">
            <p className="text-muted-foreground">
              Use &quot;Set up website&quot; to generate the first draft.
            </p>
          </div>
        )
      ) : (
        /* Database view */
        <DatabaseSection
          projectId={project.id}
          subscribed={project.subscription_status === "active"}
        />
      )}

    </div>
  );
}
