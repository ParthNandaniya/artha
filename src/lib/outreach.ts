import { getDb } from "./neon";
import { sendCompanyColdEmail, getCompanyFrom } from "./postmark";
import { resolveOrCreateThread, addMessageToThread } from "./email-threads";
import { getProjectCredits, decrementProjectCredits } from "./project-credits";
import { OUTBOUND_EMAIL_COST } from "@/config/credit-costs";
import { enrollLeadInDefaultSequence } from "./sequences";

interface OutreachEmail {
  to: string;
  toName?: string;
  subject: string;
  body: string;
}

interface ProcessOutreachOptions {
  projectId: string;
  slug: string;
  companyName: string;
  emails: OutreachEmail[];
}

interface ProcessOutreachResult {
  sent: number;
  failed: number;
  skipped: number;
  /** Emails not sent because credits ran out */
  creditLimited: number;
  /** Emails that weren't sent due to credit limits — includes to address for user messaging */
  unsent: string[];
}

/**
 * Send outreach emails and handle all post-send bookkeeping:
 * - Filter out emails without a valid `to` address
 * - Check credits: send as many as affordable, stop when credits run out
 * - Charge 0.1 credit per email sent
 * - Create email thread + message so it appears in the inbox tab
 * - Mark matching leads as contacted
 */
export async function processOutreachEmails(options: ProcessOutreachOptions): Promise<ProcessOutreachResult> {
  const { projectId, slug, companyName, emails } = options;
  const db = getDb();

  // Look up custom email domain
  let customEmailDomain: string | null = null;
  try {
    const domainRows = await db`
      SELECT custom_email_domain FROM projects
      WHERE id = ${projectId} AND email_domain_verified = TRUE
      LIMIT 1
    `;
    if (domainRows.length > 0 && domainRows[0].custom_email_domain) {
      customEmailDomain = domainRows[0].custom_email_domain as string;
    }
  } catch { /* ignore */ }

  const emailDomain = customEmailDomain || "tryartha.com";
  const companyEmail = `${slug}@${emailDomain}`;
  const companyFrom = getCompanyFrom(slug, companyName, customEmailDomain);

  // Filter out emails without a valid to address
  const validEmails = emails.filter((e) => e.to && e.to.includes("@"));
  const skipped = emails.length - validEmails.length;

  // Check available credits
  const projectRows = await db`SELECT task_credits FROM projects WHERE id = ${projectId}`;
  const creditsAvailable = projectRows.length > 0 ? getProjectCredits(projectRows[0] as Record<string, unknown>) : 0;
  const maxAffordable = Math.floor(creditsAvailable / OUTBOUND_EMAIL_COST);

  const emailsToSend = validEmails.slice(0, maxAffordable);
  const creditLimitedEmails = validEmails.slice(maxAffordable);

  let sent = 0;
  let failed = 0;

  for (const email of emailsToSend) {
    try {
      const bodyHtml = `<p style="font-size:15px;line-height:1.6;color:#374151;">${email.body.replace(/\n/g, "<br>")}</p>`;

      const response = await sendCompanyColdEmail({
        slug,
        companyName,
        toEmail: email.to,
        toName: email.toName || null,
        subject: email.subject,
        bodyHtml,
      });

      // Charge credit for this email
      await decrementProjectCredits(db, projectId, OUTBOUND_EMAIL_COST);

      const postmarkMessageId = response?.MessageID || null;

      // Create email thread + message so it shows in the inbox tab
      try {
        const { threadId } = await resolveOrCreateThread(projectId, {
          subject: email.subject,
          fromEmail: companyEmail,
          toEmail: email.to,
          messageId: postmarkMessageId,
        });

        await addMessageToThread(projectId, {
          threadId,
          direction: "outbound",
          fromEmail: companyFrom,
          toEmail: email.to,
          subject: email.subject,
          bodyText: email.body,
          bodyHtml,
          messageId: postmarkMessageId,
          inReplyTo: null,
        });
      } catch (threadErr) {
        // Thread creation failure shouldn't fail the whole send
        console.error("Failed to create email thread for outreach:", threadErr);
      }

      // Mark matching lead as contacted + auto-enroll in follow-up sequence
      try {
        const updatedLeads = await db`
          UPDATE leads
          SET contacted = TRUE,
              contacted_at = NOW(),
              status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END,
              updated_at = NOW()
          WHERE project_id = ${projectId}
            AND LOWER(email) = ${email.to.toLowerCase()}
            AND contacted = FALSE
          RETURNING id
        `;
        // Enroll contacted leads in follow-up sequence
        for (const lead of updatedLeads) {
          try {
            await enrollLeadInDefaultSequence(projectId, lead.id as string);
          } catch {
            // Non-fatal — don't block outreach for sequence enrollment
          }
        }
      } catch (leadErr) {
        console.error("Failed to mark lead as contacted:", leadErr);
      }

      sent++;
    } catch {
      failed++;
    }
  }

  return {
    sent,
    failed,
    skipped,
    creditLimited: creditLimitedEmails.length,
    unsent: creditLimitedEmails.map((e) => e.to),
  };
}
