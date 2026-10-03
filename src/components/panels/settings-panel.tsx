"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Project, ProjectWebsite } from "@/lib/types";

import { useProjectSettings, useUpdateProject, useUpdateProjectSettings, useProjectPricing } from "@/hooks/use-settings";
import { useBillingEvents, useRunIntegrationAction } from "@/hooks/use-integrations";
import { useProjectUsage } from "@/hooks/use-payment-method";
import { useUser, useUpdateUser } from "@/hooks/use-user";
import { useSubscription } from "@/contexts/subscription-context";

interface SettingsPanelProps {
  project: Project;
  website: ProjectWebsite | null;
  onRefresh: () => void;
  onDeployWebsite: () => Promise<void>;
  websiteDeploying: boolean;
  websiteDeployError: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

const EVENT_LABELS: Record<string, string> = {
  "checkout.session.completed": "Checkout completed",
  "invoice.paid": "Invoice paid",
  "invoice.payment_failed": "Payment failed",
  "customer.subscription.deleted": "Subscription cancelled",
  "customer.subscription.paused": "Subscription paused",
  "customer.subscription.resumed": "Subscription resumed",
  "customer.subscription.updated": "Subscription updated",
};

export function SettingsPanel({
  project,
  website,
  onRefresh,
  onDeployWebsite,
  websiteDeploying,
  websiteDeployError,
}: SettingsPanelProps) {
  const [name, setName] = useState(project.name);
  const [saving, setSaving] = useState(false);
  const [autoSendOutreach, setAutoSendOutreach] = useState(false);
  const [autoRespondCustomer, setAutoRespondCustomer] = useState(true);
  const [adsAutoLaunch, setAdsAutoLaunch] = useState(true);
  const [autonomousMode, setAutonomousMode] = useState(true);
  const [showInShowcase, setShowInShowcase] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [emailActionLoading, setEmailActionLoading] = useState(false);
  const [tweetActionLoading, setTweetActionLoading] = useState(false);
  const [cloudflareActionLoading, setCloudflareActionLoading] = useState(false);
  const [integrationMessage, setIntegrationMessage] = useState<string | null>(null);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [resettingCompany, setResettingCompany] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [billingPortalLoading, setBillingPortalLoading] = useState(false);
  const [connectLinkLoading, setConnectLinkLoading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [customDomain, setCustomDomain] = useState("");
  const [savingDomain, setSavingDomain] = useState(false);
  const [domainMessage, setDomainMessage] = useState<string | null>(null);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [showDnsGuide, setShowDnsGuide] = useState(false);
  const [customEmailDomain, setCustomEmailDomain] = useState("");
  const [savingEmailDomain, setSavingEmailDomain] = useState(false);
  const [emailDomainMessage, setEmailDomainMessage] = useState<string | null>(null);
  const [emailDomainError, setEmailDomainError] = useState<string | null>(null);
  const [emailDomainStatus, setEmailDomainStatus] = useState<Record<string, unknown> | null>(null);
  const [showEmailDnsGuide, setShowEmailDnsGuide] = useState(false);

  // Team management state
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; user_id: string; role: string; name: string; email: string; avatar_url: string | null }>>([]);
  const [teamInvitations, setTeamInvitations] = useState<Array<{ id: string; email: string; role: string; expires_at: string }>>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamMessage, setTeamMessage] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { data: billingEvents = [] } = useBillingEvents(project.id);
  const { data: settings } = useProjectSettings(project.id);
  const { mutateAsync: updateProject } = useUpdateProject(project.id);
  const { mutateAsync: updateSettings } = useUpdateProjectSettings(project.id);
  const { mutateAsync: runIntegration } = useRunIntegrationAction(project.id);
  const { data: usageData } = useProjectUsage(project.id);
  const { data: pricingData } = useProjectPricing(project.id);
  const { data: userData } = useUser();
  const { mutateAsync: updateUser } = useUpdateUser();
  const { subscriptionStatus, openCreditModal } = useSubscription();
  const isSubscribed = subscriptionStatus === "active";

  useEffect(() => {
    if (settings) {
      setAutoSendOutreach(settings.outreach_auto_send ?? false);
      setAutoRespondCustomer(settings.email_auto_respond ?? true);
      setAdsAutoLaunch(settings.ads_auto_launch ?? true);
      setShowInShowcase(settings.show_in_showcase ?? true);
    }
  }, [settings]);

