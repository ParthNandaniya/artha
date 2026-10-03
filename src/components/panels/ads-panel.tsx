"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, ChevronDown, ChevronUp, Rocket, Image, Video, Play, Pause, BarChart3, Link2, Unlink } from "lucide-react";
import type { Project } from "@/lib/types";
import type { AdsCampaign, AdsCampaignStatus, AdsCreativeFormat } from "@/lib/ads/types";
import {
  useAdsDashboard,
  useUpdateAdsSettings,
  usePrepareAdsCampaign,
  useLaunchAdsCampaign,
  useMetaConnection,
  useMetaAdAccounts,
  useMetaPages,
  useSelectMetaAccount,
  useToggleCampaign,
  useCampaignInsights,
} from "@/hooks/use-ads";

interface AdsPanelProps {
  project: Project;
}

const STATUS_CONFIG: Record<AdsCampaignStatus, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-gray-500/10 text-gray-600" },
  ready_for_review: { label: "Ready for Review", color: "bg-amber-500/10 text-amber-600" },
  launch_requested: { label: "Launch Requested", color: "bg-blue-500/10 text-blue-600" },
  active: { label: "Active", color: "bg-emerald-500/10 text-emerald-600" },
  paused: { label: "Paused", color: "bg-orange-500/10 text-orange-600" },
  failed: { label: "Failed", color: "bg-red-500/10 text-red-600" },
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function AdsPanel({ project }: AdsPanelProps) {
  const { data, isLoading, error } = useAdsDashboard(project.id);
  const updateSettings = useUpdateAdsSettings(project.id);
  const prepareCampaign = usePrepareAdsCampaign(project.id);
  const launchCampaign = useLaunchAdsCampaign(project.id);
  const metaConnection = useMetaConnection(project.id);
  const toggleCampaign = useToggleCampaign(project.id);

  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const [budgetInput, setBudgetInput] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Meta Ads</h2>
        </div>
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : "Failed to load ads data. Please try again."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { settings, campaigns, latestResearch } = data;
  const budgetDollars = budgetInput ?? (settings.dailyBudgetCents / 100).toFixed(2);
  const isMetaConnected = !!metaConnection.data?.connected;

  function handleBudgetBlur() {
    const parsed = Math.round(parseFloat(budgetInput || "0") * 100);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setBudgetInput(null);
      return;
    }
    const clamped = Math.max(100, Math.min(parsed, 1000000));
    setBudgetInput(null);
    if (clamped !== settings.dailyBudgetCents) {
      updateSettings.mutate({ dailyBudgetCents: clamped });
    }
  }

  function handleFormatToggle(format: AdsCreativeFormat) {
    if (format !== settings.creativeFormat) {
      updateSettings.mutate({ creativeFormat: format });
    }
  }

  function handleAutoLaunchToggle(checked: boolean) {
    updateSettings.mutate({ autoLaunch: checked });
  }

  async function handleConnectMeta() {
    const res = await fetch(`/api/meta/connect?projectId=${project.id}`);
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
  }

  async function handleDisconnectMeta() {
    await fetch(`/api/meta/connect?projectId=${project.id}`, { method: "DELETE" });
    metaConnection.refetch();
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Meta Ads</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Manage ad campaigns for <span className="font-medium">{project.name}</span>
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => prepareCampaign.mutate()}
          disabled={prepareCampaign.isPending}
        >
          {prepareCampaign.isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              Preparing...
            </>
          ) : (
            "Prepare New Campaign"
          )}
        </Button>
      </div>

      {prepareCampaign.isError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4">
            <p className="text-sm text-destructive">
              {prepareCampaign.error instanceof Error
                ? prepareCampaign.error.message
                : "Failed to prepare campaign."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Meta Account Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meta Ad Account</CardTitle>
          <CardAction>
            {isMetaConnected ? (
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 text-[10px]">
                Connected
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-gray-500/10 text-gray-600 text-[10px]">
                Not Connected
              </Badge>
            )}
          </CardAction>
        </CardHeader>
        <CardContent>
          {isMetaConnected ? (
            <MetaAccountConfig
              projectId={project.id}
              connection={metaConnection.data!}
              onDisconnect={handleDisconnectMeta}
            />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Connect your Meta ad account to create and manage campaigns directly from Artha.
                Campaigns are created in your own ad account — Meta bills media spend directly to you.
              </p>
              <Button size="sm" variant="outline" onClick={handleConnectMeta}>
                <Link2 className="h-3.5 w-3.5 mr-1.5" />
                Connect Meta Account
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ad Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Daily Budget */}
            <div className="space-y-1.5">
              <Label htmlFor="daily-budget">Daily Budget (USD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  id="daily-budget"
                  type="number"
                  min="1"
                  max="10000"
                  step="1"
                  className="pl-7"
                  value={budgetDollars}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  onBlur={handleBudgetBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleBudgetBlur();
                  }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Platform fee: {settings.platformFeePercent}%
              </p>
            </div>

            {/* Creative Format */}
            <div className="space-y-1.5">
              <Label>Creative Format</Label>
              <div className="flex gap-1.5">
                <Button
                  variant={settings.creativeFormat === "image" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => handleFormatToggle("image")}
                  disabled={updateSettings.isPending}
                >
                  <Image className="h-3.5 w-3.5 mr-1" />
                  Image
                </Button>
                <Button
                  variant={settings.creativeFormat === "video" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => handleFormatToggle("video")}
                  disabled={updateSettings.isPending}
                >
                  <Video className="h-3.5 w-3.5 mr-1" />
                  Video
                </Button>
              </div>
            </div>

            {/* Auto-Launch */}
            <div className="space-y-1.5">
              <Label htmlFor="auto-launch">Auto-Launch</Label>
              <div className="flex items-center gap-2 pt-1">
                <Switch
                  id="auto-launch"
                  checked={settings.autoLaunch}
                  onCheckedChange={handleAutoLaunchToggle}
                  disabled={updateSettings.isPending}
                />
                <span className="text-sm text-muted-foreground">
                  {settings.autoLaunch ? "On" : "Off"}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {isMetaConnected
                  ? "Launch campaigns to Meta automatically after preparation"
                  : "Launch new campaigns automatically after preparation"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Latest Research */}
      {latestResearch && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Latest Ads Research</CardTitle>
            <CardAction>
              <Badge variant="secondary" className="text-[10px]">
                {timeAgo(latestResearch.updatedAt)}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium mb-1">{latestResearch.title}</p>
            <p className="text-sm text-muted-foreground">{latestResearch.excerpt}</p>
          </CardContent>
        </Card>
      )}

      {/* Campaigns */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Campaigns ({campaigns.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No campaigns yet. Click &quot;Prepare New Campaign&quot; to create your first ad campaign.
            </p>
          ) : (
            <div className="space-y-0 divide-y">
              {campaigns.map((campaign) => (
                <CampaignRow
                  key={campaign.id}
                  campaign={campaign}
                  projectId={project.id}
                  expanded={expandedCampaignId === campaign.id}
                  isMetaConnected={isMetaConnected}
                  onToggle={() =>
                    setExpandedCampaignId(
                      expandedCampaignId === campaign.id ? null : campaign.id
                    )
                  }
                  onLaunch={() => launchCampaign.mutate(campaign.id)}
                  onActivate={() => toggleCampaign.mutate({ campaignId: campaign.id, action: "activate" })}
                  onPause={() => toggleCampaign.mutate({ campaignId: campaign.id, action: "pause" })}
                  launching={launchCampaign.isPending}
                  toggling={toggleCampaign.isPending}
                />
              ))}
            </div>
          )}

          {launchCampaign.isError && (
            <p className="text-sm text-destructive mt-3">
              {launchCampaign.error instanceof Error
                ? launchCampaign.error.message
                : "Failed to launch campaign."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Meta Account Configuration ───────────────────────────────────

function MetaAccountConfig({
  projectId,
  connection,
  onDisconnect,
}: {
  projectId: string;
  connection: { accountName: string; metadata?: Record<string, unknown> };
  onDisconnect: () => void;
}) {
  const adAccounts = useMetaAdAccounts(projectId, true);
  const pages = useMetaPages(projectId, true);
  const selectAccount = useSelectMetaAccount(projectId);

  const selectedAdAccountId = connection.metadata?.selectedAdAccountId as string | undefined;
  const selectedAdAccountName = connection.metadata?.selectedAdAccountName as string | undefined;
  const selectedPageId = connection.metadata?.selectedPageId as string | undefined;
  const selectedPageName = connection.metadata?.selectedPageName as string | undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{connection.accountName}</p>
          <p className="text-[10px] text-muted-foreground">Connected to Meta</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onDisconnect}>
          <Unlink className="h-3.5 w-3.5 mr-1" />
          Disconnect
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Ad Account Selector */}
        <div className="space-y-1.5">
          <Label className="text-xs">Ad Account</Label>
          {adAccounts.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading...
            </div>
          ) : adAccounts.data && adAccounts.data.length > 0 ? (
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={selectedAdAccountId || ""}
              onChange={(e) => {
                const account = adAccounts.data?.find((a) => a.id === e.target.value);
                if (account) {
                  selectAccount.mutate({
                    adAccountId: account.id,
                    adAccountName: account.name,
                  });
                }
              }}
            >
              <option value="">Select ad account...</option>
              {adAccounts.data.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.currency})
                </option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-muted-foreground">
              {selectedAdAccountName || "No ad accounts found"}
            </p>
          )}
        </div>

        {/* Page Selector */}
        <div className="space-y-1.5">
          <Label className="text-xs">Facebook Page</Label>
          {pages.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading...
            </div>
          ) : pages.data && pages.data.length > 0 ? (
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={selectedPageId || ""}
              onChange={(e) => {
                const page = pages.data?.find((p) => p.id === e.target.value);
                if (page) {
                  selectAccount.mutate({
                    pageId: page.id,
                    pageName: page.name,
                  });
                }
              }}
            >
              <option value="">Select page...</option>
              {pages.data.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-muted-foreground">
              {selectedPageName || "No pages found"}
            </p>
          )}
        </div>
      </div>

      {selectedAdAccountId && selectedPageId && (
        <p className="text-[10px] text-emerald-600">
          Ready to launch campaigns to {selectedAdAccountName} via {selectedPageName}
        </p>
      )}
      {selectedAdAccountId && !selectedPageId && (
        <p className="text-[10px] text-amber-600">
          Select a Facebook Page to enable campaign creation
        </p>
      )}
    </div>
  );
}

// ─── Campaign Row ─────────────────────────────────────────────────

function CampaignRow({
  campaign,
  projectId,
  expanded,
  isMetaConnected,
  onToggle,
  onLaunch,
  onActivate,
  onPause,
  launching,
  toggling,
}: {
  campaign: AdsCampaign;
  projectId: string;
  expanded: boolean;
  isMetaConnected: boolean;
  onToggle: () => void;
  onLaunch: () => void;
  onActivate: () => void;
  onPause: () => void;
  launching: boolean;
  toggling: boolean;
}) {
  const statusConfig = STATUS_CONFIG[campaign.status] ?? STATUS_CONFIG.draft;
  const showLaunch = campaign.status === "draft" || campaign.status === "ready_for_review";
  const showActivate = campaign.status === "launch_requested" && campaign.externalCampaignId;
  const showPause = campaign.status === "active" && campaign.externalCampaignId;

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium truncate">{campaign.name}</p>
            <Badge
              variant="secondary"
              className={`text-[10px] shrink-0 ${statusConfig.color}`}
            >
              {statusConfig.label}
            </Badge>
            {campaign.externalCampaignId && (
              <Badge variant="outline" className="text-[10px] shrink-0">
                Meta
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-muted-foreground">
              {formatCents(campaign.dailyBudgetCents)}/day
            </span>
            <span className="text-xs text-muted-foreground">
              {campaign.creativeFormat === "video" ? "Video" : "Image"}
            </span>
            <span className="text-xs text-muted-foreground">
              {timeAgo(campaign.createdAt)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {showLaunch && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onLaunch();
              }}
              disabled={launching}
            >
              {launching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <Rocket className="h-3.5 w-3.5 mr-1" />
                  Launch
                </>
              )}
            </Button>
          )}
          {showActivate && (
            <Button
              size="sm"
              variant="outline"
              className="text-emerald-600 border-emerald-300"
              onClick={(e) => {
                e.stopPropagation();
                onActivate();
              }}
              disabled={toggling}
            >
              {toggling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 mr-1" />
                  Activate
                </>
              )}
            </Button>
          )}
          {showPause && (
            <Button
              size="sm"
              variant="outline"
              className="text-orange-600 border-orange-300"
              onClick={(e) => {
                e.stopPropagation();
                onPause();
              }}
              disabled={toggling}
            >
              {toggling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5 mr-1" />
                  Pause
                </>
              )}
            </Button>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {expanded && (
        <CampaignDetails
          campaign={campaign}
          projectId={projectId}
          isMetaConnected={isMetaConnected}
        />
      )}
    </div>
  );
}

