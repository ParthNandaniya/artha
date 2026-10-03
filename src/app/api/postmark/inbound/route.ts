import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import { ingestInboundEmail, buildChatContext } from "@/lib/supermemory";
import { getAgentReplyTo, sendAgentReply, sendCompanyReply, sendCustomerWaitingEmail } from "@/lib/postmark";
import { orchestrateEmail } from "@/lib/agents/orchestrator";
import { getProjectCredits } from "@/lib/project-credits";
import { captureFounderSignals } from "@/lib/personalization";
import { resolveOrCreateThread, addMessageToThread } from "@/lib/email-threads";
import { hasExistingWebsiteDraft } from "@/lib/website";
import { detectSequenceReply } from "@/lib/sequences";
import {
  createPlatformEmailThread,
  ensurePlatformEmailSchema,
  findLatestPlatformThreadForSender,
  findPlatformThreadByReference,
  insertPlatformEmailMessage,
  normalizeEmailAddress,
  normalizeMessageId,
  type PlatformEmailThread,
  updatePlatformEmailThread,
} from "@/lib/platform-email";

type InboundHeader = { Name: string; Value: string };

type InboundEmail = {
  toAddress: string;
  fromEmail: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  messageId: string;
  inReplyTo: string | null;
  referenceIds: string[];
};

type RouteTarget =
  | { kind: "company"; slug: string }
  | { kind: "platform"; slugHint: string | null };

type UserRow = { id: string; email: string; name: string | null };