  useEffect(() => {
    setAutonomousMode(project.autonomous_mode !== false);
  }, [project]);

  useEffect(() => {
    if (userData?.name) setProfileName(userData.name);
  }, [userData?.name]);

  const fetchTeamMembers = useCallback(async () => {
    setTeamLoading(true);
    setTeamError(null);
    try {
      const res = await fetch(`/api/team?projectId=${project.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load team");
      setTeamMembers(data.members || []);
      setTeamInvitations(data.invitations || []);
      setCurrentUserRole(data.currentUserRole || null);
    } catch (err: any) {
      setTeamError(err.message || "Failed to load team");
    } finally {
      setTeamLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    fetchTeamMembers();
  }, [fetchTeamMembers]);

  async function handleInviteMember() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setTeamError(null);
    setTeamMessage(null);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send invitation");
      setTeamMessage(`Invitation sent to ${inviteEmail.trim()}`);
      setInviteEmail("");
      setInviteRole("member");
      setShowInviteForm(false);
      fetchTeamMembers();
    } catch (err: any) {
      setTeamError(err.message || "Failed to send invitation");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(memberId: string) {
    setRemovingId(memberId);
    setTeamError(null);
    setTeamMessage(null);
    try {
      const res = await fetch(`/api/team?projectId=${project.id}&memberId=${memberId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove member");
      setTeamMessage("Member removed");
      fetchTeamMembers();
    } catch (err: any) {
      setTeamError(err.message || "Failed to remove member");
    } finally {
      setRemovingId(null);
    }
  }

  async function handleCancelInvitation(invitationId: string) {
    setRemovingId(invitationId);
    setTeamError(null);
    setTeamMessage(null);
    try {
      const res = await fetch(`/api/team?projectId=${project.id}&invitationId=${invitationId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel invitation");
      setTeamMessage("Invitation cancelled");
      fetchTeamMembers();
    } catch (err: any) {
      setTeamError(err.message || "Failed to cancel invitation");
    } finally {
      setRemovingId(null);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateProject({ name });
      onRefresh();
    } catch {
      //
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCustomDomain() {
    const trimmed = customDomain.trim().toLowerCase();
    if (!trimmed) return;
    setSavingDomain(true);
    setDomainMessage(null);
    setDomainError(null);
    try {
      const res = await fetch("/api/projects/custom-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, domain: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add custom domain");
      setDomainMessage(data.message || `Custom domain ${trimmed} connected.`);
      setCustomDomain("");
      onRefresh();
    } catch (err: any) {
      setDomainError(err.message || "Failed to add custom domain");
    } finally {
      setSavingDomain(false);
    }
  }

  async function handleSaveCustomEmailDomain() {
    const trimmed = customEmailDomain.trim().toLowerCase();
    if (!trimmed) return;
    setSavingEmailDomain(true);
    setEmailDomainMessage(null);
    setEmailDomainError(null);
    try {
      const res = await fetch("/api/projects/custom-email-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, domain: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add email domain");
      setEmailDomainStatus(data.dnsRecords || null);
      setEmailDomainMessage(data.message || `Email domain ${trimmed} added. Configure DNS records below.`);
      setShowEmailDnsGuide(true);
      setCustomEmailDomain("");
      onRefresh();
    } catch (err: any) {
      setEmailDomainError(err.message || "Failed to add email domain");
    } finally {
      setSavingEmailDomain(false);
    }
  }

  async function handleVerifyEmailDomain() {
    setSavingEmailDomain(true);
    setEmailDomainError(null);
    try {
      const res = await fetch("/api/projects/custom-email-domain/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      setEmailDomainStatus(data.status || null);
      setEmailDomainMessage(
        data.verified
          ? "Email domain verified! Emails will now send from your custom domain."
          : "DNS records not yet verified. It can take up to 48 hours for DNS changes to propagate."
      );
      onRefresh();
    } catch (err: any) {
      setEmailDomainError(err.message || "Verification check failed");
    } finally {
      setSavingEmailDomain(false);
    }
  }

  async function handleSaveProfile() {
    if (!profileName.trim()) return;
    setSavingProfile(true);
    try {
      await updateUser({ name: profileName.trim() });
    } catch {
      //
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleOpenBillingPortal() {
    setBillingPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/billing-portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
      }
    } catch {
      // portal may not be available for free users
    } finally {
      setBillingPortalLoading(false);
    }
  }

  async function handleToggleAutonomousMode(checked: boolean) {
    setSavingSettings(true);
    setAutonomousMode(checked);
    try {
      await updateProject({ autonomous_mode: checked });
    } catch {
      setAutonomousMode(!checked);
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleToggleAutoSend(checked: boolean) {
    setSavingSettings(true);
    setAutoSendOutreach(checked);
    try {
      await updateSettings({ outreach_auto_send: checked });
    } catch {
      setAutoSendOutreach(!checked); // revert optimistic update
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleToggleAutoRespondCustomer(checked: boolean) {
    setSavingSettings(true);
    setAutoRespondCustomer(checked);
    try {
      await updateSettings({ email_auto_respond: checked });
    } catch {
      setAutoRespondCustomer(!checked);
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleToggleAdsAutoLaunch(checked: boolean) {
    setSavingSettings(true);
    setAdsAutoLaunch(checked);
    try {
       await updateSettings({ ads_auto_launch: checked });
    } catch {
       setAdsAutoLaunch(!checked); // revert optimistic update
    } finally {
       setSavingSettings(false);
    }
  }

  async function handleToggleShowcase(checked: boolean) {
    // Only subscribed users can toggle showcase visibility off
    if (!checked && !isSubscribed) {
      openCreditModal();
      return;
    }
    setSavingSettings(true);
    setShowInShowcase(checked);
    try {
      await updateSettings({ show_in_showcase: checked });
    } catch {
      setShowInShowcase(!checked);
    } finally {
      setSavingSettings(false);
    }
  }

  async function runIntegrationAction(action: "create_email_address" | "post_launch_tweet" | "deploy_cloudflare") {
    setIntegrationError(null);
    setIntegrationMessage(null);
    if (action === "create_email_address") setEmailActionLoading(true);
    if (action === "post_launch_tweet") setTweetActionLoading(true);
    if (action === "deploy_cloudflare") setCloudflareActionLoading(true);

    try {
      const data = await runIntegration(action);

      if (action === "create_email_address") {
        setIntegrationMessage(`Email created: ${data.companyEmail}`);
      } else if (action === "deploy_cloudflare") {
        setIntegrationMessage(`Website deployed to ${data.siteUrl}`);
      } else {
        setIntegrationMessage(data.alreadyPosted ? "Launch tweet already exists." : "Launch tweet posted.");
      }
      onRefresh();
    } catch (err: any) {
      setIntegrationError(err.message || "Integration action failed. Please try again.");
    } finally {
      setEmailActionLoading(false);
      setTweetActionLoading(false);
      setCloudflareActionLoading(false);
    }
  }

  async function handleDevResetCompany() {
    if (process.env.NODE_ENV === "production") return;
    const confirmed = window.confirm(
      "This will delete this company and its associated database, domain, and repo so you can rerun onboarding.\n\nThis is intended for local development only.\n\nContinue?"
    );
    if (!confirmed) return;

    setResetError(null);
    setResettingCompany(true);

    try {
      const res = await fetch("/api/dev/reset-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.success) {
        setResetError(data?.error || "Failed to reset company. Check server logs.");
        return;
      }

      // After reset, send the user back to the dashboard root so they can start a fresh onboarding run.
      window.location.href = "/dashboard";
    } catch {
      setResetError("Failed to reset company. Check server logs.");
    } finally {
      setResettingCompany(false);
    }
  }

  const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
  const emailStatus = project.email_setup_status || (project.company_email ? "configured" : "pending");
  const tweetStatus = project.tweet_setup_status || (project.first_tweet_url ? "configured" : "pending");
  const websiteStatus = website?.deploymentStatus === "deploying"
    ? "deploying"
    : website?.deploymentStatus === "failed"
    ? "failed"
    : website?.published
      ? (website.hasUnpublishedChanges ? "live + draft" : "live")
      : website?.previewHtml
        ? "preview only"
        : "not built";
  const websiteStatusVariant: "default" | "secondary" | "destructive" = website?.deploymentStatus === "failed"
    ? "destructive"
    : website?.published
      ? "default"
      : "secondary";

  const cloudflareStatus = project.cloudflare_setup_status || (website?.published ? "configured" : "pending");
  const cloudflareFailed = cloudflareStatus === "failed";
  const websiteOk = website?.published && websiteStatus !== "failed";
  const allIntegrationsConfigured = cloudflareStatus === "configured" && emailStatus === "configured" && tweetStatus === "configured";
  const websiteFailed = websiteStatus === "failed";
  const emailFailed = emailStatus === "failed";
  const tweetFailed = tweetStatus === "failed";

  return (
    <div className="p-4 sm:p-6 max-w-2xl space-y-6">
      <h2 className="text-lg font-semibold">Settings</h2>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">Your Name</Label>
            <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} className="mt-1" placeholder="Your full name" />
            <p className="text-[10px] text-muted-foreground mt-1">
              Used when AI writes emails on your behalf (e.g. sign-offs).
            </p>
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input value={userData?.email ?? ""} disabled className="mt-1" />
          </div>
          <Button onClick={handleSaveProfile} disabled={savingProfile || !profileName.trim() || profileName === userData?.name}>
            {savingProfile ? "Saving..." : "Save Profile"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">Company Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Slug</Label>
            <Input value={project.slug} disabled className="mt-1 font-mono" />
            <p className="text-[10px] text-muted-foreground mt-1">
              Website: {project.slug}.{companyDomain} | Email: {project.slug}@{companyDomain}
            </p>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custom Website Domain</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {project.custom_domain ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="default">Connected</Badge>
                <span className="font-mono text-sm font-medium">{project.custom_domain}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Your site is accessible at both {project.slug}.{companyDomain} and {project.custom_domain}
              </p>
            </div>
          ) : (
            <>
              {!isSubscribed ? (
                <p className="text-sm text-muted-foreground">
                  Upgrade to Pro to use your own domain instead of {project.slug}.{companyDomain}
                </p>
              ) : (
                <>
                  <div>
                    <Label className="text-xs">Your Domain</Label>
                    <Input
                      value={customDomain}
                      onChange={(e) => setCustomDomain(e.target.value)}
                      className="mt-1 font-mono"
                      placeholder="www.yourbusiness.com"
                    />
                  </div>

                  <button
                    onClick={() => setShowDnsGuide(!showDnsGuide)}
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    {showDnsGuide ? "Hide setup guide" : "How do I connect my domain?"}
                  </button>

                  {showDnsGuide && (
                    <div className="rounded-md border bg-muted/30 p-4 space-y-3 text-xs">
                      <p className="font-semibold text-foreground">Setup Instructions:</p>
                      <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                        <li>Log into your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.)</li>
                        <li>Go to <strong>DNS Settings</strong> for your domain</li>
                        <li>
                          Add a <strong>CNAME record</strong>:
                          <div className="mt-1 rounded border bg-background p-2 font-mono text-[11px] space-y-1">
                            <div><span className="text-muted-foreground">Type:</span> <strong>CNAME</strong></div>
                            <div><span className="text-muted-foreground">Name/Host:</span> <strong>www</strong> (or <strong>@</strong> for root domain)</div>
                            <div><span className="text-muted-foreground">Value/Target:</span> <strong>{project.slug}.pages.dev</strong></div>
                            <div><span className="text-muted-foreground">TTL:</span> Auto</div>
                          </div>
                        </li>
                        <li>Wait 5-10 minutes for DNS to propagate</li>
                        <li>Enter your domain above and click <strong>Connect Domain</strong></li>
                      </ol>
                      <p className="text-muted-foreground border-t pt-2">
                        <strong>Root domain (yourbusiness.com without www)?</strong> Some registrars don&apos;t support CNAME on root.
                        Use an ALIAS/ANAME record if available, or use www.yourbusiness.com and set up a redirect from the root.
                      </p>
                    </div>
                  )}

                  <Button
                    onClick={handleSaveCustomDomain}
                    disabled={savingDomain || !customDomain.trim()}
                  >
                    {savingDomain ? "Connecting..." : "Connect Domain"}
                  </Button>
                </>
              )}
            </>
          )}
          {domainMessage && <p className="text-xs text-emerald-600">{domainMessage}</p>}
          {domainError && <p className="text-xs text-destructive">{domainError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custom Email Domain</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isSubscribed ? (
            <p className="text-sm text-muted-foreground">
              Upgrade to Pro to send and receive emails from your own domain instead of {project.slug}@{companyDomain}
            </p>
          ) : project.custom_email_domain ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant={project.email_domain_verified ? "default" : "secondary"}>
                  {project.email_domain_verified ? "Verified" : "Pending verification"}
                </Badge>
                <span className="font-mono text-sm font-medium">{project.custom_email_domain}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {project.email_domain_verified
                  ? `Emails send from ${project.slug}@${project.custom_email_domain}. Customers can reply directly.`
                  : "DNS records need to be verified before emails can send from your domain."}
              </p>
              {!project.email_domain_verified && (
                <>
                  <button
                    onClick={() => setShowEmailDnsGuide(!showEmailDnsGuide)}
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    {showEmailDnsGuide ? "Hide DNS records" : "Show required DNS records"}
                  </button>
                  {showEmailDnsGuide && (
                    <div className="rounded-md border bg-muted/30 p-4 space-y-3 text-xs">
                      <p className="font-semibold text-foreground">Add these DNS records to {project.custom_email_domain}:</p>
                      <div className="space-y-2">
                        <div className="rounded border bg-background p-2 font-mono text-[11px]">
                          <div className="font-semibold text-foreground mb-1">1. DKIM (Required)</div>
                          <div><span className="text-muted-foreground">Type:</span> TXT</div>
                          <div><span className="text-muted-foreground">Host:</span> {emailDomainStatus?.dkimHost as string || `[provided after setup]`}</div>
                          <div><span className="text-muted-foreground">Value:</span> <span className="break-all">{emailDomainStatus?.dkimValue as string || `[provided after setup]`}</span></div>
                        </div>
                        <div className="rounded border bg-background p-2 font-mono text-[11px]">
                          <div className="font-semibold text-foreground mb-1">2. Return-Path (Required)</div>
                          <div><span className="text-muted-foreground">Type:</span> CNAME</div>
                          <div><span className="text-muted-foreground">Host:</span> pm-bounces</div>
                          <div><span className="text-muted-foreground">Value:</span> pm.mtasv.net</div>
                        </div>
                        <div className="rounded border bg-background p-2 font-mono text-[11px]">
                          <div className="font-semibold text-foreground mb-1">3. MX Record (for receiving email)</div>
                          <div><span className="text-muted-foreground">Type:</span> MX</div>
                          <div><span className="text-muted-foreground">Host:</span> {project.slug}</div>
                          <div><span className="text-muted-foreground">Value:</span> inbound.postmarkapp.com</div>
                          <div><span className="text-muted-foreground">Priority:</span> 10</div>
                        </div>
                      </div>
                      <p className="text-muted-foreground border-t pt-2">
                        DNS changes can take up to 48 hours to propagate. Click &ldquo;Verify&rdquo; to check.
                      </p>
                    </div>
                  )}
                  <Button
                    onClick={handleVerifyEmailDomain}
                    disabled={savingEmailDomain}
                    variant="outline"
                    size="sm"
                  >
                    {savingEmailDomain ? "Checking..." : "Verify DNS Records"}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <>
              <div>
                <Label className="text-xs">Email Domain</Label>
                <Input
                  value={customEmailDomain}
                  onChange={(e) => setCustomEmailDomain(e.target.value)}
                  className="mt-1 font-mono"
                  placeholder="yourbusiness.com"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Send and receive emails as {project.slug}@yourdomain.com. AI agents will use your domain for all outreach.
                </p>
              </div>

              <button
                onClick={() => setShowEmailDnsGuide(!showEmailDnsGuide)}
                className="text-xs text-primary hover:underline font-medium"
              >
                {showEmailDnsGuide ? "Hide details" : "What DNS records are needed?"}
              </button>

              {showEmailDnsGuide && (
                <div className="rounded-md border bg-muted/30 p-4 space-y-2 text-xs text-muted-foreground">
                  <p>After adding your domain, you&apos;ll need to configure 3 DNS records:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>DKIM</strong> (TXT record) — authenticates your emails so they don&apos;t go to spam</li>
                    <li><strong>Return-Path</strong> (CNAME record) — handles bounced emails</li>
                    <li><strong>MX Record</strong> — lets your domain receive incoming emails from customers</li>
                  </ul>
                  <p>We&apos;ll show the exact records after you add your domain.</p>
                </div>
              )}

              <Button
                onClick={handleSaveCustomEmailDomain}
                disabled={savingEmailDomain || !customEmailDomain.trim()}
              >
                {savingEmailDomain ? "Adding..." : "Add Email Domain"}
              </Button>
            </>
          )}
          {emailDomainMessage && <p className="text-xs text-emerald-600">{emailDomainMessage}</p>}
          {emailDomainError && <p className="text-xs text-destructive">{emailDomainError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Showcase</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Show on artha.run/companies</Label>
              <p className="text-xs text-muted-foreground">
                {isSubscribed
                  ? "Feature your company on the Artha showcase page. Other users can discover your site and see what you've built."
                  : "Subscribe to Pro to control your showcase visibility."}
              </p>
            </div>
            <Switch
              checked={showInShowcase}
              onCheckedChange={handleToggleShowcase}
              disabled={savingSettings}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscription</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm">Status:</span>
            <Badge variant={project.subscription_status === "active" ? "default" : "secondary"}>
              {project.subscription_status}
            </Badge>
          </div>
          {project.current_period_end && (
            <p className="text-sm text-muted-foreground">
              Current period ends: {new Date(project.current_period_end).toLocaleDateString()}
            </p>
          )}
          <div className="text-sm space-y-1">
            <p>Task credits: <strong>{project.task_credits}</strong></p>
          </div>
          {project.subscription_status === "active" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenBillingPortal}
              disabled={billingPortalLoading}
            >
              {billingPortalLoading ? "Opening..." : "Manage Subscription"}
            </Button>
          )}
          <p className="text-[10px] text-muted-foreground">
            {project.subscription_status === "active"
              ? "View invoices, update payment method, or cancel your subscription via Stripe."
              : "Subscribe to Pro to unlock nightly automated tasks and more credits."}
          </p>
        </CardContent>
      </Card>

      {pricingData && pricingData.plans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payments & Checkout</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm">Stripe Connect:</span>
              <Badge variant={pricingData.connectAccountId ? "default" : "secondary"}>
                {pricingData.connectAccountId ? "Connected" : "Not set up"}
              </Badge>
            </div>
            {!pricingData.connectAccountId && (
              <p className="text-xs text-muted-foreground">
                Complete Stripe onboarding to receive payments from your customers.
                Checkout pages will show &ldquo;payment setup incomplete&rdquo; until this is done.
              </p>
            )}
            {pricingData.connectAccountId && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setConnectLinkLoading(true);
                  try {
                    const res = await fetch("/api/stripe/connect", { method: "POST" });
                    const data = await res.json();
                    if (data.url) window.open(data.url, "_blank");
                  } catch { /* */ }
                  finally { setConnectLinkLoading(false); }
                }}
                disabled={connectLinkLoading}
              >
                {connectLinkLoading ? "Opening..." : "Manage Stripe Account"}
              </Button>
            )}

            <div className="space-y-2 mt-3">
              <Label className="text-xs font-medium">Pricing Plans</Label>
              {pricingData.plans.map((plan) => (
                <div key={plan.id} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{plan.name}</p>
                      <p className="text-xs text-muted-foreground">
                        ${(plan.amountCents / 100).toFixed(2)}/{plan.billingInterval}
                        {plan.features.length > 0 && ` \u2022 ${plan.features.length} features`}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {plan.slug}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={plan.checkoutUrl}
                      readOnly
                      className="text-xs font-mono h-7 bg-muted"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(plan.checkoutUrl);
                        setCopiedUrl(plan.id);
                        setTimeout(() => setCopiedUrl(null), 2000);
                      }}
                    >
                      {copiedUrl === plan.id ? "Copied!" : "Copy"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              These checkout URLs are automatically embedded in your website pricing section.
              You can also share them directly with customers.
            </p>
          </CardContent>
        </Card>
      )}

      {usageData && project.neon_connection_url && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Storage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span className="font-medium text-foreground">Database</span>
                <span>
                  {formatBytes(usageData.storage_bytes)} / {formatBytes(usageData.storage_limit_bytes)} free
                  {usageData.overage_credits > 0 && (
                    <span className="text-amber-600 ml-1">+{usageData.overage_credits} credits/mo</span>
                  )}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    usageData.storage_bytes > usageData.storage_limit_bytes
                      ? "bg-amber-500"
                      : "bg-primary"
                  }`}
                  style={{
                    width: `${Math.min(100, (usageData.storage_bytes / usageData.storage_limit_bytes) * 100)}%`,
                  }}
                />
              </div>
            </div>
            {(usageData.file_storage_bytes > 0 || usageData.file_storage_overage_credits > 0) && (
              <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span className="font-medium text-foreground">File Storage</span>
                  <span>
                    {formatBytes(usageData.file_storage_bytes)} / {formatBytes(usageData.file_storage_limit_bytes)} free
                    {usageData.file_storage_overage_credits > 0 && (
                      <span className="text-amber-600 ml-1">+{usageData.file_storage_overage_credits} credits/mo</span>
                    )}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      usageData.file_storage_bytes > usageData.file_storage_limit_bytes
                        ? "bg-amber-500"
                        : "bg-blue-500"
                    }`}
                    style={{
                      width: `${Math.min(100, (usageData.file_storage_bytes / usageData.file_storage_limit_bytes) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Database: 100MB free, 0.5 credits/month keep-alive{usageData.storage_bytes > usageData.storage_limit_bytes ? " + 0.5 per extra 100MB" : ""}.
              {(usageData.file_storage_bytes > 0 || usageData.file_storage_overage_credits > 0) ? " Files: 200MB free, 1 credit per extra 200MB/month." : ""}
            </p>
          </CardContent>
        </Card>
      )}

      {billingEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Billing activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {billingEvents.map((ev) => (
                  <div key={ev.stripe_event_id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                    <div>
                      <p className="font-medium">{EVENT_LABELS[ev.type] || ev.type}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(ev.created_at).toLocaleString()}
                        {ev.livemode ? "" : " (test)"}
                      </p>
                    </div>
                    <Badge variant={ev.processed ? "default" : "destructive"} className="text-[10px]">
                      {ev.processed ? "OK" : ev.error_message || "Pending"}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Autonomous Agents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Autonomous mode</Label>
              <p className="text-xs text-muted-foreground">
                When enabled, AI agents proactively review your company every 6 hours
                and autonomously run tasks, generate content, and find leads.
                Uses task credits.
              </p>
            </div>
            <Switch
              checked={autonomousMode}
              onCheckedChange={handleToggleAutonomousMode}
              disabled={savingSettings}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Auto-send outreach emails</Label>
              <p className="text-xs text-muted-foreground">
                When enabled, cold outreach and newsletter emails send without confirmation.
                You can still review them in the Email panel.
              </p>
            </div>
            <Switch
              checked={autoSendOutreach}
              onCheckedChange={handleToggleAutoSend}
              disabled={savingSettings}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Auto-respond to customer emails</Label>
              <p className="text-xs text-muted-foreground">
                When enabled, AI automatically responds to incoming customer emails
                using your company context. Uses task credits.
              </p>
            </div>
            <Switch
              checked={autoRespondCustomer}
              onCheckedChange={handleToggleAutoRespondCustomer}
              disabled={savingSettings}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ads Automation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Auto-launch ads after draft generation</Label>
              <p className="text-xs text-muted-foreground">
                When enabled, campaigns created from the Meta Ads tab move straight into
                launch handoff. Disable it to require manual confirmation after the draft is
                generated.
              </p>
            </div>
            <Switch
              checked={adsAutoLaunch}
              onCheckedChange={handleToggleAdsAutoLaunch}
              disabled={savingSettings}
            />
          </div>
          <div className="rounded-md border p-3 text-xs text-muted-foreground">
            Meta spend stays in the customer&apos;s ad account. Stripe should only bill the Artha
            platform fee.
          </div>
        </CardContent>
      </Card>

      {!allIntegrationsConfigured && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Integrations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cloudflareStatus !== "configured" && (
              <div className={cn(
                "space-y-2 border rounded-md p-3",
                cloudflareFailed && "border-yellow-400 bg-yellow-50 dark:bg-yellow-950/20"
              )}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Website Deployment</p>
                    <p className="text-xs text-muted-foreground">
                      {website?.published && !cloudflareFailed
                        ? `Live at ${project.slug}.${companyDomain}`
                        : website?.previewHtml || website?.published
                          ? `Deploy to ${project.slug}.${companyDomain}`
                          : "No website draft available yet"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={cloudflareFailed ? "destructive" : "secondary"}>
                      {cloudflareStatus}
                    </Badge>
                    {website?.previewHtml && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cloudflareActionLoading}
                        onClick={() => runIntegrationAction("deploy_cloudflare")}
                      >
                        {cloudflareActionLoading ? "Deploying..." : "Deploy to Cloudflare"}
                      </Button>
                    )}
                  </div>
                </div>
                {website?.published && (
                  <a
                    href={website.liveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Open live site ↗
                  </a>
                )}
                {cloudflareFailed && (project.cloudflare_setup_error || website?.deploymentError) && (
                  <p className="text-xs text-destructive">
                    Last error: {project.cloudflare_setup_error || website?.deploymentError}
                  </p>
                )}
              </div>
            )}

            {emailStatus !== "configured" && (
              <div className={cn(
                "space-y-2 border rounded-md p-3",
                emailFailed && "border-yellow-400 bg-yellow-50 dark:bg-yellow-950/20"
              )}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Company Email</p>
                    <p className="text-xs text-muted-foreground">
                      {project.company_email || `${project.slug}@${companyDomain}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={emailFailed ? "destructive" : "secondary"}
                    >
                      {emailStatus}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={emailActionLoading}
                      onClick={() => runIntegrationAction("create_email_address")}
                    >
                      {emailActionLoading ? "Creating..." : "Create email address"}
                    </Button>
                  </div>
                </div>
                {project.email_setup_error && (
                  <p className="text-xs text-destructive">Last error: {project.email_setup_error}</p>
                )}
              </div>
            )}

            {tweetStatus !== "configured" && tweetStatus !== "skipped" && (
              <div className={cn(
                "space-y-2 border rounded-md p-3",
                tweetFailed && "border-yellow-400 bg-yellow-50 dark:bg-yellow-950/20"
              )}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Launch Tweet</p>
                    <p className="text-xs text-muted-foreground">
                      {project.first_tweet_url ? "Tweet link saved" : "No launch tweet posted yet"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={tweetFailed ? "destructive" : "secondary"}
                    >
                      {tweetStatus}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={tweetActionLoading}
                      onClick={() => runIntegrationAction("post_launch_tweet")}
                    >
                      {tweetActionLoading ? "Posting..." : "Post launch tweet"}
                    </Button>
                  </div>
                </div>
                {project.first_tweet_url && (
                  <a
                    href={project.first_tweet_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    View tweet ↗
                  </a>
                )}
                {project.tweet_setup_error && (
                  <p className="text-xs text-destructive">Last error: {project.tweet_setup_error}</p>
                )}
              </div>
            )}

            {integrationMessage && <p className="text-xs text-emerald-600">{integrationMessage}</p>}
            {integrationError && <p className="text-xs text-destructive">{integrationError}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {teamLoading && teamMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading team...</p>
          ) : (
            <>
              <div className="space-y-2">
                {teamMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      {member.avatar_url ? (
                        <img src={member.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                          {(member.name || member.email || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium">{member.name || member.email}</p>
                        {member.name && <p className="text-xs text-muted-foreground">{member.email}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={member.role === "owner" ? "default" : "secondary"} className="text-[10px]">
                        {member.role}
                      </Badge>
                      {member.role !== "owner" && (currentUserRole === "owner" || currentUserRole === "admin") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => handleRemoveMember(member.id)}
                          disabled={removingId === member.id}
                        >
                          {removingId === member.id ? "..." : "Remove"}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {teamInvitations.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Pending Invitations</Label>
                  {teamInvitations.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                          {inv.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm">{inv.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">Pending</Badge>
                        <Badge variant="secondary" className="text-[10px]">{inv.role}</Badge>
                        {(currentUserRole === "owner" || currentUserRole === "admin") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => handleCancelInvitation(inv.id)}
                            disabled={removingId === inv.id}
                          >
                            {removingId === inv.id ? "..." : "Cancel"}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(currentUserRole === "owner" || currentUserRole === "admin") && (
                <>
                  {showInviteForm ? (
                    <div className="space-y-3 border rounded-md p-3">
                      <div>
                        <Label className="text-xs">Email address</Label>
                        <Input
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          className="mt-1"
                          placeholder="colleague@example.com"
                          type="email"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Role</Label>
                        <select
                          value={inviteRole}
                          onChange={(e) => setInviteRole(e.target.value)}
                          className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleInviteMember} disabled={inviting || !inviteEmail.trim()} size="sm">
                          {inviting ? "Sending..." : "Send Invitation"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setShowInviteForm(false); setInviteEmail(""); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setShowInviteForm(true)}>
                      Invite Member
                    </Button>
                  )}
                </>
              )}

              {teamMessage && <p className="text-xs text-emerald-600">{teamMessage}</p>}
              {teamError && <p className="text-xs text-destructive">{teamError}</p>}
            </>
          )}
        </CardContent>
      </Card>

      {process.env.NODE_ENV !== "production" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-red-600">Development only</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Delete this company and its isolated database, domain, and repo so you can rerun the onboarding pipeline
              from scratch. This action is only available in local development.
            </p>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDevResetCompany}
              disabled={resettingCompany}
            >
              {resettingCompany ? "Resetting company..." : "Reset company (dev only)"}
            </Button>
            {resetError && <p className="text-xs text-destructive">{resetError}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