// ─── Campaign Details ─────────────────────────────────────────────

function CampaignDetails({
  campaign,
  projectId,
  isMetaConnected,
}: {
  campaign: AdsCampaign;
  projectId: string;
  isMetaConnected: boolean;
}) {
  const { copyBundle, creativeAssets } = campaign;
  const showInsights =
    isMetaConnected &&
    campaign.externalCampaignId &&
    (campaign.status === "active" || campaign.status === "paused");
  const insights = useCampaignInsights(
    projectId,
    showInsights ? campaign.id : null
  );

  return (
    <div className="mt-3 pl-0 space-y-4 text-sm">
      {/* Performance Metrics */}
      {showInsights && insights.data && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground">Performance (Last 7 Days)</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            <MetricCard label="Impressions" value={insights.data.impressions.toLocaleString()} />
            <MetricCard label="Clicks" value={insights.data.clicks.toLocaleString()} />
            <MetricCard label="Spend" value={`$${insights.data.spend}`} />
            <MetricCard label="CTR" value={`${Number(insights.data.ctr).toFixed(2)}%`} />
            <MetricCard label="CPC" value={`$${Number(insights.data.cpc).toFixed(2)}`} />
            <MetricCard label="Reach" value={insights.data.reach.toLocaleString()} />
            <MetricCard label="Conversions" value={insights.data.conversions.toLocaleString()} />
          </div>
        </div>
      )}

      {showInsights && !insights.data && !insights.isLoading && (
        <p className="text-xs text-muted-foreground">No performance data available yet.</p>
      )}

      {/* Target Audience & Objective */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Objective</p>
          <p>{campaign.objective}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Target Audience</p>
          <p>{campaign.targetAudience}</p>
        </div>
      </div>

      {/* Budget Split */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">Budget Split</p>
        <div className="flex gap-4 flex-wrap text-xs sm:text-sm">
          <span>
            Total: <span className="font-medium">{formatCents(campaign.dailyBudgetCents)}</span>
          </span>
          <span>
            Media: <span className="font-medium">{formatCents(campaign.mediaSpendCents)}</span>
          </span>
          <span>
            Fee: <span className="font-medium">{formatCents(campaign.platformFeeCents)}</span>
          </span>
        </div>
      </div>

      {/* External Campaign ID */}
      {campaign.externalCampaignId && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Meta Campaign ID</p>
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{campaign.externalCampaignId}</code>
        </div>
      )}

      {/* Copy Bundle Headlines */}
      {copyBundle.headlines.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Headlines</p>
          <div className="flex flex-wrap gap-1.5">
            {copyBundle.headlines.map((headline, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {headline}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Copy Bundle Body */}
      {copyBundle.primaryText && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Primary Text</p>
          <p className="text-muted-foreground">{copyBundle.primaryText}</p>
        </div>
      )}

      {copyBundle.description && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
          <p className="text-muted-foreground">{copyBundle.description}</p>
        </div>
      )}

      {copyBundle.cta && (
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground">CTA:</p>
          <Badge variant="secondary" className="text-xs">{copyBundle.cta}</Badge>
        </div>
      )}

      {/* Research Summary */}
      {copyBundle.researchSummary && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Research Context</p>
          <p className="text-xs text-muted-foreground">{copyBundle.researchSummary}</p>
        </div>
      )}

      {/* Creative Assets */}
      {creativeAssets.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Creative Assets ({creativeAssets.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {creativeAssets.map((asset) => (
              <div
                key={asset.id}
                className="border rounded-md p-3 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium truncate">{asset.title}</p>
                  <Badge
                    variant="secondary"
                    className={`text-[10px] shrink-0 ${
                      asset.status === "generated"
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-gray-500/10 text-gray-600"
                    }`}
                  >
                    {asset.status}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground line-clamp-2">
                  {asset.prompt}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{asset.kind}</span>
                  <span>{asset.provider} / {asset.model}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Launch Notes */}
      {campaign.launchNotes && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Launch Notes</p>
          <p className="text-xs text-muted-foreground">{campaign.launchNotes}</p>
        </div>
      )}
    </div>
  );
}

// ─── Metric Card ──────────────────────────────────────────────────

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-md p-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
