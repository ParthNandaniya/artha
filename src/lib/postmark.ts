import * as postmark from "postmark";
import { getDb } from "./neon";
import { handleBounce } from "./email-warmup";

export type PostmarkScope = "platform" | "company";
export type PostmarkSendMode = "transactional" | "broadcast";

export type PostmarkSetupReport = {
  scope: PostmarkScope;
  ok: boolean;
  issues: string[];
  warnings: string[];
};

const APP_NAME = "Artha";

function getConfiguredEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  if (!value || value === "...") return null;
  return value;
}

function getLegacyServerToken(): string | null {
  return getConfiguredEnv("POSTMARK_SERVER_TOKEN");
}

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function normalizeUrl(value?: string | null): string {
  return (value || "").trim().replace(/\/+$/, "");
}

function getAppUrl(): string {
  return normalizeUrl(process.env.NEXT_PUBLIC_APP_URL) || "https://artha.run";
}

function getAppDomain(): string {
  return getConfiguredEnv("NEXT_PUBLIC_APP_DOMAIN") || "artha.run";
}

function getCompanyDomain(): string {
  return getConfiguredEnv("NEXT_PUBLIC_COMPANY_DOMAIN") || "tryartha.com";
}

function getAgentAddress(): string {
  return `agents@${getAppDomain()}`;
}

function getAgentFrom(): string {
  return `${APP_NAME} <${getAgentAddress()}>`;
}

function getConfiguredInboundWebhookUrl(): string {
  const configuredUrl = getConfiguredEnv("POSTMARK_INBOUND_WEBHOOK_URL");
  if (!configuredUrl) return `${getAppUrl()}/api/postmark/inbound`;

  try {
    const parsed = new URL(configuredUrl);
    parsed.searchParams.delete("secret");
    return normalizeUrl(parsed.toString());
  } catch {
    return normalizeUrl(configuredUrl);
  }
}

function getServerToken(scope: PostmarkScope): string | null {
  const scopedToken = scope === "platform"
    ? getConfiguredEnv("POSTMARK_PLATFORM_SERVER_TOKEN")
    : getConfiguredEnv("POSTMARK_COMPANY_SERVER_TOKEN");
  return scopedToken || getLegacyServerToken() || null;
}

