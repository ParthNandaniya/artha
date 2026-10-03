import { getDb } from "./neon";
import type { EmailMessage } from "./types";

/**
 * Ensure email_threads + email_messages tables exist in the platform DB.
 * Safe to call repeatedly (uses IF NOT EXISTS).
 */
export async function ensureEmailThreadSchema(): Promise<void> {
  const db = getDb();
  await db`
    CREATE TABLE IF NOT EXISTS email_threads (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id UUID NOT NULL,
      subject TEXT NOT NULL,
      participants TEXT[] DEFAULT '{}',
      last_message_at TIMESTAMPTZ DEFAULT NOW(),
      message_count INTEGER DEFAULT 0,
      is_read BOOLEAN DEFAULT FALSE,
      snippet TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS email_messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id UUID NOT NULL,
      thread_id UUID REFERENCES email_threads(id) ON DELETE CASCADE,
      direction TEXT NOT NULL,
      from_email TEXT NOT NULL,
      to_email TEXT NOT NULL,
      subject TEXT,
      body_text TEXT,
      body_html TEXT,
      message_id TEXT,
      in_reply_to TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Add project_id for tables created before this column existed
  await db`ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS project_id UUID`;
  await db`CREATE INDEX IF NOT EXISTS idx_email_messages_thread ON email_messages(thread_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_email_threads_last_msg ON email_threads(last_message_at DESC)`;
}

/** Strip Re:/Fwd:/etc prefixes and normalize whitespace */
function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(re|fwd|fw)\s*:\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Truncate text for snippet preview */
function makeSnippet(text: string | null | undefined, maxLen = 120): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > maxLen ? clean.slice(0, maxLen) + "..." : clean;
}

/** Ensure participant array contains an email (case-insensitive) */
function addParticipant(existing: string[], email: string): string[] {
  const normalized = email.toLowerCase();
  if (existing.some((e) => e.toLowerCase() === normalized)) return existing;
  return [...existing, email];
}

interface ResolveThreadInput {
  subject: string;
  fromEmail: string;
  toEmail: string;
  messageId?: string | null;
  inReplyTo?: string | null;
}

/**
 * Find an existing thread or create a new one.
 * Matching strategy:
 * 1. If inReplyTo is set, find thread containing that message_id
 * 2. Else, find recent thread (7 days) with matching normalized subject + overlapping participant
 * 3. Else, create new thread
 */
export async function resolveOrCreateThread(
  projectId: string,
  input: ResolveThreadInput
): Promise<{ threadId: string; isNew: boolean }> {
  const db = getDb();

  // Ensure tables exist for existing projects
  await ensureEmailThreadSchema();

  const { subject, fromEmail, toEmail, inReplyTo } = input;

  // Strategy 1: Match by in_reply_to header
  if (inReplyTo) {
    const rows = await db`
      SELECT t.id FROM email_threads t
      JOIN email_messages m ON m.thread_id = t.id
      WHERE t.project_id = ${projectId} AND m.message_id = ${inReplyTo}
      LIMIT 1
    `;
    if (rows.length > 0) {
      return { threadId: rows[0].id as string, isNew: false };
    }
  }

  // Strategy 2: Match by normalized subject + participant overlap (within 7 days)
  const normalized = normalizeSubject(subject);
  if (normalized) {
    const rows = await db`
      SELECT id, subject, participants FROM email_threads
      WHERE project_id = ${projectId} AND last_message_at > NOW() - INTERVAL '7 days'
      ORDER BY last_message_at DESC
      LIMIT 50
    `;
    for (const row of rows) {
      const threadNormalized = normalizeSubject(row.subject as string);
      if (threadNormalized.toLowerCase() !== normalized.toLowerCase()) continue;
      const participants = (row.participants as string[]) || [];
      const participantsLower = participants.map((p) => p.toLowerCase());
      if (
        participantsLower.includes(fromEmail.toLowerCase()) ||
        participantsLower.includes(toEmail.toLowerCase())
      ) {
        return { threadId: row.id as string, isNew: false };
      }
    }
  }

  // Strategy 3: Create new thread
  const newThread = await db`
    INSERT INTO email_threads (project_id, subject, participants, last_message_at, message_count, is_read, snippet)
    VALUES (${projectId}, ${subject}, ${[fromEmail, toEmail]}, NOW(), 0, FALSE, '')
    RETURNING id
  `;
  return { threadId: newThread[0].id as string, isNew: true };
}

interface AddMessageInput {
  threadId: string;
  direction: "inbound" | "outbound";
  fromEmail: string;
  toEmail: string;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  messageId: string | null;
  inReplyTo: string | null;
}

/**
 * Insert a message into email_messages and update the parent thread.
 */
export async function addMessageToThread(
  projectId: string,
  input: AddMessageInput
): Promise<EmailMessage> {
  const db = getDb();
  const {
    threadId,
    direction,
    fromEmail,
    toEmail,
    subject,
    bodyText,
    bodyHtml,
    messageId,
    inReplyTo,
  } = input;

  const rows = await db`
    INSERT INTO email_messages (project_id, thread_id, direction, from_email, to_email, subject, body_text, body_html, message_id, in_reply_to)
    VALUES (${projectId}, ${threadId}, ${direction}, ${fromEmail}, ${toEmail}, ${subject}, ${bodyText}, ${bodyHtml}, ${messageId}, ${inReplyTo})
    RETURNING *
  `;

  const message = rows[0] as EmailMessage;

  // Update thread metadata
  const thread = await db`SELECT participants FROM email_threads WHERE id = ${threadId} AND project_id = ${projectId}`;
  const existingParticipants = (thread[0]?.participants as string[]) || [];
  let updatedParticipants = addParticipant(existingParticipants, fromEmail);
  updatedParticipants = addParticipant(updatedParticipants, toEmail);

  const snippet = makeSnippet(bodyText || bodyHtml?.replace(/<[^>]+>/g, ""));

  await db`
    UPDATE email_threads SET
      last_message_at = ${message.created_at},
      message_count = message_count + 1,
      snippet = ${snippet},
      participants = ${updatedParticipants},
      is_read = ${direction === "outbound"}
    WHERE id = ${threadId} AND project_id = ${projectId}
  `;

  return message;
}

/**
 * Backfill existing email_inbound rows into the new thread model.
 * Groups by normalized subject + from_email. Safe to run multiple times (skips if threads exist).
 */
export async function backfillEmailThreads(projectId: string, companyEmail: string): Promise<number> {
  const db = getDb();

  // Ensure tables exist for existing projects that were created before this feature
  await ensureEmailThreadSchema();

  // Find inbound emails not yet synced to the threaded model.
  // Left-join email_messages to find rows in email_inbound with no matching message_id.
  const inbound = await db`
    SELECT ei.id, ei.from_email, ei.subject, ei.body_text, ei.body_html, ei.message_id, ei.received_at
    FROM email_inbound ei
    LEFT JOIN email_messages em
      ON em.project_id = ${projectId} AND em.message_id = ei.message_id AND ei.message_id IS NOT NULL
    WHERE ei.project_id = ${projectId} AND em.id IS NULL
    ORDER BY ei.received_at ASC
  `;

  if (inbound.length === 0) return 0;

  let count = 0;

  for (const row of inbound) {
    const subject = (row.subject as string) || "(no subject)";
    const fromEmail = row.from_email as string;

    const { threadId } = await resolveOrCreateThread(projectId, {
      subject,
      fromEmail,
      toEmail: companyEmail,
      messageId: row.message_id as string | null,
    });

    await addMessageToThread(projectId, {
      threadId,
      direction: "inbound",
      fromEmail,
      toEmail: companyEmail,
      subject,
      bodyText: row.body_text as string | null,
      bodyHtml: row.body_html as string | null,
      messageId: row.message_id as string | null,
      inReplyTo: null,
    });
    count++;
  }

  return count;
}