type ProjectRow = Record<string, unknown> & {
  id: string;
  user_id: string;
  slug: string;
  name: string;
  neon_connection_url: string | null;
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://artha.run";
const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN || "artha.run";
const COMPANY_DOMAIN = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";

function secretsMatch(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length
    && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function hasValidInboundSecret(request: NextRequest) {
  const expectedSecret = process.env.POSTMARK_INBOUND_WEBHOOK_SECRET?.trim();
  if (!expectedSecret) return true;

  const headerSecret = request.headers.get("x-postmark-inbound-secret")?.trim();
  const bearerSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const querySecret = request.nextUrl.searchParams.get("secret")?.trim();

  return [headerSecret, bearerSecret, querySecret].some((candidate) => {
    if (!candidate) return false;
    return secretsMatch(candidate, expectedSecret);
  });
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getHeaders(body: Record<string, unknown>): InboundHeader[] {
  return Array.isArray(body.Headers)
    ? (body.Headers as Array<{ Name?: unknown; Value?: unknown }>)
        .filter((header): header is { Name: string; Value: string } => (
          typeof header?.Name === "string" && typeof header?.Value === "string"
        ))
    : [];
}

function getHeaderValue(headers: InboundHeader[], name: string): string | null {
  const match = headers.find((header) => header.Name.toLowerCase() === name.toLowerCase());
  return match?.Value?.trim() || null;
}

function getReferenceIds(headers: InboundHeader[]) {
  const rawValues = [
    getHeaderValue(headers, "In-Reply-To"),
    getHeaderValue(headers, "References"),
  ].filter(Boolean) as string[];

  const seen = new Set<string>();
  const references: string[] = [];

  for (const value of rawValues) {
    for (const part of value.split(/[\s,]+/)) {
      const normalized = normalizeMessageId(part);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      references.push(normalized);
    }
  }

  return references;
}

function extractEmailAddresses(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  return matches || [];
}

function getRecipientCandidates(body: Record<string, unknown>, headers: InboundHeader[]) {
  const candidates = [
    getHeaderValue(headers, "X-Original-To"),
    getHeaderValue(headers, "Delivered-To"),
    getHeaderValue(headers, "Envelope-To"),
    getHeaderValue(headers, "X-Envelope-To"),
    getHeaderValue(headers, "X-Forwarded-To"),
    getHeaderValue(headers, "To"),
    typeof body.To === "string" ? body.To : null,
  ];

  if (Array.isArray(body.ToFull)) {
    for (const recipient of body.ToFull) {
      if (!recipient || typeof recipient !== "object") continue;
      const email = (recipient as { Email?: unknown }).Email;
      candidates.push(typeof email === "string" ? email : null);
    }
  }

  const seen = new Set<string>();
  const extracted: string[] = [];

  for (const candidate of candidates) {
    for (const email of extractEmailAddresses(candidate)) {
      const normalized = normalizeEmailAddress(email);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      extracted.push(normalized);
    }
  }

  return extracted;
}

function parseInboundEmail(body: Record<string, unknown>): InboundEmail {
  const headers = getHeaders(body);
  const rawMessageId = (
    typeof body.MessageID === "string" ? body.MessageID : null
  ) || getHeaderValue(headers, "Message-ID") || "";
  const recipientCandidates = getRecipientCandidates(body, headers);
  const matchedRecipient = recipientCandidates.find((candidate) => parseTargetAddress(candidate));

  return {
    // Forwarded platform mail can preserve the original recipient only in mailbox-provider headers.
    toAddress: matchedRecipient || recipientCandidates[0] || "",
    fromEmail: String(
      typeof body.FromFull === "object" && body.FromFull && "Email" in body.FromFull
        ? (body.FromFull as { Email?: unknown }).Email || body.From || ""
        : body.From || ""
    ).trim(),
    subject: String(body.Subject || "").trim(),
    textBody: String(body.TextBody || ""),
    htmlBody: String(body.HtmlBody || ""),
    messageId: normalizeMessageId(rawMessageId) || "",
    inReplyTo: normalizeMessageId(getHeaderValue(headers, "In-Reply-To")),
    referenceIds: getReferenceIds(headers),
  };
}

async function lookupProjectByCustomEmailDomain(localPart: string, domain: string): Promise<RouteTarget | null> {
  try {
    const db = getDb();
    const rows = await db`
      SELECT slug FROM projects
      WHERE custom_email_domain = ${domain}
        AND email_domain_verified = TRUE
        AND slug = ${localPart}
      LIMIT 1
    `;
    if (rows.length > 0) {
      return { kind: "company", slug: rows[0].slug as string };
    }

    // Also try matching just by custom domain (any slug prefix)
    const domainRows = await db`
      SELECT slug FROM projects
      WHERE custom_email_domain = ${domain}
        AND email_domain_verified = TRUE
      LIMIT 1
    `;
    if (domainRows.length > 0) {
      return { kind: "company", slug: domainRows[0].slug as string };
    }
  } catch {
    // DB lookup failed — fall through
  }
  return null;
}

function parseTargetAddress(toAddress: string): RouteTarget | null {
  const normalized = normalizeEmailAddress(toAddress);
  const companyPattern = new RegExp(`^([^@]+)@${escapeRegex(COMPANY_DOMAIN)}$`, "i");
  const companyMatch = normalized.match(companyPattern);
  if (companyMatch) {
    return { kind: "company", slug: companyMatch[1].toLowerCase() };
  }

  const platformPattern = new RegExp(`^agents(?:\\+([^@]+))?@${escapeRegex(APP_DOMAIN)}$`, "i");
  const platformMatch = normalized.match(platformPattern);
  if (platformMatch) {
    return { kind: "platform", slugHint: platformMatch[1]?.toLowerCase() || null };
  }

  return null;
}

async function parseTargetAddressWithCustomDomain(toAddress: string): Promise<RouteTarget | null> {
  // First try standard routing
  const standard = parseTargetAddress(toAddress);
  if (standard) return standard;

  // Then try custom email domain lookup
  const normalized = normalizeEmailAddress(toAddress);
  const atIndex = normalized.indexOf("@");
  if (atIndex === -1) return null;

  const localPart = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);

  return lookupProjectByCustomEmailDomain(localPart, domain);
}

function stripQuotedContent(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  for (const line of lines) {
    if (/^on .+ wrote:$/i.test(line.trim())) break;
    if (/^>/.test(line)) continue;
    if (/^-{3,}/.test(line.trim())) break;
    if (/^_{3,}/.test(line.trim())) break;
    result.push(line);
  }
  return result.join("\n").trim();
}

function normalizeSearchText(text: string) {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

function projectMentioned(project: { slug: string; name: string }, text: string) {
  const normalized = normalizeSearchText(text);
  const slug = project.slug.toLowerCase();
  const projectName = project.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return normalized.includes(` ${slug} `) || (projectName ? normalized.includes(` ${projectName} `) : false);
}

function combineClarification(originalText: string, clarificationText: string) {
  const clarification = clarificationText.trim();
  if (!clarification) return originalText;
  return `${originalText}\n\nFounder clarification:\n${clarification}`;
}

function buildProjectClarificationHtml(projects: Array<{ slug: string; name: string }>, reason?: string) {
  const projectItems = projects
    .map((project) => `<li><strong>${project.name}</strong> - reply with <code>${project.slug}</code></li>`)
    .join("");

  return `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      ${reason || "I can help with that, but I need to know which company you mean."}
    </p>
    <p style="margin:0 0 12px;font-size:14px;color:#374151;">
      Reply with one of these project slugs:
    </p>
    <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.8;color:#374151;">
      ${projectItems}
    </ul>
    <p style="margin:0;font-size:14px;color:#6b7280;">
      Tip: you can also include the project slug or company name in the subject next time.
    </p>
  `;
}

async function loadUserByEmail(email: string) {
  const db = getDb();
  const normalized = normalizeEmailAddress(email);
  const rows = await db`
    SELECT id, email, name
    FROM users
    WHERE LOWER(email) = ${normalized}
    LIMIT 1
  `;
  return (rows[0] as UserRow | undefined) || null;
}

async function loadUserProjects(userId: string) {
  const db = getDb();
  const rows = await db`
    SELECT id, slug, name
    FROM projects
    WHERE user_id = ${userId}
    ORDER BY created_at ASC
  `;
  return rows as Array<{ id: string; slug: string; name: string }>;
}

async function loadProjectForUser(userId: string, projectId: string) {
  const db = getDb();
  const rows = await db`
    SELECT *
    FROM projects
    WHERE id = ${projectId}
      AND user_id = ${userId}
    LIMIT 1
  `;
  return (rows[0] as ProjectRow | undefined) || null;
}

function resolveProjectMatch(
  projects: Array<{ id: string; slug: string; name: string }>,
  options: {
    slugHint?: string | null;
    subject: string;
    replyText: string;
    thread?: PlatformEmailThread | null;
    threadSource: "reference" | "sender" | "new";
  }
) {
  if (options.slugHint) {
    const directMatch = projects.find((project) => project.slug.toLowerCase() === options.slugHint);
    return { project: directMatch || null, invalidSlugHint: !directMatch };
  }

  if (options.threadSource === "reference" && options.thread?.project_id) {
    const threadProject = projects.find((project) => project.id === options.thread?.project_id);
    if (threadProject) return { project: threadProject, invalidSlugHint: false };
  }

  const combinedText = `${options.subject}\n${options.replyText}`;
  const mentionedProjects = projects.filter((project) => projectMentioned(project, combinedText));
  if (mentionedProjects.length === 1) {
    return { project: mentionedProjects[0], invalidSlugHint: false };
  }

  if (projects.length === 1) {
    return { project: projects[0], invalidSlugHint: false };
  }

  return { project: null, invalidSlugHint: false };
}

async function upsertPlatformThreadForInbound(params: {
  inbound: InboundEmail;
  user: UserRow | null;
}) {
  const db = getDb();
  await ensurePlatformEmailSchema(db);

  const referencedThread = await findPlatformThreadByReference(db, params.inbound.referenceIds);
  const sameSenderReference = referencedThread
    && referencedThread.sender_email_normalized === normalizeEmailAddress(params.inbound.fromEmail)
      ? referencedThread
      : null;
  const latestSenderThread = sameSenderReference
    ? null
    : await findLatestPlatformThreadForSender(db, params.inbound.fromEmail);

  const threadSource: "reference" | "sender" | "new" = sameSenderReference
    ? "reference"
    : latestSenderThread
      ? "sender"
      : "new";
  let thread = sameSenderReference || latestSenderThread;

  if (!thread) {
    thread = await createPlatformEmailThread(db, {
      senderEmail: params.inbound.fromEmail,
      userId: params.user?.id || null,
      status: params.user ? "customer" : "external_lead",
      lastMessageId: params.inbound.messageId,
      metadata: {
        last_route: "platform_inbound",
      },
    });
  } else {
    thread = await updatePlatformEmailThread(db, thread, {
      userId: params.user?.id || thread.user_id,
      status: params.user && thread.status === "external_lead" ? "customer" : thread.status,
      lastMessageId: params.inbound.messageId,
      metadataPatch: {
        last_route: "platform_inbound",
      },
    });
  }

  await insertPlatformEmailMessage(db, {
    threadId: thread.id,
    direction: "inbound",
    fromEmail: params.inbound.fromEmail,
    toEmail: params.inbound.toAddress,
    subject: params.inbound.subject,
    bodyText: params.inbound.textBody,
    bodyHtml: params.inbound.htmlBody,
    messageId: params.inbound.messageId,
    inReplyTo: params.inbound.inReplyTo,
    metadata: {
      route: "platform_inbound",
    },
  });

  return { db, thread, threadSource };
}

async function sendPlatformThreadReply(params: {
  db: ReturnType<typeof getDb>;
  thread: PlatformEmailThread;
  toEmail: string;
  subject: string;
  bodyHtml: string;
  inReplyTo?: string | null;
  replyTo?: string;
  status?: string;
  awaitingProjectClarification?: boolean;
  pendingSubject?: string | null;
  pendingBodyText?: string | null;
  pendingBodyHtml?: string | null;
  projectId?: string | null;
  metadataPatch?: Record<string, unknown>;
}) {
  const sent = await sendAgentReply({
    toEmail: params.toEmail,
    subject: params.subject,
    bodyHtml: params.bodyHtml,
    inReplyTo: params.inReplyTo || undefined,
    replyTo: params.replyTo,
  });

  const outboundMessageId = normalizeMessageId((sent as { MessageID?: string } | undefined)?.MessageID);
  await insertPlatformEmailMessage(params.db, {
    threadId: params.thread.id,
    direction: "outbound",
    fromEmail: `agents@${APP_DOMAIN}`,
    toEmail: params.toEmail,
    subject: params.subject,
    bodyHtml: params.bodyHtml,
    messageId: outboundMessageId,
    inReplyTo: params.inReplyTo || null,
    metadata: {
      route: "platform_outbound",
      ...(params.metadataPatch || {}),
    },
  });

  return updatePlatformEmailThread(params.db, params.thread, {
    projectId: params.projectId,
    status: params.status,
    awaitingProjectClarification: params.awaitingProjectClarification,
    pendingSubject: params.pendingSubject,
    pendingBodyText: params.pendingBodyText,
    pendingBodyHtml: params.pendingBodyHtml,
    lastOutboundMessageId: outboundMessageId,
    metadataPatch: params.metadataPatch,
  });
}

async function runFounderInstruction(params: {
  db: ReturnType<typeof getDb>;
  projectId: string;
  project: ProjectRow;
  user: UserRow;
  replyText: string;
  subject: string;
  messageId: string;
  inboundId: string;
  agentReplyTo: string;
  platformReplyThread?: {
    db: ReturnType<typeof getDb>;
    thread: PlatformEmailThread;
  };
}) {
  const {
    db,
    projectId,
    project,
    user,
    replyText,
    subject,
    messageId,
    inboundId,
    agentReplyTo,
    platformReplyThread,
  } = params;
  const creditsAvailable = getProjectCredits(project);
  const hasWebsiteDraft = await hasExistingWebsiteDraft(projectId);
  const freeWebsiteBuildAvailable = !project.landing_page_published
    && (!project.landing_page_html || String(project.landing_page_html).trim().length === 0)
    && !hasWebsiteDraft;

  async function sendFounderAgentReply(bodyHtml: string) {
    const sent = await sendAgentReply({
      toEmail: user.email,
      subject: `Re: ${subject}`,
      bodyHtml,
      inReplyTo: messageId,
      replyTo: agentReplyTo,
    });

    if (!platformReplyThread) return;

    const outboundMessageId = normalizeMessageId((sent as { MessageID?: string } | undefined)?.MessageID);
    await insertPlatformEmailMessage(platformReplyThread.db, {
      threadId: platformReplyThread.thread.id,
      direction: "outbound",
      fromEmail: `agents@${APP_DOMAIN}`,
      toEmail: user.email,
      subject: `Re: ${subject}`,
      bodyHtml,
      messageId: outboundMessageId,
      inReplyTo: messageId,
      metadata: {
        route: "platform_orchestrator_reply",
        project_slug: project.slug,
      },
    });
    await updatePlatformEmailThread(platformReplyThread.db, platformReplyThread.thread, {
      projectId,
      status: "customer",
      awaitingProjectClarification: false,
      pendingSubject: null,
      pendingBodyText: null,
      pendingBodyHtml: null,
      lastOutboundMessageId: outboundMessageId,
      metadataPatch: {
        last_route: "platform_orchestrator_reply",
        last_project_slug: project.slug,
      },
    });
  }

  await db`
    INSERT INTO chat_messages (project_id, role, content, type, metadata)
    VALUES (${projectId}, 'system', ${`📧 Email from founder: "${subject}"`}, 'email', ${JSON.stringify({ source: "email", inboundId, messageId })}::jsonb)
  `;

  const result = await orchestrateEmail({
    projectId,
    userId: user.id,
    emailBody: replyText,
    subject,
    creditsAvailable,
    freeWebsiteBuildAvailable,
    metadata: {
      slug: project.slug,
      companyName: project.name,
      repoFullName: project.github_repo_full_name,
    },
  });

  if (result.directAnswer) {
    await db`
      INSERT INTO chat_messages (project_id, role, content, type, metadata)
      VALUES (${projectId}, 'assistant', ${result.directAnswer}, 'email', ${JSON.stringify({ source: "email_reply" })}::jsonb)
    `;

    await sendFounderAgentReply(
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">${result.directAnswer.replace(/\n/g, "<br>")}</p>
        <p style="margin:16px 0 0;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:12px;">
          <a href="${APP_URL}/dashboard" style="color:#2563eb;">View dashboard</a>
        </p>`,
    );
    return;
  }

  if (result.noCredits) {
    await sendFounderAgentReply(
      `<p style="font-size:15px;line-height:1.6;color:#374151;">
        You're out of task credits. To execute tasks, subscribe to Pro ($49/mo for 35 credits) or buy a credit pack ($25 for 15 credits).
      </p>
      <a href="${APP_URL}/dashboard/${project.slug}?buy_credits=true" style="display:inline-block;margin-top:12px;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">
        Get Credits
      </a>`,
    );
    return;
  }

  if (result.output) {
    const output = result.output;
    const summary = output.summary;
    const linksHtml = (output.links || [])
      .map((link) => `<a href="${APP_URL}${link.url}" style="color:#2563eb;">${link.label}</a>`)
      .join(" · ");

    await db`
      INSERT INTO chat_messages (project_id, role, content, type, metadata)
      VALUES (${projectId}, 'assistant', ${`✅ ${summary}`}, 'email', ${JSON.stringify({ source: "email_agent", agent: output.agent })}::jsonb)
    `;

    await db`
      UPDATE email_inbound SET processed = TRUE WHERE project_id = ${projectId} AND id = ${inboundId}
    `;

    await sendFounderAgentReply(
      `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
        Done! Here's what happened:
      </p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
        ${summary}
      </p>
      ${linksHtml ? `<p style="margin:0 0 16px;font-size:14px;">${linksHtml}</p>` : ""}
      <p style="margin:16px 0 0;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:12px;">
        <a href="${APP_URL}/dashboard" style="color:#2563eb;">View full details in your dashboard</a>
      </p>`,
    );
  }
}

async function handleExternalCompanyEmail(params: {
  db: ReturnType<typeof getDb>;
  projectId: string;
  project: ProjectRow;
  user: UserRow;
  fromEmail: string;
  replyText: string;
  subject: string;
  messageId: string;
  inboundId: string;
}) {
  const { db, projectId, project, user, fromEmail, replyText, subject, messageId, inboundId } = params;
  const companyEmail = `${project.slug}@${COMPANY_DOMAIN}`;

  // 1. Load project settings to check auto-respond toggle
  let autoRespond = true;
  try {
    const rows = await db`SELECT settings FROM company_profile WHERE project_id = ${projectId} LIMIT 1`;
    const settings = rows.length > 0 ? (rows[0].settings as Record<string, unknown> || {}) : {};
    autoRespond = settings.email_auto_respond !== false; // default true
  } catch {
    // If company_profile doesn't exist yet, default to true
  }

  // 2. If auto-respond is off, just notify in chat
  if (!autoRespond) {
    await db`
      INSERT INTO chat_messages (project_id, role, content, type, metadata)
      VALUES (${projectId}, 'system', ${`📧 External email from ${fromEmail}: "${subject}"`}, 'email', ${JSON.stringify({ source: "external_email", fromEmail, inboundId, autoReplied: false })}::jsonb)
    `;
    return;
  }

  // 3. Check credits/subscription
  const creditsAvailable = getProjectCredits(project);
  const hasSubscription = project.subscription_status === "active";

  if (creditsAvailable <= 0 && !hasSubscription) {
    // No credits and no subscription — notify founder, don't auto-reply
    await db`
      INSERT INTO chat_messages (project_id, role, content, type, metadata)
      VALUES (${projectId}, 'system', ${`📧 External email from ${fromEmail}: "${subject}" — auto-reply skipped (no credits)`}, 'email', ${JSON.stringify({ source: "external_email_no_credits", fromEmail, inboundId, autoReplied: false })}::jsonb)
    `;

    // Email founder about the waiting customer
    await sendCustomerWaitingEmail({
      toEmail: user.email,
      founderName: user.name,
      companyName: project.name as string,
      companySlug: project.slug as string,
      customerEmail: fromEmail,
      customerSubject: subject,
    }).catch((e) => console.error("Failed to send customer-waiting email:", e));

    return;
  }

  // 4. Route through orchestrator (same as founder emails — credit cost matches complexity)
  const result = await orchestrateEmail({
    projectId,
    userId: project.user_id as string,
    emailBody: `Customer email from ${fromEmail}:\nSubject: ${subject}\n\n${replyText}\n\nWrite a professional, helpful reply to this customer inquiry on behalf of ${project.name}. Be concise and address their question directly.`,
    subject,
    creditsAvailable,
    metadata: {
      slug: project.slug,
      companyName: project.name,
      isCustomerEmail: true,
    },
  });

  // Build the reply text from orchestrator result
  let replyContent: string | null = null;
  if (result.directAnswer) {
    replyContent = result.directAnswer;
  } else if (result.output?.summary) {
    replyContent = result.output.summary;
  } else if (result.noCredits) {
    // Orchestrator says no credits (race condition or agent cost higher than available)
    await db`
      INSERT INTO chat_messages (project_id, role, content, type, metadata)
      VALUES (${projectId}, 'system', ${`📧 External email from ${fromEmail}: "${subject}" — auto-reply skipped (insufficient credits)`}, 'email', ${JSON.stringify({ source: "external_email_no_credits", fromEmail, inboundId, autoReplied: false })}::jsonb)
    `;
    await sendCustomerWaitingEmail({
      toEmail: user.email,
      founderName: user.name,
      companyName: project.name as string,
      companySlug: project.slug as string,
      customerEmail: fromEmail,
      customerSubject: subject,
    }).catch((e) => console.error("Failed to send customer-waiting email:", e));
    return;
  }

  if (!replyContent) {
    // Fallback — shouldn't happen but be safe
    await db`
      INSERT INTO chat_messages (project_id, role, content, type, metadata)
      VALUES (${projectId}, 'system', ${`📧 External email from ${fromEmail}: "${subject}"`}, 'email', ${JSON.stringify({ source: "external_email", fromEmail, inboundId, autoReplied: false })}::jsonb)
    `;
    return;
  }

  // 5. Send reply and record in chat
  const replyHtml = `<p style="font-size:15px;line-height:1.6;color:#374151;">${replyContent.replace(/\n/g, "<br>")}</p>`;

  await db`
    INSERT INTO chat_messages (project_id, role, content, type, metadata)
    VALUES (${projectId}, 'system', ${`📧 External email from ${fromEmail}: "${subject}" — Auto-replied`}, 'email', ${JSON.stringify({ source: "external_email", fromEmail, inboundId, autoReplied: true })}::jsonb)
  `;

  const customEmailDomain = (project as any).email_domain_verified ? (project as any).custom_email_domain : null;
  const sent = await sendCompanyReply({
    slug: project.slug as string,
    companyName: project.name as string,
    toEmail: fromEmail,
    subject: `Re: ${subject}`,
    bodyHtml: replyHtml,
    inReplyTo: messageId,
    customEmailDomain,
  });

  // 6. Record outbound reply in email_threads so it shows in the inbox
  const outboundMessageId = normalizeMessageId((sent as { MessageID?: string } | undefined)?.MessageID);
  try {
    const { threadId } = await resolveOrCreateThread(projectId, {
      subject: `Re: ${subject}`,
      fromEmail: companyEmail,
      toEmail: fromEmail,
      messageId: outboundMessageId,
      inReplyTo: messageId,
    });
    await addMessageToThread(projectId, {
      threadId,
      direction: "outbound",
      fromEmail: companyEmail,
      toEmail: fromEmail,
      subject: `Re: ${subject}`,
      bodyText: replyContent,
      bodyHtml: replyHtml,
      messageId: outboundMessageId,
      inReplyTo: messageId,
    });
  } catch (e) {
    console.error("Failed to record auto-reply in email thread (non-fatal):", e);
  }

  // Mark sequence reply if this sender is in an active follow-up sequence
  await detectSequenceReply(projectId, fromEmail).catch(() => {});

  await db`
    UPDATE email_inbound SET processed = TRUE WHERE project_id = ${projectId} AND id = ${inboundId}
  `;
}

async function handleCompanyInbound(inbound: InboundEmail, slug: string) {
  const db = getDb();
  const projects = await db`
    SELECT *, custom_email_domain, email_domain_verified
    FROM projects
    WHERE slug = ${slug}
  `;

  if (projects.length === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 200 });
  }

  const project = projects[0] as ProjectRow;
  const projectId = project.id as string;
  const users = await db`
    SELECT id, email, name
    FROM users
    WHERE id = ${project.user_id}
    LIMIT 1
  `;

  if (users.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 200 });
  }

  const user = users[0] as UserRow;
  const isFounder = normalizeEmailAddress(user.email) === normalizeEmailAddress(inbound.fromEmail);
  const replyText = stripQuotedContent(inbound.textBody);

  const inboundRows = await db`
    INSERT INTO email_inbound (project_id, from_email, subject, body_text, body_html, message_id)
    VALUES (${projectId}, ${inbound.fromEmail}, ${inbound.subject}, ${replyText}, ${inbound.htmlBody}, ${inbound.messageId || null})
    RETURNING id
  `;

  // Write to threaded email model
  const companyEmail = `${slug}@${COMPANY_DOMAIN}`;
  try {
    const { threadId } = await resolveOrCreateThread(project.id as string, {
      subject: inbound.subject || "(no subject)",
      fromEmail: inbound.fromEmail,
      toEmail: companyEmail,
      messageId: inbound.messageId,
      inReplyTo: inbound.inReplyTo,
    });
    await addMessageToThread(project.id as string, {
      threadId,
      direction: "inbound",
      fromEmail: inbound.fromEmail,
      toEmail: companyEmail,
      subject: inbound.subject,
      bodyText: replyText,
      bodyHtml: inbound.htmlBody,
      messageId: inbound.messageId || null,
      inReplyTo: inbound.inReplyTo || null,
    });
  } catch (e) {
    console.error("Failed to write email thread (non-fatal):", e);
  }

  ingestInboundEmail({
    projectId: project.id as string,
    userId: project.user_id as string,
    emailId: inboundRows[0].id as string,
    from: inbound.fromEmail,
    subject: inbound.subject,
    body: replyText,
  }).catch(() => {});

  if (isFounder) {
    captureFounderSignals({
      userId: user.id,
      projectId: project.id as string,
      text: replyText,
    }).catch(() => {});

    await runFounderInstruction({
      db,
      projectId,
      project,
      user,
      replyText,
      subject: inbound.subject,
      messageId: inbound.messageId,
      inboundId: inboundRows[0].id as string,
      agentReplyTo: getAgentReplyTo(project.slug),
    });
  } else {
    await handleExternalCompanyEmail({
      db,
      projectId,
      project,
      user,
      fromEmail: inbound.fromEmail,
      replyText,
      subject: inbound.subject,
      messageId: inbound.messageId,
      inboundId: inboundRows[0].id as string,
    });
  }

  return NextResponse.json({ success: true });
}

async function handlePlatformInbound(inbound: InboundEmail, slugHint: string | null) {
  const replyText = stripQuotedContent(inbound.textBody);
  const user = await loadUserByEmail(inbound.fromEmail);
  const { db, thread, threadSource } = await upsertPlatformThreadForInbound({ inbound, user });

  if (!user) {
    await sendPlatformThreadReply({
      db,
      thread,
      toEmail: inbound.fromEmail,
      subject: `Re: ${inbound.subject || "your email"}`,
      bodyHtml: `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
        Thanks for reaching out to Artha. This inbox is AI-driven for founders using Artha.
      </p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
        To get started, sign up with this same email address and I'll automatically link future email context to your account.
      </p>
      <p style="margin:0 0 16px;">
        <a href="${APP_URL}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">
          Open Artha
        </a>
      </p>
      <p style="margin:0;font-size:13px;color:#6b7280;">
        If you already have an account, sign in first and email me again from the same address.
      </p>`,
      inReplyTo: inbound.messageId || null,
      status: "external_lead",
      metadataPatch: {
        lead_email: normalizeEmailAddress(inbound.fromEmail),
        last_route: "platform_non_user",
      },
    });
    return NextResponse.json({ success: true, route: "platform_non_user" });
  }

  const projects = await loadUserProjects(user.id);
  if (projects.length === 0) {
    await sendPlatformThreadReply({
      db,
      thread,
      toEmail: user.email,
      subject: `Re: ${inbound.subject || "your email"}`,
      bodyHtml: `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
        I found your Artha account, but I can't find a company yet.
      </p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
        Create your first company in the dashboard, then email me again and I'll execute tasks from here.
      </p>
      <p style="margin:0;">
        <a href="${APP_URL}/dashboard" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">
          Open Dashboard
        </a>
      </p>`,
      inReplyTo: inbound.messageId || null,
      status: "customer_no_project",
      metadataPatch: {
        last_route: "platform_user_no_project",
      },
    });
    return NextResponse.json({ success: true, route: "platform_user_no_project" });
  }

  const { project: resolvedProject, invalidSlugHint } = resolveProjectMatch(projects, {
    slugHint,
    subject: inbound.subject,
    replyText,
    thread,
    threadSource,
  });

  if (!resolvedProject) {
    const clarificationReason = invalidSlugHint
      ? `I couldn't find a project with slug "${slugHint}".`
      : projects.length > 1
        ? "I can do that, but you have multiple projects."
        : "I couldn't identify which project you meant.";

    const threadToUpdate = await updatePlatformEmailThread(db, thread, {
      status: "awaiting_project",
      awaitingProjectClarification: true,
      pendingSubject: thread.awaiting_project_clarification && thread.pending_subject
        ? thread.pending_subject
        : inbound.subject,
      pendingBodyText: thread.awaiting_project_clarification && thread.pending_body_text
        ? thread.pending_body_text
        : replyText,
      pendingBodyHtml: thread.awaiting_project_clarification && thread.pending_body_html
        ? thread.pending_body_html
        : inbound.htmlBody,
      metadataPatch: {
        last_route: "platform_project_clarification",
      },
    });

    await sendPlatformThreadReply({
      db,
      thread: threadToUpdate,
      toEmail: user.email,
      subject: `Re: ${inbound.subject || "your email"}`,
      bodyHtml: buildProjectClarificationHtml(projects, clarificationReason),
      inReplyTo: inbound.messageId || null,
      status: "awaiting_project",
      awaitingProjectClarification: true,
      pendingSubject: threadToUpdate.pending_subject,
      pendingBodyText: threadToUpdate.pending_body_text,
      pendingBodyHtml: threadToUpdate.pending_body_html,
      metadataPatch: {
        last_route: "platform_project_clarification",
      },
    });

    return NextResponse.json({ success: true, route: "platform_project_clarification" });
  }

  const project = await loadProjectForUser(user.id, resolvedProject.id);
  if (!project) {
    await sendPlatformThreadReply({
      db,
      thread,
      toEmail: user.email,
      subject: `Re: ${inbound.subject || "your email"}`,
      bodyHtml: `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
        I found the project <strong>${resolvedProject.name}</strong>, but its workspace is not fully ready yet.
      </p>
      <p style="margin:0;font-size:14px;color:#6b7280;">
        Finish onboarding in the dashboard, then email me again.
      </p>`,
      inReplyTo: inbound.messageId || null,
      replyTo: getAgentReplyTo(resolvedProject.slug),
      status: "project_not_ready",
      projectId: resolvedProject.id,
      metadataPatch: {
        last_route: "platform_project_not_ready",
      },
    });
    return NextResponse.json({ success: true, route: "platform_project_not_ready" });
  }

  const effectiveSubject = thread.awaiting_project_clarification && thread.pending_subject
    ? thread.pending_subject
    : inbound.subject;
  const effectiveBodyText = thread.awaiting_project_clarification && thread.pending_body_text
    ? combineClarification(thread.pending_body_text, replyText)
    : replyText;
  const effectiveBodyHtml = thread.awaiting_project_clarification && thread.pending_body_html
    ? thread.pending_body_html
    : inbound.htmlBody;

  const inboundRows = await db`
    INSERT INTO email_inbound (project_id, from_email, subject, body_text, body_html, message_id)
    VALUES (${project.id}, ${user.email}, ${effectiveSubject}, ${effectiveBodyText}, ${effectiveBodyHtml}, ${inbound.messageId || null})
    RETURNING id
  `;

  // Write to threaded email model
  const platformCompanyEmail = `${project.slug}@${COMPANY_DOMAIN}`;
  try {
    const { threadId } = await resolveOrCreateThread(project.id as string, {
      subject: effectiveSubject || "(no subject)",
      fromEmail: user.email,
      toEmail: platformCompanyEmail,
      messageId: inbound.messageId,
      inReplyTo: inbound.inReplyTo,
    });
    await addMessageToThread(project.id as string, {
      threadId,
      direction: "inbound",
      fromEmail: user.email,
      toEmail: platformCompanyEmail,
      subject: effectiveSubject,
      bodyText: effectiveBodyText,
      bodyHtml: effectiveBodyHtml,
      messageId: inbound.messageId || null,
      inReplyTo: inbound.inReplyTo || null,
    });
  } catch (e) {
    console.error("Failed to write email thread from platform inbound (non-fatal):", e);
  }

  ingestInboundEmail({
    projectId: project.id as string,
    userId: user.id,
    emailId: inboundRows[0].id as string,
    from: user.email,
    subject: effectiveSubject,
    body: effectiveBodyText,
  }).catch(() => {});

  captureFounderSignals({
    userId: user.id,
    projectId: project.id as string,
    text: effectiveBodyText,
  }).catch(() => {});

  const routedThread = await updatePlatformEmailThread(db, thread, {
    projectId: project.id as string,
    status: "customer",
    awaitingProjectClarification: false,
    pendingSubject: null,
    pendingBodyText: null,
    pendingBodyHtml: null,
    metadataPatch: {
      last_route: "platform_project_routed",
      last_project_slug: project.slug,
    },
  });

  await runFounderInstruction({
    db,
    projectId: project.id as string,
    project,
    user,
    replyText: effectiveBodyText,
    subject: effectiveSubject,
    messageId: inbound.messageId,
    inboundId: inboundRows[0].id as string,
    agentReplyTo: getAgentReplyTo(project.slug),
    platformReplyThread: {
      db,
      thread: routedThread,
    },
  });

  return NextResponse.json({ success: true, route: "platform_project_routed", projectSlug: project.slug });
}

export async function POST(request: NextRequest) {
  try {
    if (!hasValidInboundSecret(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json() as Record<string, unknown>;
    const inbound = parseInboundEmail(body);
    const target = await parseTargetAddressWithCustomDomain(inbound.toAddress);

    if (!target) {
      return NextResponse.json({ error: "Unknown recipient" }, { status: 200 });
    }

    if (target.kind === "company") {
      return handleCompanyInbound(inbound, target.slug);
    }

    return handlePlatformInbound(inbound, target.slugHint);
  } catch (error) {
    console.error("Inbound email error:", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