function getServerId(scope: PostmarkScope): number | null {
  const rawValue = scope === "platform"
    ? process.env.POSTMARK_PLATFORM_SERVER_ID
    : process.env.POSTMARK_COMPANY_SERVER_ID;
  if (!rawValue?.trim()) return null;

  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getClient(scope: PostmarkScope) {
  const token = getServerToken(scope);
  if (!token) {
    const envName = scope === "platform"
      ? "POSTMARK_PLATFORM_SERVER_TOKEN"
      : "POSTMARK_COMPANY_SERVER_TOKEN";
    throw new Error(`Postmark ${scope} email is not configured (missing ${envName} or POSTMARK_SERVER_TOKEN).`);
  }

  return new postmark.ServerClient(token);
}

function getAccountClient() {
  const token = getConfiguredEnv("POSTMARK_ACCOUNT_TOKEN");
  if (!token) return null;
  return new postmark.AccountClient(token);
}

function getDefaultMessageStream(scope: PostmarkScope, mode: PostmarkSendMode): string {
  if (scope === "platform") {
    if (mode === "broadcast") {
      return process.env.POSTMARK_PLATFORM_BROADCAST_MESSAGE_STREAM?.trim() || "broadcasts";
    }
    return process.env.POSTMARK_PLATFORM_MESSAGE_STREAM?.trim() || "outbound";
  }

  if (mode === "broadcast") {
    return process.env.POSTMARK_COMPANY_BROADCAST_MESSAGE_STREAM?.trim() || "broadcasts";
  }
  return process.env.POSTMARK_COMPANY_MESSAGE_STREAM?.trim() || "outbound";
}

function buildThreadHeaders(inReplyTo?: string) {
  if (!inReplyTo) return undefined;
  return [
    { Name: "In-Reply-To", Value: inReplyTo },
    { Name: "References", Value: inReplyTo },
  ];
}

// --- Custom email domain management ---

export async function addSenderDomain(domain: string): Promise<{
  dkimHost: string;
  dkimValue: string;
  returnPathHost: string;
  returnPathValue: string;
}> {
  const accountClient = getAccountClient();
  if (!accountClient) {
    throw new Error("Postmark account token not configured. Set POSTMARK_ACCOUNT_TOKEN.");
  }

  try {
    const result = await accountClient.createDomain({ Name: domain });
    return {
      dkimHost: result.DKIMHost || `${result.DKIMPendingHost || ""}`,
      dkimValue: result.DKIMTextValue || `${result.DKIMPendingTextValue || ""}`,
      returnPathHost: "pm-bounces",
      returnPathValue: "pm.mtasv.net",
    };
  } catch (error: any) {
    // Domain may already exist — try to fetch it
    if (error?.statusCode === 422 || /already/i.test(error?.message || "")) {
      return getSenderDomainDnsRecords(domain);
    }
    throw error;
  }
}

export async function getSenderDomainDnsRecords(domain: string): Promise<{
  dkimHost: string;
  dkimValue: string;
  returnPathHost: string;
  returnPathValue: string;
}> {
  const accountClient = getAccountClient();
  if (!accountClient) {
    throw new Error("Postmark account token not configured.");
  }

  const domains = await accountClient.getDomains();
  const found = domains.Domains.find(
    (d) => d.Name.toLowerCase() === domain.toLowerCase()
  );
  if (!found) {
    throw new Error(`Domain ${domain} not found in Postmark.`);
  }

  const detail = await accountClient.getDomain(found.ID);
  return {
    dkimHost: detail.DKIMHost || detail.DKIMPendingHost || "",
    dkimValue: detail.DKIMTextValue || detail.DKIMPendingTextValue || "",
    returnPathHost: "pm-bounces",
    returnPathValue: "pm.mtasv.net",
  };
}

export async function verifySenderDomain(domain: string): Promise<{
  dkimVerified: boolean;
  returnPathVerified: boolean;
  spfVerified: boolean;
  allVerified: boolean;
}> {
  const accountClient = getAccountClient();
  if (!accountClient) {
    throw new Error("Postmark account token not configured.");
  }

  const domains = await accountClient.getDomains();
  const found = domains.Domains.find(
    (d) => d.Name.toLowerCase() === domain.toLowerCase()
  );
  if (!found) {
    throw new Error(`Domain ${domain} not found in Postmark.`);
  }

  // Trigger verification check
  const result = await accountClient.verifyDomainDKIM(found.ID);
  const spfResult = await accountClient.verifyDomainSPF(found.ID).catch(() => ({ SPFVerified: false }));
  const returnPathResult = await accountClient.verifyDomainReturnPath(found.ID).catch(() => ({ ReturnPathDomainVerified: false }));

  const dkimVerified = Boolean(result.DKIMVerified);
  const spfVerified = Boolean((spfResult as any).SPFVerified);
  const returnPathVerified = Boolean((returnPathResult as any).ReturnPathDomainVerified);

  return {
    dkimVerified,
    returnPathVerified,
    spfVerified,
    allVerified: dkimVerified && returnPathVerified,
  };
}

function baseLayout(content: string, brandName?: string, unsubscribeUrl?: string) {
  const headerBrand = brandName || "artha";
  const isArthaBrand = !brandName || brandName.toLowerCase() === "artha";
  const logoCell = isArthaBrand
    ? `<td style="vertical-align: middle; padding-right: 10px;">
                  <img src="${getAppUrl()}/artha-logo.jpg" width="28" height="28" alt="" style="display:block;" />
                </td>`
    : "";
  const unsubscribeLink = unsubscribeUrl
    ? `<span style="color: #CBD5E1; font-size: 12px;">&bull;</span>
                      <a href="${unsubscribeUrl}" style="font-size: 12px; color: #94A3B8; text-decoration: none;">Unsubscribe</a>`
    : "";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    @media only screen and (max-width: 600px) {
      .inner-body { width: 100% !important; border-radius: 0 !important; }
      .content-cell { padding: 24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#F4F7F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#F4F7F9;margin:0;padding:0;width:100%;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table class="inner-body" width="560" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;margin:0 auto;overflow:hidden;width:560px;box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 0;">
              <table cellpadding="0" cellspacing="0" role="presentation"><tr>
                ${logoCell}
                <td style="vertical-align: middle;">
                  <div style="font-size:24px;font-weight:800;letter-spacing:-0.03em;color:#0F172A;font-family:'Syne', sans-serif;">${headerBrand}</div>
                </td>
              </tr></table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td class="content-cell" style="padding: 32px; font-size: 16px; line-height: 1.6; color: #334155;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #F8FAFC; border-top: 1px solid #E2E8F0;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td>
                    <p style="margin: 0; font-size: 13px; color: #64748B; font-weight: 500;">
                      &copy; ${new Date().getFullYear()} ${APP_NAME}. Agents that build and run your company, 24/7.
                    </p>
                    <div style="margin-top: 12px; display: flex; align-items: center; gap: 12px;">
                      <a href="https://x.com/tryarthaHQ" style="font-size: 12px; color: #0284C7; text-decoration: none; font-weight: 600;">Follow @tryarthaHQ on X</a>
                      <span style="color: #CBD5E1; font-size: 12px;">&bull;</span>
                      <a href="${getAppUrl()}" style="font-size: 12px; color: #64748B; text-decoration: none;">Platform</a>
                      ${unsubscribeLink}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Test email addresses — block only cron/automated emails, not welcome or manual emails.
// Comma-separated list in TEST_EMAIL_ADDRESSES env var.
const TEST_EMAIL_ADDRESSES = (process.env.TEST_EMAIL_ADDRESSES ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Only blocks cron-job emails (digests, nudges, orchestrator, etc.) to test addresses.
 * Welcome emails, manual sends from the company dashboard, and other transactional
 * emails are always allowed through.
 */
export function isTestEmailBlocked(to: string, projectSlug?: string): boolean {
  const normalizedTo = to.toLowerCase().trim();
  return TEST_EMAIL_ADDRESSES.includes(normalizedTo);
}

async function sendEmail(scope: PostmarkScope, options: {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  tag?: string;
  headers?: Array<{ Name: string; Value: string }>;
  mode?: PostmarkSendMode;
  projectSlug?: string;
}) {
  // Email blocking for test addresses is handled at the cron-job level only.
  // sendEmail() always sends — cron routes call isTestEmailBlocked() themselves.

  const client = getClient(scope);
  const result = await client.sendEmail({
    From: options.from,
    To: options.to,
    Subject: options.subject,
    HtmlBody: options.html,
    ReplyTo: options.replyTo,
    Tag: options.tag,
    Headers: options.headers,
    MessageStream: getDefaultMessageStream(scope, options.mode || "transactional"),
  });

  // Log all platform outbound emails to platform_email_messages for live dashboard
  if (scope === "platform") {
    try {
      const db = getDb();
      await db`
        INSERT INTO platform_email_messages (
          thread_id, direction, from_email, to_email, subject, message_id, metadata
        ) VALUES (
          NULL, 'outbound', ${options.from}, ${options.to}, ${options.subject || null},
          ${result.MessageID || null},
          ${JSON.stringify({ tag: options.tag || null })}::jsonb
        )
        ON CONFLICT (message_id) DO NOTHING
      `;
    } catch (err) {
      console.warn("[postmark] Failed to log outbound email to DB:", err);
    }
  }

  return result;
}

export function isPostmarkConfigured(scope: PostmarkScope = "platform"): boolean {
  return Boolean(getServerToken(scope));
}

export function getExpectedCompanyInboundWebhookUrl(): string {
  const baseUrl = getConfiguredInboundWebhookUrl();
  const secret = process.env.POSTMARK_INBOUND_WEBHOOK_SECRET?.trim();
  if (!secret) return baseUrl;

  try {
    const url = new URL(baseUrl);
    url.searchParams.set("secret", secret);
    return url.toString();
  } catch {
    const separator = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${separator}secret=${encodeURIComponent(secret)}`;
  }
}

export function getDisplayCompanyInboundWebhookUrl(): string {
  try {
    const expectedUrl = new URL(getExpectedCompanyInboundWebhookUrl());
    if (expectedUrl.searchParams.has("secret")) {
      expectedUrl.searchParams.set("secret", "***");
    }
    return expectedUrl.toString();
  } catch {
    return getExpectedCompanyInboundWebhookUrl().replace(/secret=[^&]+/i, "secret=***");
  }
}

export async function getPostmarkSetupReport(scope: PostmarkScope): Promise<PostmarkSetupReport> {
  const issues: string[] = [];
  const warnings: string[] = [];
  const token = getServerToken(scope);

  if (!token) {
    issues.push(
      scope === "platform"
        ? "Missing POSTMARK_PLATFORM_SERVER_TOKEN (or legacy POSTMARK_SERVER_TOKEN)."
        : "Missing POSTMARK_COMPANY_SERVER_TOKEN (or legacy POSTMARK_SERVER_TOKEN)."
    );
    return { scope, ok: false, issues, warnings };
  }

  try {
    await getClient(scope).getServer();
  } catch (error) {
    issues.push(`Postmark ${scope} server token check failed: ${toSafeErrorMessage(error)}`);
    return { scope, ok: false, issues, warnings };
  }

  const accountClient = getAccountClient();
  const serverId = getServerId(scope);
  if (!accountClient || !serverId) {
    warnings.push(
      scope === "platform"
        ? "Set POSTMARK_ACCOUNT_TOKEN and POSTMARK_PLATFORM_SERVER_ID to enable DNS verification checks."
        : "Set POSTMARK_ACCOUNT_TOKEN and POSTMARK_COMPANY_SERVER_ID to enable DNS and inbound verification checks."
    );
    return { scope, ok: true, issues, warnings };
  }

  try {
    const [server, domains, signatures] = await Promise.all([
      accountClient.getServer(serverId),
      accountClient.getDomains(),
      scope === "platform" ? accountClient.getSenderSignatures() : Promise.resolve(null),
    ]);

    if (scope === "company") {
      const companyDomain = getCompanyDomain();
      const verifiedDomain = domains.Domains.find((domain) => domain.Name.toLowerCase() === companyDomain.toLowerCase());
      if (!verifiedDomain) {
        issues.push(`Add ${companyDomain} as a Postmark domain on the company server.`);
      } else if (!verifiedDomain.DKIMVerified) {
        issues.push(`DKIM for ${companyDomain} is not verified in Postmark yet.`);
      }

      if (verifiedDomain && !verifiedDomain.SPFVerified) {
        warnings.push(`SPF for ${companyDomain} is not verified yet.`);
      }
      if (verifiedDomain && !verifiedDomain.ReturnPathDomainVerified) {
        warnings.push(`Return-Path for ${companyDomain} is not verified yet.`);
      }

      const inboundDomain = (server.InboundDomain || "").trim().toLowerCase();
      if (inboundDomain !== companyDomain.toLowerCase()) {
        issues.push(
          `Company inbound domain should be ${companyDomain}, found ${server.InboundDomain || "empty"}.`
        );
      }

      const expectedHookUrl = getExpectedCompanyInboundWebhookUrl();
      const displayHookUrl = getDisplayCompanyInboundWebhookUrl();
      const actualHookUrl = normalizeUrl(server.InboundHookUrl);
      if (!actualHookUrl) {
        issues.push(`Company inbound webhook URL is empty. Set it to ${displayHookUrl}.`);
      } else if (actualHookUrl !== normalizeUrl(expectedHookUrl)) {
        issues.push(`Company inbound webhook URL should be ${displayHookUrl}.`);
      }
    } else {
      const appDomain = getAppDomain();
      const agentAddress = getAgentAddress();
      const verifiedDomain = domains.Domains.find((domain) => domain.Name.toLowerCase() === appDomain.toLowerCase());
      const senderSignature = signatures?.SenderSignatures.find(
        (signature) => signature.EmailAddress.toLowerCase() === agentAddress.toLowerCase()
      );
      const expectedHookUrl = getExpectedCompanyInboundWebhookUrl();
      const displayHookUrl = getDisplayCompanyInboundWebhookUrl();

      if (!verifiedDomain && !senderSignature?.Confirmed) {
        issues.push(`Verify ${appDomain} as a Postmark domain or confirm sender signature ${agentAddress}.`);
      }

      if (verifiedDomain && !verifiedDomain.DKIMVerified && !senderSignature?.Confirmed) {
        issues.push(`DKIM for ${appDomain} is not verified in Postmark yet.`);
      }

      if (verifiedDomain && !verifiedDomain.SPFVerified) {
        warnings.push(`SPF for ${appDomain} is not verified yet.`);
      }
      if (verifiedDomain && !verifiedDomain.ReturnPathDomainVerified) {
        warnings.push(`Return-Path for ${appDomain} is not verified yet.`);
      }
      if (senderSignature && !senderSignature.Confirmed && !verifiedDomain) {
        issues.push(`Sender signature ${agentAddress} exists but is not confirmed.`);
      }

      const actualHookUrl = normalizeUrl(server.InboundHookUrl);
      if (!actualHookUrl) {
        issues.push(
          `Platform inbound webhook URL is empty. Set it to ${displayHookUrl} on the inbound stream or keep ${agentAddress} send-only.`
        );
      } else if (actualHookUrl !== normalizeUrl(expectedHookUrl)) {
        issues.push(`Platform inbound webhook URL should be ${displayHookUrl}.`);
      }

      const inboundDomain = (server.InboundDomain || "").trim().toLowerCase();
      if (inboundDomain && inboundDomain !== appDomain.toLowerCase()) {
        warnings.push(
          `Platform inbound domain is ${server.InboundDomain}. That's fine if ${agentAddress} is forwarded from another mailbox provider instead of using Postmark MX directly.`
        );
      }
    }
  } catch (error) {
    warnings.push(`Could not inspect Postmark account-level setup: ${toSafeErrorMessage(error)}`);
  }

  return { scope, ok: issues.length === 0, issues, warnings };
}

export async function ensureCompanyEmailAddressReady(): Promise<{ ok: true } | { ok: false; status: "skipped" | "failed"; reason: string }> {
  if (!isPostmarkConfigured("company")) {
    return {
      ok: false,
      status: "skipped",
      reason: "Postmark company email is not configured. Set POSTMARK_COMPANY_SERVER_TOKEN (or POSTMARK_SERVER_TOKEN).",
    };
  }

  try {
    await getClient("company").getServer();
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      reason: toSafeErrorMessage(error),
    };
  }

  const report = await getPostmarkSetupReport("company");
  if (!report.ok) {
    return {
      ok: false,
      status: "skipped",
      reason: report.issues.join(" "),
    };
  }

  return { ok: true };
}

// --- Platform emails (from agents@artha.run) ---

export async function sendWelcomeEmail(to: string, name: string | null) {
  const greeting = name ? `Hi ${name.split(" ")[0]},` : "Hi there,";
  const html = baseLayout(`
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111;">Welcome to ${APP_NAME}</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">${greeting}</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">
      You just joined Artha - the platform that builds and runs your company autonomously.
      Describe your idea in one prompt, and we'll generate your mission, market research,
      landing page, email, and task queue.
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
      Ready to build your first company?
    </p>
    <a href="${getAppUrl()}/dashboard"
       style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">
      Go to Dashboard
    </a>
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">No credit card required. Free to start.</p>
  `);
  return sendEmail("platform", { from: getAgentFrom(), to, subject: `Welcome to ${APP_NAME}`, html, tag: "welcome" });
}

export async function sendSubscriptionConfirmationEmail(to: string, name: string | null, projectName: string, plan: string) {
  const greeting = name ? `Hi ${name.split(" ")[0]},` : "Hi there,";
  const html = baseLayout(`
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111;">Subscription Confirmed</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">${greeting}</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">
      Your <strong>${plan}</strong> subscription for <strong>${projectName}</strong> is now active.
      Your AI company is running 24/7 - executing tasks, building pages, and growing autonomously.
    </p>
    <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;line-height:1.8;color:#374151;">
      <li>Nightly automated task execution</li>
      <li>On-demand AI credits</li>
      <li>Landing page hosting</li>
      <li>Custom email address</li>
    </ul>
    <a href="${getAppUrl()}/dashboard"
       style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">
      View Your Dashboard
    </a>
  `);
  return sendEmail("platform", {
    from: getAgentFrom(),
    to,
    subject: `Subscription active: ${projectName}`,
    html,
    tag: "subscription",
  });
}

export async function sendPaymentFailedEmail(to: string, name: string | null, projectName: string) {
  const greeting = name ? `Hi ${name.split(" ")[0]},` : "Hi there,";
  const html = baseLayout(`
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#d97706;">Payment Failed</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">${greeting}</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">
      We couldn't process the payment for <strong>${projectName}</strong>.
      Your AI tasks are paused until the payment is resolved.
    </p>
    <a href="${getAppUrl()}/dashboard"
       style="display:inline-block;padding:12px 24px;background:#d97706;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">
      Update Payment
    </a>
  `);
  return sendEmail("platform", {
    from: getAgentFrom(),
    to,
    subject: `Action needed: Payment failed for ${projectName}`,
    html,
    tag: "payment-failed",
  });
}

export async function sendCreditsExhaustedEmail(to: string, name: string | null, projectName: string, projectSlug?: string) {
  const greeting = name ? `Hi ${name.split(" ")[0]},` : "Hi there,";
  const buyCreditsUrl = projectSlug
    ? `${getAppUrl()}/dashboard/${projectSlug}?buy_credits=true`
    : `${getAppUrl()}/dashboard?buy_credits=true`;
  const html = baseLayout(`
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111;">You're out of task credits</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">${greeting}</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">
      <strong>${projectName}</strong> has used all its task credits. Nightly tasks are paused until you top up.
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
      Buy a credit pack ($25 for 15 credits) to keep your company running - credits never expire and stack with your subscription.
    </p>
    <a href="${buyCreditsUrl}"
       style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">
      Buy Credits ->
    </a>
    <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
      Or <a href="${buyCreditsUrl}" style="color:#2563eb;">subscribe for $49/month</a> to get 35 credits every billing cycle plus nightly auto-run.
    </p>
  `);
  return sendEmail("platform", {
    from: getAgentFrom(),
    to,
    subject: `${projectName} is out of task credits`,
    html,
    tag: "credits-exhausted",
    projectSlug,
  });
}

export async function sendSubscriptionCancelledEmail(to: string, name: string | null, projectName: string) {
  const greeting = name ? `Hi ${name.split(" ")[0]},` : "Hi there,";
  const html = baseLayout(`
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111;">Subscription Cancelled</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">${greeting}</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">
      Your subscription for <strong>${projectName}</strong> has been cancelled.
      Your landing page and data are still available, but automated tasks have stopped.
    </p>
    <a href="${getAppUrl()}/dashboard"
       style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">
      Resubscribe
    </a>
  `);
  return sendEmail("platform", {
    from: getAgentFrom(),
    to,
    subject: `Subscription cancelled: ${projectName}`,
    html,
    tag: "cancelled",
  });
}

export async function sendAgentReply(options: {
  toEmail: string;
  subject: string;
  bodyHtml: string;
  inReplyTo?: string;
  replyTo?: string;
}) {
  return sendEmail("platform", {
    from: getAgentFrom(),
    to: options.toEmail,
    subject: options.subject,
    html: baseLayout(options.bodyHtml),
    replyTo: options.replyTo,
    tag: "agent-reply",
    headers: buildThreadHeaders(options.inReplyTo),
  });
}

export function getAgentReplyTo(slug?: string | null) {
  void slug;
  return getAgentAddress();
}

// --- Company emails (from slug@tryartha.com or slug@customdomain.com) ---

export function getCompanyFrom(slug: string, companyName: string, customEmailDomain?: string | null) {
  const domain = customEmailDomain || getCompanyDomain();
  return `${companyName} <${slug}@${domain}>`;
}

/** Strip AI placeholder sign-offs like "[Your Name]" from outbound email HTML */
function sanitizePlaceholderSignoffs(html: string, companyName: string): string {
  // Remove lines that are just a placeholder like "[Your Name]", "[Name]", "[Your Company]"
  return html.replace(
    /(<br\s*\/?>|\n)*\s*\[Your\s+Name\](\s*<br\s*\/?>|\n)*/gi,
    `$1Best,<br>${companyName}$2`,
  ).replace(
    /(<br\s*\/?>|\n)*\s*\[Name\](\s*<br\s*\/?>|\n)*/gi,
    `$1Best,<br>${companyName}$2`,
  );
}

export async function sendCompanyOutboundEmail(options: {
  slug: string;
  companyName: string;
  toEmail: string;
  subject: string;
  bodyHtml: string;
  from?: string;
  replyTo?: string;
  inReplyTo?: string;
  tag?: string;
  wrapLayout?: boolean;
  mode?: PostmarkSendMode;
}) {
  const from = options.from || getCompanyFrom(options.slug, options.companyName);
  const sanitizedBody = sanitizePlaceholderSignoffs(options.bodyHtml, options.companyName);
  return sendEmail("company", {
    from,
    to: options.toEmail,
    subject: options.subject,
    html: options.wrapLayout === false ? sanitizedBody : baseLayout(sanitizedBody, options.companyName),
    replyTo: options.replyTo || from,
    tag: options.tag,
    headers: buildThreadHeaders(options.inReplyTo),
    mode: options.mode,
  });
}

export async function sendNewSubscriberNotification(options: {
  toEmail: string;
  companyName: string;
  customerEmail: string;
  customerName?: string | null;
  planName: string;
  amountCents: number;
  billingInterval: string;
  activeSubscriberCount: number;
}) {
  const { toEmail, companyName, customerEmail, customerName, planName, amountCents, billingInterval, activeSubscriberCount } = options;
  const amountStr = `$${(amountCents / 100).toFixed(2)}`;
  const customerDisplay = customerName ? `${customerName} (${customerEmail})` : customerEmail;

  const html = baseLayout(`
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111;">New Subscriber</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      Someone just signed up for <strong>${companyName}</strong>.
    </p>
    <div style="margin:16px 0;padding:16px 20px;background-color:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;">
      <table cellpadding="0" cellspacing="0" style="font-size:14px;color:#374151;width:100%;">
        <tr>
          <td style="padding:4px 0;width:40%;">Customer</td>
          <td style="padding:4px 0;font-weight:600;">${customerDisplay}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;">Plan</td>
          <td style="padding:4px 0;font-weight:600;">${planName}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;">Amount</td>
          <td style="padding:4px 0;font-weight:600;">${amountStr}/${billingInterval}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;">Total active subscribers</td>
          <td style="padding:4px 0;font-weight:600;">${activeSubscriberCount}</td>
        </tr>
      </table>
    </div>
    <a href="${getAppUrl()}/dashboard?tab=subscribers"
       style="display:inline-block;margin-top:8px;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">
      View Subscribers
    </a>
  `);

  return sendEmail("platform", {
    from: getAgentFrom(),
    to: toEmail,
    subject: `New subscriber: ${customerEmail} — ${planName}`,
    html,
    tag: "new-subscriber",
  });
}

export async function sendStripeConnectOnboardingEmail(options: {
  toEmail: string;
  companyName: string;
  onboardingUrl: string;
}) {
  const { toEmail, companyName, onboardingUrl } = options;

  const html = baseLayout(`
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111;">Set up payouts for ${companyName}</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">
      Your pricing plans are live and customers can start paying. To receive payouts, connect your bank account through Stripe.
    </p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">
      Here's how it works:
    </p>
    <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;line-height:1.8;color:#374151;">
      <li>Customers pay through your website checkout</li>
      <li>You receive <strong>80%</strong> of each payment</li>
      <li>Artha retains <strong>20%</strong> as a platform fee</li>
      <li>Payouts are deposited to your bank on Stripe's schedule</li>
    </ul>
    <a href="${onboardingUrl}"
       style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">
      Connect Bank Account
    </a>
    <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
      Payments will still be collected even before you connect your bank. Funds will be held by Stripe until onboarding is complete.
    </p>
  `);

  return sendEmail("platform", {
    from: getAgentFrom(),
    to: toEmail,
    subject: `Set up payouts for ${companyName}`,
    html,
    tag: "stripe-connect-onboarding",
  });
}

export async function sendNightlyTaskUpdate(options: {
  slug: string;
  companyName: string;
  toEmail: string;
  toName: string | null;
  completedTask: { title: string; summary: string };
  tasksPending: Array<{ title: string }>;
  analytics?: {
    last7Days: { pageviews: number; uniqueVisitors: number; avgEngagementSec: number; topSource: string | null };
    last30Days: { pageviews: number; uniqueVisitors: number };
  };
  revenue?: {
    activeSubscribers: number;
    newLast7Days: number;
    mrrCents: number;
    revenueLast7DaysCents: number;
  };
  unsubscribeUrl?: string;
}) {
  const { slug, companyName, toEmail, toName, completedTask, tasksPending, analytics, revenue, unsubscribeUrl } = options;
  const firstName = toName ? toName.split(" ")[0] : "there";
  const from = getAgentFrom();

  const pendingHtml = tasksPending.length > 0
    ? `<h2 style="margin:0 0 12px;font-size:16px;font-weight:600;color:#111;">Up Next</h2>
       <ul style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.8;color:#374151;">
         ${tasksPending.map((task) => `<li>${task.title}</li>`).join("")}
       </ul>`
    : "";

  const analyticsHtml = analytics
    ? `<div style="margin:20px 0;padding:16px 20px;background-color:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;">
         <h2 style="margin:0 0 10px;font-size:15px;font-weight:600;color:#15803D;">Your site this week</h2>
         <table cellpadding="0" cellspacing="0" style="font-size:14px;color:#374151;width:100%;">
           <tr>
             <td style="padding:2px 0;width:50%;">Pageviews</td>
             <td style="padding:2px 0;font-weight:600;">${analytics.last7Days.pageviews.toLocaleString()}</td>
           </tr>
           <tr>
             <td style="padding:2px 0;">Unique visitors</td>
             <td style="padding:2px 0;font-weight:600;">${analytics.last7Days.uniqueVisitors.toLocaleString()}</td>
           </tr>
           ${analytics.last7Days.avgEngagementSec > 0 ? `
           <tr>
             <td style="padding:2px 0;">Avg. time on site</td>
             <td style="padding:2px 0;font-weight:600;">${analytics.last7Days.avgEngagementSec}s</td>
           </tr>` : ""}
           ${analytics.last7Days.topSource ? `
           <tr>
             <td style="padding:2px 0;">Top source</td>
             <td style="padding:2px 0;font-weight:600;">${analytics.last7Days.topSource}</td>
           </tr>` : ""}
         </table>
       </div>`
    : "";

  const revenueHtml = revenue && revenue.activeSubscribers > 0
    ? `<div style="margin:20px 0;padding:16px 20px;background-color:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;">
         <h2 style="margin:0 0 10px;font-size:15px;font-weight:600;color:#1D4ED8;">Revenue</h2>
         <table cellpadding="0" cellspacing="0" style="font-size:14px;color:#374151;width:100%;">
           <tr>
             <td style="padding:2px 0;width:50%;">Active subscribers</td>
             <td style="padding:2px 0;font-weight:600;">${revenue.activeSubscribers}</td>
           </tr>
           ${revenue.newLast7Days > 0 ? `
           <tr>
             <td style="padding:2px 0;">New this week</td>
             <td style="padding:2px 0;font-weight:600;">+${revenue.newLast7Days}</td>
           </tr>` : ""}
           <tr>
             <td style="padding:2px 0;">MRR</td>
             <td style="padding:2px 0;font-weight:600;">$${(revenue.mrrCents / 100).toFixed(2)}</td>
           </tr>
           ${revenue.revenueLast7DaysCents > 0 ? `
           <tr>
             <td style="padding:2px 0;">Revenue this week</td>
             <td style="padding:2px 0;font-weight:600;">$${(revenue.revenueLast7DaysCents / 100).toFixed(2)}</td>
           </tr>` : ""}
         </table>
       </div>`
    : "";

  const html = baseLayout(`
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111;">${companyName} — Task Update</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">Hey ${firstName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">
      I just finished working on a task for ${companyName}. Here's what happened:
    </p>
    <div style="margin:0 0 20px;padding:16px 20px;background-color:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;">
      <h2 style="margin:0 0 8px;font-size:16px;font-weight:600;color:#111;">${completedTask.title}</h2>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">${completedTask.summary}</p>
    </div>
    ${analyticsHtml}
    ${revenueHtml}
    ${pendingHtml}
    <p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:#374151;border-top:1px solid #e5e7eb;padding-top:16px;">
      <strong>Reply to this email</strong> to add a new task or ask me anything about your company.
    </p>
    <a href="${getAppUrl()}/dashboard"
       style="display:inline-block;margin-top:16px;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">
      Open Dashboard
    </a>
  `, undefined, unsubscribeUrl);

  return sendEmail("platform", {
    from,
    to: toEmail,
    subject: `${companyName} — ${completedTask.title}`,
    html,
    replyTo: getCompanyFrom(slug, companyName),
    tag: "nightly-task-update",
  });
}

export async function sendCompanyColdEmail(options: {
  slug: string;
  companyName: string;
  toEmail: string;
  toName: string | null;
  subject: string;
  bodyHtml: string;
}) {
  return sendCompanyOutboundEmail({
    slug: options.slug,
    companyName: options.companyName,
    toEmail: options.toEmail,
    subject: options.subject,
    bodyHtml: options.bodyHtml,
    tag: "outreach",
  });
}

export async function sendCompanyWelcome(options: {
  slug: string;
  companyName: string;
  founderEmail: string;
  founderName: string | null;
  researchSummary?: string;
  tasks?: Array<{ title: string; description?: string }>;
  tweetUrl?: string;
  marketplaceEnabled?: boolean;
  stripeConnectUrl?: string;
}) {
  const { slug, companyName, founderEmail, founderName, researchSummary, tasks, tweetUrl, marketplaceEnabled, stripeConnectUrl } = options;
  const firstName = founderName ? founderName.split(" ")[0] : "there";

  const researchHtml = researchSummary
    ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">
        <strong>Research:</strong> ${researchSummary}
      </p>`
    : "";

  const appUrl = getAppUrl();
  const companyDomain = getCompanyDomain();
  const liveItems: Array<{ label: string; linkText: string; href: string }> = [
    { label: "Landing page:", linkText: `${slug}.${companyDomain}`, href: `https://${slug}.${companyDomain}` },
    { label: "Company email:", linkText: `${slug}@${companyDomain}`, href: `mailto:${slug}@${companyDomain}` },
    ...(tweetUrl ? [{ label: "Tweet:", linkText: "First tweet", href: tweetUrl }] : []),
    { label: "Mission document", linkText: "", href: `${appUrl}/dashboard` },
  ];

  const tasksHtml = tasks && tasks.length > 0
    ? `<p style="margin:20px 0 8px;font-size:15px;font-weight:600;color:#111;">
        ${tasks.length} tasks queued for cycle 1:
      </p>
      <ol style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.8;color:#374151;">
        ${tasks.map((task) => `<li><strong>${task.title}</strong>${task.description ? ` - ${task.description}` : ""}</li>`).join("")}
      </ol>`
    : "";

  const html = baseLayout(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0F172A;letter-spacing:-0.02em;">${companyName} is ready</h1>
    <p style="margin:0 0 24px;font-size:16px;color:#475569;">
      ${firstName}, I've finished the initial build for <strong>${companyName}</strong>. Here's what's live:
    </p>
    
    ${researchHtml}

    <div style="margin: 24px 0; padding: 20px; background-color: #F8FAFC; border-radius: 8px; border: 1px solid #E2E8F0;">
      <p style="margin: 0 0 12px; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">What's Live Now</p>
      <table cellpadding="0" cellspacing="0" role="presentation" style="width: 100%;">
        ${liveItems.map(item => `
          <tr>
            <td style="padding: 4px 0; font-size: 15px; vertical-align: top; width: 20px;">
              <span style="color: #10B981;">✓</span>
            </td>
            <td style="padding: 4px 0; font-size: 15px; vertical-align: top;">
              ${item.linkText
                ? `${item.label} <a href="${item.href}" style="color:#2563eb;">${item.linkText}</a>`
                : `<a href="${item.href}" style="color:#2563eb;">${item.label}</a>`
              }
            </td>
          </tr>
        `).join("")}
      </table>
    </div>

    ${tasksHtml}

    ${marketplaceEnabled && stripeConnectUrl ? `
    <div style="margin: 24px 0; padding: 20px; background-color: #F0FDF4; border-radius: 8px; border: 1px solid #BBF7D0;">
      <p style="margin: 0 0 8px; font-size: 16px; font-weight: 700; color: #166534;">Start getting paid</p>
      <p style="margin: 0 0 16px; font-size: 14px; color: #15803D; line-height: 1.5;">
        Your pricing plans are live on your website. Connect your bank account to receive payments when customers buy.
      </p>
      <a href="${stripeConnectUrl}"
         style="display:inline-block;padding:12px 24px;background-color:#16A34A;color:#FFFFFF;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
        Connect Payments &rarr;
      </a>
    </div>
    ` : ""}

    <div style="margin: 32px 0;">
      <a href="${appUrl}/dashboard"
         style="display:inline-block;padding:14px 28px;background-color:#0F172A;color:#FFFFFF;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.2);">
        Get Started &rarr;
      </a>
      <p style="margin: 16px 0 0; font-size: 14px; color: #64748B;">
        ${marketplaceEnabled
          ? "Your company is live and ready to sell. Subscribe ($49/mo) to automate growth with nightly task runs."
          : "Subscribe for $49/mo to start your first operating cycle. I'll get to work immediately."}
      </p>
    </div>

    <p style="margin: 32px 0 0; font-size: 15px; color: #475569; border-top: 1px solid #E2E8F0; padding-top: 24px;">
      Best,<br />
      <strong>${companyName}</strong><br />
      <span style="font-size: 13px; color: #94A3B8;">Powered by Artha</span>
    </p>
  `);

  return sendEmail("platform", {
    from: getAgentFrom(),
    to: founderEmail,
    subject: `${companyName} is ready`,
    html,
    replyTo: getAgentReplyTo(slug),
    tag: "company-welcome",
    projectSlug: slug,
  });
}

export async function sendMilestoneEmail(options: {
  toEmail: string;
  founderName: string | null;
  companyName: string;
  milestoneType: "first_sale" | "revenue_100" | "revenue_1000";
  amountCents: number;
}) {
  const { toEmail, founderName, companyName, milestoneType, amountCents } = options;
  const firstName = founderName ? founderName.split(" ")[0] : "there";
  const appUrl = getAppUrl();
  const amount = (amountCents / 100).toFixed(2);

  const milestoneConfig = {
    first_sale: {
      emoji: "🎉",
      headline: "You just made your first sale!",
      body: `Someone just paid $${amount} for ${companyName}. This is the moment — your idea is now a business.`,
      subject: `${companyName} just made its first sale!`,
    },
    revenue_100: {
      emoji: "💰",
      headline: "You crossed $100 in revenue!",
      body: `${companyName} has now earned over $100. You're building real momentum.`,
      subject: `${companyName} crossed $100 in revenue!`,
    },
    revenue_1000: {
      emoji: "🚀",
      headline: "You crossed $1,000 in revenue!",
      body: `${companyName} has earned over $1,000. This is no longer an experiment — it's a real business.`,
      subject: `${companyName} crossed $1,000 in revenue!`,
    },
  };

  const config = milestoneConfig[milestoneType];

  const html = baseLayout(`
    <div style="text-align:center;padding:20px 0;">
      <p style="font-size:48px;margin:0 0 16px;">${config.emoji}</p>
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#0F172A;">${config.headline}</h1>
      <p style="margin:0 0 24px;font-size:16px;color:#475569;line-height:1.6;">
        ${firstName}, ${config.body}
      </p>
      <a href="${appUrl}/dashboard"
         style="display:inline-block;padding:14px 28px;background-color:#16A34A;color:#FFFFFF;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
        View Dashboard &rarr;
      </a>
    </div>
  `);

  return sendEmail("platform", {
    from: getAgentFrom(),
    to: toEmail,
    subject: config.subject,
    html,
    tag: `milestone-${milestoneType}`,
  });
}

