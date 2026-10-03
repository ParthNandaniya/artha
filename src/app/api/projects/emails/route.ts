import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { sendCompanyOutboundEmail } from "@/lib/postmark";
import { resolveOrCreateThread, addMessageToThread, backfillEmailThreads } from "@/lib/email-threads";
import { getProjectCredits, decrementProjectCredits } from "@/lib/project-credits";
import { OUTBOUND_EMAIL_COST } from "@/config/credit-costs";

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");

  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();
  const rows = await db`
    SELECT id, slug, company_email
    FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
  `;

  if (rows.length === 0) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const project = rows[0] as { id: string; slug: string; company_email: string | null };

  try {
    // Run backfill on first access (idempotent — skips if threads already exist)
    const companyEmail = project.company_email || `${project.slug}@${process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com"}`;
    await backfillEmailThreads(projectId, companyEmail);

    const threads = await db`
      SELECT id, subject, participants, last_message_at, message_count, is_read, snippet, created_at
      FROM email_threads
      WHERE project_id = ${projectId}
      ORDER BY last_message_at DESC
      LIMIT 100
    `;

    const statsRows = await db`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_read = FALSE) as unread
      FROM email_threads
      WHERE project_id = ${projectId}
    `;

    return NextResponse.json({
      threads,
      stats: {
        total: Number(statsRows[0].total),
        unread: Number(statsRows[0].unread),
      },
    });
  } catch (error) {
    console.error("Failed to fetch email threads", error);
    return NextResponse.json({ error: "Failed to fetch emails" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId, to, subject, htmlBody, inReplyTo, threadId: existingThreadId } = body as {
    projectId: string;
    to: string;
    subject: string;
    htmlBody: string;
    inReplyTo?: string;
    threadId?: string;
  };

  if (!projectId || !to || !subject || !htmlBody) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db = getDb();
  const rows = await db`
    SELECT id, name, slug, company_email, task_credits
    FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
  `;

  if (rows.length === 0) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const project = rows[0] as {
    id: string;
    name: string;
    slug: string;
    company_email: string | null;
    task_credits: unknown;
  };

  if (!project.company_email) {
    return NextResponse.json({ error: "Email is not configured for this project" }, { status: 400 });
  }

  const creditsAvailable = getProjectCredits(project as Record<string, unknown>);
  if (creditsAvailable < OUTBOUND_EMAIL_COST) {
    return NextResponse.json({
      error: "Insufficient credits to send email",
      message: `Sending an email costs ${OUTBOUND_EMAIL_COST} credits. You have ${creditsAvailable} credits remaining.`,
      purchaseUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://artha.run"}/dashboard?buy_credits=true`,
    }, { status: 402 });
  }

  try {
    const result = await sendCompanyOutboundEmail({
      slug: project.slug,
      companyName: project.name,
      toEmail: to,
      subject,
      bodyHtml: htmlBody,
      inReplyTo,
    });

    const postmarkMessageId = result?.MessageID || null;

    // Write to thread model
    let threadId = existingThreadId;
    if (!threadId) {
      const resolved = await resolveOrCreateThread(projectId, {
        subject,
        fromEmail: project.company_email,
        toEmail: to,
        messageId: postmarkMessageId,
        inReplyTo,
      });
      threadId = resolved.threadId;
    }

    await addMessageToThread(projectId, {
      threadId,
      direction: "outbound",
      fromEmail: project.company_email,
      toEmail: to,
      subject,
      bodyText: htmlBody.replace(/<[^>]+>/g, ""),
      bodyHtml: htmlBody,
      messageId: postmarkMessageId,
      inReplyTo: inReplyTo || null,
    });

    // Charge credit for sending this email
    await decrementProjectCredits(db, projectId, OUTBOUND_EMAIL_COST);

    // Backward compat: still insert task record
    await db`
      INSERT INTO tasks (type, title, description, status, result, summary, completed_at, project_id)
      VALUES (
        'outreach',
        ${`Sent email to ${to}`},
        ${`Subject: ${subject}`},
        'completed',
        ${htmlBody},
        ${`Sent immediately via direct compose.`},
        NOW(),
        ${projectId}
      )
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to send email", error);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