export async function sendSiteActivityNudge(options: {
  slug: string;
  companyName: string;
  toEmail: string;
  toName: string | null;
  pageviews: number;
  uniqueVisitors: number;
  topSource: string | null;
  avgEngagementSec: number;
  unsubscribeUrl?: string;
}) {
  const { slug, companyName, toEmail, toName, pageviews, uniqueVisitors, topSource, avgEngagementSec, unsubscribeUrl } = options;
  const firstName = toName ? toName.split(" ")[0] : "there";
  const companyDomain = getCompanyDomain();
  const appUrl = getAppUrl();
  const siteUrl = `https://${slug}.${companyDomain}`;

  const sourceNote = topSource && topSource !== "(direct)"
    ? `Most of your visitors found you via <strong>${topSource}</strong>.`
    : "Most visitors found your site directly.";

  const engagementNote = avgEngagementSec > 30
    ? `They're engaged too — spending an average of <strong>${avgEngagementSec}s</strong> on your page.`
    : "";

  const html = baseLayout(`
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0F172A;">People are visiting ${companyName}</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">Hi ${firstName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">
      Your site at <a href="${siteUrl}" style="color:#2563eb;">${siteUrl}</a> has had
      <strong>${uniqueVisitors} visitor${uniqueVisitors !== 1 ? "s" : ""}</strong> and
      <strong>${pageviews} pageview${pageviews !== 1 ? "s" : ""}</strong> in the last 7 days.
      ${sourceNote} ${engagementNote}
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
      Want Artha to start working on growing ${companyName}? Subscribe to kick off automated outreach, content, and growth tasks.
    </p>
    <a href="${appUrl}/dashboard"
       style="display:inline-block;padding:14px 28px;background-color:#0F172A;color:#FFFFFF;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
      Grow ${companyName} &rarr;
    </a>
    <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">$49/month to keep your AI company running 24/7. Cancel anytime.</p>
  `, undefined, unsubscribeUrl);

  return sendEmail("platform", {
    from: getAgentFrom(),
    to: toEmail,
    subject: `${uniqueVisitors} people visited ${companyName} this week`,
    html,
    tag: "site-activity-nudge",
    projectSlug: slug,
  });
}

// ── Subscription broadcast emails ────────────────────────────────────

export async function sendSubscriptionValueEmail(options: {
  slug: string;
  companyName: string;
  toEmail: string;
  toName: string | null;
}) {
  const { slug, companyName, toEmail, toName } = options;
  const firstName = toName ? toName.split(" ")[0] : "there";
  const appUrl = getAppUrl();
  const companyDomain = getCompanyDomain();
  const siteUrl = `https://${slug}.${companyDomain}`;

  const html = baseLayout(`
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0F172A;">Your company could be running on autopilot</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">Hi ${firstName},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      I noticed ${companyName} is live at <a href="${siteUrl}" style="color:#2563eb;">${siteUrl}</a> but you haven't subscribed yet. Wanted to share what you'd unlock with a subscription, because there's a lot your AI company can do that it's not doing right now.
    </p>
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 20px;width:100%;">
      <tr>
        <td style="padding:12px 16px;background:#F0FDF4;border-radius:8px;font-size:14px;line-height:1.7;color:#374151;">
          <strong style="color:#166534;">What you get with a subscription:</strong><br/>
          Nightly automated tasks that grow your business while you sleep<br/>
          35 AI credits every billing cycle (plus you can buy more anytime)<br/>
          Custom email address at ${slug}@${companyDomain}<br/>
          Your site hosted and running 24/7<br/>
          Automated outreach, content, and growth campaigns
        </td>
      </tr>
    </table>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
      Think of it as hiring an entire team for $49/month. They never sleep, never take days off, and they're already familiar with ${companyName}.
    </p>
    <a href="${appUrl}/dashboard"
       style="display:inline-block;padding:14px 28px;background-color:#0F172A;color:#FFFFFF;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
      Subscribe and start growing &rarr;
    </a>
    <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Cancel anytime. No long term commitment.</p>
  `);

  return sendEmail("platform", {
    from: getAgentFrom(),
    to: toEmail,
    subject: `${companyName} could be doing so much more`,
    html,
    tag: "subscription-broadcast",
    projectSlug: slug,
    mode: "broadcast",
  });
}

export async function sendSubscriptionUrgencyEmail(options: {
  slug: string;
  companyName: string;
  toEmail: string;
  toName: string | null;
}) {
  const { slug, companyName, toEmail, toName } = options;
  const firstName = toName ? toName.split(" ")[0] : "there";
  const appUrl = getAppUrl();
  const companyDomain = getCompanyDomain();
  const siteUrl = `https://${slug}.${companyDomain}`;

  const html = baseLayout(`
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0F172A;">Quick note about ${companyName}</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">Hi ${firstName},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      Just wanted to flag something. ${companyName} is sitting idle right now. Your site is live at <a href="${siteUrl}" style="color:#2563eb;">${siteUrl}</a>, but without a subscription none of the growth engines are running.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      That means no automated outreach, no content being published, no tasks executing overnight. Every day without it is a day your competitors are moving while ${companyName} stands still.
    </p>
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 20px;width:100%;">
      <tr>
        <td style="padding:12px 16px;background:#FEF3C7;border-radius:8px;font-size:14px;line-height:1.7;color:#374151;">
          <strong style="color:#92400E;">What's waiting for you:</strong><br/>
          Your AI agents are ready to execute tasks every night<br/>
          Outreach campaigns, blog posts, and SEO work on autopilot<br/>
          35 credits per month to power it all<br/>
          $49/month. Cancel anytime.
        </td>
      </tr>
    </table>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
      The sooner you activate, the sooner ${companyName} starts compounding. These things take time to build momentum, so starting today puts you weeks ahead of starting next month.
    </p>
    <a href="${appUrl}/dashboard"
       style="display:inline-block;padding:14px 28px;background-color:#0F172A;color:#FFFFFF;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
      Activate ${companyName} now &rarr;
    </a>
    <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Your company is built and ready. It just needs the green light.</p>
  `);

  return sendEmail("platform", {
    from: getAgentFrom(),
    to: toEmail,
    subject: `${companyName} is ready but not running`,
    html,
    tag: "subscription-broadcast",
    projectSlug: slug,
    mode: "broadcast",
  });
}

// ── Website DB lifecycle emails ──────────────────────────────────────

export async function sendDeletionWarningEmail(to: string, companyName: string, daysRemaining: number) {
  const html = baseLayout(`
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111;">Your website data will be deleted in ${daysRemaining} days</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">
      Your subscription for <strong>${companyName}</strong> has been cancelled or payment has failed.
      Your website database (user accounts, payments, and custom tables) will be permanently deleted in <strong>${daysRemaining} days</strong>.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      Your dashboard data (tasks, documents, research) and form submissions are safe and will not be affected.
    </p>
    <a href="${getAppUrl()}/dashboard?panel=settings"
       style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">
      Resubscribe to Keep Your Data
    </a>
  `);
  return sendEmail("platform", {
    from: getAgentFrom(),
    to,
    subject: `Your ${companyName} data will be deleted in ${daysRemaining} days`,
    html,
    tag: "deletion-warning",
  });
}

export async function sendDataDeletedEmail(to: string, companyName: string) {
  const html = baseLayout(`
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111;">Your website data has been deleted</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">
      The website database for <strong>${companyName}</strong> has been permanently deleted after the 2-month grace period.
      This includes user accounts, payments, and any custom tables.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      Your table schemas have been saved. If you resubscribe, your database structure will be restored (data starts fresh).
    </p>
    <a href="${getAppUrl()}/dashboard?panel=settings"
       style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">
      Resubscribe
    </a>
  `);
  return sendEmail("platform", {
    from: getAgentFrom(),
    to,
    subject: `Your ${companyName} website data has been deleted`,
    html,
    tag: "data-deleted",
  });
}

export async function sendWelcomeBackEmail(to: string, companyName: string) {
  const html = baseLayout(`
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111;">Welcome back!</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">
      Your website database for <strong>${companyName}</strong> has been restored.
      Your custom table schemas have been recreated and are ready to use.
    </p>
    <a href="${getAppUrl()}/dashboard?panel=landing-page"
       style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">
      Go to Dashboard
    </a>
  `);
  return sendEmail("platform", {
    from: getAgentFrom(),
    to,
    subject: `Welcome back — your ${companyName} database is restored`,
    html,
    tag: "welcome-back",
  });
}

export async function sendCompanyReply(options: {
  slug: string;
  companyName: string;
  toEmail: string;
  subject: string;
  bodyHtml: string;
  inReplyTo?: string;
  customEmailDomain?: string | null;
}) {
  const from = options.customEmailDomain
    ? getCompanyFrom(options.slug, options.companyName, options.customEmailDomain)
    : undefined;
  return sendCompanyOutboundEmail({
    slug: options.slug,
    companyName: options.companyName,
    toEmail: options.toEmail,
    subject: options.subject,
    bodyHtml: options.bodyHtml,
    inReplyTo: options.inReplyTo,
    from,
    tag: "inbound-reply",
  });
}

export async function sendSiteVerificationEmail(options: {
  slug: string;
  companyName: string;
  toEmail: string;
  verifyUrl: string;
}) {
  const { slug, companyName, toEmail, verifyUrl } = options;
  const bodyHtml = `
    <h2 style="font-size:20px;font-weight:600;margin:0 0 12px">Verify your email</h2>
    <p style="margin:0 0 24px;color:#4a5568;line-height:1.6">
      Click the button below to verify your email address for <strong>${companyName}</strong>.
    </p>
    <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px">
      <tr>
        <td style="background:#2563eb;border-radius:6px;padding:12px 28px">
          <a href="${verifyUrl}" style="color:#fff;text-decoration:none;font-weight:600;font-size:15px;display:inline-block">
            Verify Email
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#718096;font-size:13px;line-height:1.5">
      This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.
    </p>
  `;

  return sendCompanyOutboundEmail({
    slug,
    companyName,
    toEmail,
    subject: `Verify your email — ${companyName}`,
    bodyHtml,
    tag: "site-verification",
  });
}

export async function sendCustomerWaitingEmail(options: {
  toEmail: string;
  founderName: string | null;
  companyName: string;
  companySlug: string;
  customerEmail: string;
  customerSubject: string;
}) {
  const { toEmail, founderName, companyName, companySlug, customerEmail, customerSubject } = options;
  const greeting = founderName ? `Hi ${founderName.split(" ")[0]},` : "Hi there,";
  const buyCreditsUrl = `${getAppUrl()}/dashboard/${companySlug}?buy_credits=true`;
  const html = baseLayout(`
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111;">Customer waiting for a reply</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">${greeting}</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">
      <strong>${customerEmail}</strong> just emailed <strong>${companyName}</strong> with the subject "<em>${customerSubject}</em>", but we couldn't auto-respond because you're out of task credits.
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
      Subscribe or buy credits so your AI can handle customer emails automatically.
    </p>
    <a href="${buyCreditsUrl}"
       style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">
      Get Credits
    </a>
    <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
      You can also reply manually from your <a href="${getAppUrl()}/dashboard/${companySlug}" style="color:#2563eb;">dashboard inbox</a>.
    </p>
  `);
  return sendEmail("platform", {
    from: getAgentFrom(),
    to: toEmail,
    subject: `Customer waiting: ${customerSubject} — ${companyName}`,
    html,
    tag: "customer-waiting",
    projectSlug: companySlug,
  });
}

export async function sendWeeklyValueSummary(options: {
  slug: string;
  companyName: string;
  toEmail: string;
  toName: string | null;
  isSubscribed: boolean;
  unsubscribeUrl?: string;
  stats: {
    tasksCompleted: number;
    tasksQueued: number;
    emailsSent: number;
    emailsOpened: number;
    openRate: number;
    replies: number;
    newLeads: number;
    totalLeads: number;
    totalConverted: number;
    siteVisitors: number;
    sitePageviews: number;
    timeSavedHours: number;
  };
}) {
  const { slug, companyName, toEmail, toName, isSubscribed, unsubscribeUrl, stats } = options;
  const firstName = toName ? toName.split(" ")[0] : "there";
  const appUrl = getAppUrl();

  const statRows = [
    stats.tasksCompleted > 0 ? `<tr><td style="padding:4px 0;font-size:14px;">Tasks completed</td><td style="padding:4px 0;font-weight:600;font-size:14px;text-align:right;">${stats.tasksCompleted}</td></tr>` : "",
    stats.emailsSent > 0 ? `<tr><td style="padding:4px 0;font-size:14px;">Outreach emails sent</td><td style="padding:4px 0;font-weight:600;font-size:14px;text-align:right;">${stats.emailsSent}</td></tr>` : "",
    stats.emailsSent > 0 ? `<tr><td style="padding:4px 0;font-size:14px;">Email open rate</td><td style="padding:4px 0;font-weight:600;font-size:14px;text-align:right;">${stats.openRate}%</td></tr>` : "",
    stats.replies > 0 ? `<tr><td style="padding:4px 0;font-size:14px;">Replies received</td><td style="padding:4px 0;font-weight:600;font-size:14px;text-align:right;color:#059669;">${stats.replies}</td></tr>` : "",
    stats.newLeads > 0 ? `<tr><td style="padding:4px 0;font-size:14px;">New leads found</td><td style="padding:4px 0;font-weight:600;font-size:14px;text-align:right;">${stats.newLeads}</td></tr>` : "",
    stats.siteVisitors > 0 ? `<tr><td style="padding:4px 0;font-size:14px;">Site visitors</td><td style="padding:4px 0;font-weight:600;font-size:14px;text-align:right;">${stats.siteVisitors}</td></tr>` : "",
    stats.sitePageviews > 0 ? `<tr><td style="padding:4px 0;font-size:14px;">Page views</td><td style="padding:4px 0;font-weight:600;font-size:14px;text-align:right;">${stats.sitePageviews}</td></tr>` : "",
  ].filter(Boolean).join("");

  const upgradeHtml = !isSubscribed ? `
    <div style="margin:24px 0;padding:16px 20px;background-color:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;text-align:center;">
      <p style="margin:0 0 8px;font-size:14px;color:#9A3412;font-weight:600;">Want Artha to keep working for you?</p>
      <p style="margin:0 0 12px;font-size:13px;color:#C2410C;">Subscribe to automate tasks nightly — starting at $19/month.</p>
      <a href="${appUrl}/pricing" style="display:inline-block;padding:10px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:500;">View Plans</a>
    </div>` : "";

  const html = baseLayout(`
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111;">${companyName} — Weekly Report</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">Hey ${firstName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">
      Here's what Artha did for <strong>${companyName}</strong> this week:
    </p>

    <div style="margin:0 0 20px;padding:16px 20px;background-color:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;">
      <div style="text-align:center;margin-bottom:12px;">
        <span style="font-size:28px;font-weight:700;color:#15803D;">~${stats.timeSavedHours}h</span>
        <p style="margin:4px 0 0;font-size:13px;color:#166534;">estimated time saved this week</p>
      </div>
      <table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #BBF7D0;padding-top:12px;">
        ${statRows}
      </table>
    </div>

    ${stats.totalLeads > 0 ? `
    <div style="margin:0 0 20px;padding:16px 20px;background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;">
      <h2 style="margin:0 0 8px;font-size:15px;font-weight:600;color:#111;">Lead Pipeline</h2>
      <p style="margin:0;font-size:14px;color:#374151;">
        ${stats.totalLeads} total leads &middot; ${stats.replies} replied &middot; ${stats.totalConverted} converted
      </p>
    </div>` : ""}

    ${stats.tasksQueued > 0 ? `
    <p style="margin:0 0 20px;font-size:14px;color:#374151;">
      <strong>${stats.tasksQueued} tasks</strong> are queued up for this week.
    </p>` : ""}

    ${upgradeHtml}

    <a href="${appUrl}/dashboard/${slug}"
       style="display:inline-block;margin-top:16px;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">
      Open Dashboard
    </a>
  `, undefined, unsubscribeUrl);

  return sendEmail("platform", {
    from: getAgentFrom(),
    to: toEmail,
    subject: `${companyName} — Weekly: ${stats.tasksCompleted} tasks, ${stats.emailsSent} emails, ~${stats.timeSavedHours}h saved`,
    html,
    tag: "weekly-summary",
    projectSlug: slug,
  });
}

// ---------------------------------------------------------------------------
// Form submission notification
// ---------------------------------------------------------------------------

export async function sendFormNotificationEmail(options: {
  to: string;
  projectName: string;
  formSlug: string;
  submitterEmail: string;
  submitterName?: string;
  data: Record<string, string>;
}) {
  const { to, projectName, formSlug, submitterEmail, submitterName, data } = options;

  const dataRows = Object.entries(data)
    .filter(([key]) => !["email", "name", "formSlug", "form_slug", "_honey"].includes(key))
    .map(([key, value]) => `
      <tr>
        <td style="padding: 8px 12px; font-weight: 600; color: #374151; border-bottom: 1px solid #f3f4f6; width: 120px; vertical-align: top;">${key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ")}</td>
        <td style="padding: 8px 12px; color: #6b7280; border-bottom: 1px solid #f3f4f6;">${value}</td>
      </tr>
    `)
    .join("");

  const html = baseLayout(`
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-block; padding: 12px; border-radius: 16px; background: linear-gradient(135deg, #10b981, #059669);">
        <span style="font-size: 28px;">📩</span>
      </div>
    </div>
    <h2 style="font-size: 22px; font-weight: 700; color: #111827; text-align: center; margin: 0 0 8px;">New Form Submission</h2>
    <p style="color: #6b7280; text-align: center; margin: 0 0 24px;">Someone submitted the <strong>${formSlug}</strong> form on your site</p>
    <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 12px; font-weight: 600; color: #374151; border-bottom: 1px solid #f3f4f6; width: 120px;">Name</td>
          <td style="padding: 8px 12px; color: #6b7280; border-bottom: 1px solid #f3f4f6;">${submitterName || "—"}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; font-weight: 600; color: #374151; border-bottom: 1px solid #f3f4f6;">Email</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6;"><a href="mailto:${submitterEmail}" style="color: #6366f1; text-decoration: none;">${submitterEmail}</a></td>
        </tr>
        ${dataRows}
      </table>
    </div>
    <div style="text-align: center;">
      <a href="mailto:${submitterEmail}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #6366f1, #4f46e5); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Reply to ${submitterName || submitterEmail}</a>
    </div>
  `, projectName);

  await sendEmail("platform", {
    from: getAgentFrom(),
    to,
    subject: `${projectName} — New form submission from ${submitterName || submitterEmail}`,
    html,
    tag: "form-notification",
  });
}

// ── Morning Digest ───────────────────────────────────────────────────

export async function sendMorningDigest(options: {
  slug: string;
  companyName: string;
  toEmail: string;
  toName: string | null;
  tasksCompleted: Array<{ title: string; summary: string }>;
  tasksUpcoming: Array<{ title: string }>;
  analytics?: {
    pageviews: number;
    uniqueVisitors: number;
    avgEngagementSec: number;
    topSource: string | null;
  };
  revenue?: {
    activeSubscribers: number;
    mrrCents: number;
  };
  emailsReceived: number;
  leadsFound: number;
}) {
  const {
    slug, companyName, toEmail, toName,
    tasksCompleted, tasksUpcoming,
    analytics, revenue, emailsReceived, leadsFound,
  } = options;
  const firstName = toName ? toName.split(" ")[0] : "there";

  const completedHtml = tasksCompleted.length > 0
    ? `<h2 style="margin:0 0 12px;font-size:16px;font-weight:600;color:#111;">Completed overnight</h2>
       ${tasksCompleted.map((t) => `
         <div style="margin:0 0 12px;padding:12px 16px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;">
           <strong style="font-size:14px;color:#111;">${t.title}</strong>
           <p style="margin:6px 0 0;font-size:13px;color:#6B7280;line-height:1.5;">${t.summary}</p>
         </div>
       `).join("")}`
    : `<p style="font-size:14px;color:#6B7280;">No tasks ran overnight. <a href="${getAppUrl()}/dashboard" style="color:#111;text-decoration:underline;">Add some tasks</a> to keep things moving.</p>`;

  const upcomingHtml = tasksUpcoming.length > 0
    ? `<h2 style="margin:20px 0 12px;font-size:16px;font-weight:600;color:#111;">Up next</h2>
       <ul style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.8;color:#374151;">
         ${tasksUpcoming.map((t) => `<li>${t.title}</li>`).join("")}
       </ul>`
    : "";

  const statsItems: string[] = [];
  if (analytics && analytics.uniqueVisitors > 0) {
    statsItems.push(`<tr><td style="padding:2px 0;width:50%;">Visitors (7d)</td><td style="padding:2px 0;font-weight:600;">${analytics.uniqueVisitors.toLocaleString()}</td></tr>`);
    statsItems.push(`<tr><td style="padding:2px 0;">Pageviews (7d)</td><td style="padding:2px 0;font-weight:600;">${analytics.pageviews.toLocaleString()}</td></tr>`);
    if (analytics.topSource) {
      statsItems.push(`<tr><td style="padding:2px 0;">Top source</td><td style="padding:2px 0;font-weight:600;">${analytics.topSource}</td></tr>`);
    }
  }
  if (emailsReceived > 0) {
    statsItems.push(`<tr><td style="padding:2px 0;">Emails received</td><td style="padding:2px 0;font-weight:600;">${emailsReceived}</td></tr>`);
  }
  if (leadsFound > 0) {
    statsItems.push(`<tr><td style="padding:2px 0;">New leads</td><td style="padding:2px 0;font-weight:600;">${leadsFound}</td></tr>`);
  }
  if (revenue && revenue.activeSubscribers > 0) {
    statsItems.push(`<tr><td style="padding:2px 0;">MRR</td><td style="padding:2px 0;font-weight:600;">$${(revenue.mrrCents / 100).toFixed(2)}</td></tr>`);
    statsItems.push(`<tr><td style="padding:2px 0;">Subscribers</td><td style="padding:2px 0;font-weight:600;">${revenue.activeSubscribers}</td></tr>`);
  }

  const statsHtml = statsItems.length > 0
    ? `<div style="margin:20px 0;padding:16px 20px;background-color:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;">
         <h2 style="margin:0 0 10px;font-size:15px;font-weight:600;color:#15803D;">At a glance</h2>
         <table cellpadding="0" cellspacing="0" style="font-size:14px;color:#374151;width:100%;">${statsItems.join("")}</table>
       </div>`
    : "";

  const html = baseLayout(`
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111;">${companyName} — Morning Digest</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">Good morning ${firstName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151;">
      Here's what happened with ${companyName} overnight and what's coming up today.
    </p>
    ${completedHtml}
    ${statsHtml}
    ${upcomingHtml}
    <p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:#374151;border-top:1px solid #e5e7eb;padding-top:16px;">
      <strong>Reply to this email</strong> to give instructions — add a task, update your site, ask a question. I'll handle it.
    </p>
    <a href="${getAppUrl()}/dashboard"
       style="display:inline-block;margin-top:16px;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">
      Open Dashboard
    </a>
  `);

  const replyTo = getAgentAddress();

  return sendEmail("platform", {
    from: getAgentFrom(),
    to: toEmail,
    subject: `${companyName} — Morning Digest`,
    html,
    replyTo,
    tag: "morning-digest",
    projectSlug: slug,
  });
}

// ── Bounce Webhook Handler ────────────────────────────────────────────

export interface PostmarkBouncePayload {
  ID: number;
  Type: string;
  TypeCode: number;
  Name: string;
  Tag?: string;
  MessageID: string;
  ServerID: number;
  Description: string;
  Details: string;
  Email: string;
  From: string;
  BouncedAt: string;
  DumpAvailable: boolean;
  Inactive: boolean;
  CanActivate: boolean;
  Subject?: string;
  Content?: string;
  Metadata?: Record<string, string>;
}

/**
 * Handles a Postmark bounce webhook payload.
 * Records the bounce in email_sends for warmup tracking and monitoring.
 */
export async function handleBounceWebhook(
  payload: PostmarkBouncePayload,
): Promise<void> {
  const bouncedEmail = payload.Email;
  // TypeCode: 1 = hard bounce, 2+ = soft/transient
  const bounceType: "hard" | "soft" = payload.TypeCode === 1 ? "hard" : "soft";

  console.log(
    `[postmark:bounce] ${bounceType} bounce for ${bouncedEmail} — ${payload.Name}: ${payload.Description}`,
  );

  // Try to find the project from the bounce metadata or From address
  const projectId = payload.Metadata?.project_id;
  if (!projectId) {
    // Try to find the project by looking up the bounced recipient in email_sends
    const db = getDb();
    const rows = await db`
      SELECT project_id FROM email_sends
      WHERE recipient = ${bouncedEmail}
      ORDER BY sent_at DESC
      LIMIT 1
    `;

    if (rows[0]) {
      await handleBounce(rows[0].project_id as string, bouncedEmail, bounceType);
      console.log(
        `[postmark:bounce] Recorded ${bounceType} bounce for project ${rows[0].project_id}`,
      );
    } else {
      console.warn(
        `[postmark:bounce] Could not find project for bounced email ${bouncedEmail}`,
      );
    }
    return;
  }

  await handleBounce(projectId, bouncedEmail, bounceType);
  console.log(
    `[postmark:bounce] Recorded ${bounceType} bounce for project ${projectId}`,
  );
}
