import { getDb, type DbClient } from "./neon";

export type PlatformEmailThread = {
  id: string;
  sender_email: string;
  sender_email_normalized: string;
  user_id: string | null;
  project_id: string | null;
  status: string;
  awaiting_project_clarification: boolean;
  pending_subject: string | null;
  pending_body_text: string | null;
  pending_body_html: string | null;
  last_message_id: string | null;
  last_outbound_message_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeMessageId(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^<|>$/g, "");
}

export async function ensurePlatformEmailSchema(db: DbClient) {
  await db`
    CREATE TABLE IF NOT EXISTS platform_email_threads (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      sender_email TEXT NOT NULL,
      sender_email_normalized TEXT NOT NULL,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'open',
      awaiting_project_clarification BOOLEAN DEFAULT FALSE,
      pending_subject TEXT,
      pending_body_text TEXT,
      pending_body_html TEXT,
      last_message_id TEXT,
      last_outbound_message_id TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `;

  await db`
    ALTER TABLE platform_email_threads
      ADD COLUMN IF NOT EXISTS sender_email TEXT,
      ADD COLUMN IF NOT EXISTS sender_email_normalized TEXT,
      ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open',
      ADD COLUMN IF NOT EXISTS awaiting_project_clarification BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS pending_subject TEXT,
      ADD COLUMN IF NOT EXISTS pending_body_text TEXT,
      ADD COLUMN IF NOT EXISTS pending_body_html TEXT,
      ADD COLUMN IF NOT EXISTS last_message_id TEXT,
      ADD COLUMN IF NOT EXISTS last_outbound_message_id TEXT,
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
  `;

  await db`
    CREATE INDEX IF NOT EXISTS idx_platform_email_threads_sender
      ON platform_email_threads(sender_email_normalized, updated_at DESC)
  `;

  await db`
    CREATE INDEX IF NOT EXISTS idx_platform_email_threads_user
      ON platform_email_threads(user_id, updated_at DESC)
  `;

  await db`
    CREATE TABLE IF NOT EXISTS platform_email_messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      thread_id UUID REFERENCES platform_email_threads(id) ON DELETE CASCADE,
      direction TEXT NOT NULL,
      from_email TEXT NOT NULL,
      to_email TEXT NOT NULL,
      subject TEXT,
      body_text TEXT,
      body_html TEXT,
      message_id TEXT,
      in_reply_to TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `;

  await db`
    ALTER TABLE platform_email_messages
      ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES platform_email_threads(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS direction TEXT,
      ADD COLUMN IF NOT EXISTS from_email TEXT,
      ADD COLUMN IF NOT EXISTS to_email TEXT,
      ADD COLUMN IF NOT EXISTS subject TEXT,
      ADD COLUMN IF NOT EXISTS body_text TEXT,
      ADD COLUMN IF NOT EXISTS body_html TEXT,
      ADD COLUMN IF NOT EXISTS message_id TEXT,
      ADD COLUMN IF NOT EXISTS in_reply_to TEXT,
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()
  `;

  await db`
    CREATE INDEX IF NOT EXISTS idx_platform_email_messages_thread
      ON platform_email_messages(thread_id, created_at DESC)
  `;

  await db`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_email_messages_message_id
      ON platform_email_messages(message_id)
  `;
}

export async function reconcilePlatformEmailThreadsForUser(userId: string, email: string) {
  const db = getDb();
  await ensurePlatformEmailSchema(db);

  const emailNormalized = normalizeEmailAddress(email);
  await db`
    UPDATE platform_email_threads
    SET user_id = ${userId},
        status = CASE
          WHEN status = 'external_lead' THEN 'customer'
          ELSE status
        END,
        updated_at = NOW()
    WHERE sender_email_normalized = ${emailNormalized}
      AND user_id IS NULL
  `;
}

export async function findPlatformThreadByReference(db: DbClient, references: string[]) {
  const messageIds = [...new Set(
    references
      .map((reference) => normalizeMessageId(reference))
      .filter((messageId): messageId is string => Boolean(messageId))
  )];

  if (messageIds.length === 0) return null;

  const rows = await db.query(
    `SELECT t.*
     FROM platform_email_messages m
     JOIN platform_email_threads t ON t.id = m.thread_id
     WHERE m.message_id = ANY($1::text[])
     ORDER BY m.created_at DESC
     LIMIT 1`,
    [messageIds]
  );

  return (rows[0] as PlatformEmailThread | undefined) || null;
}

export async function findLatestPlatformThreadForSender(db: DbClient, senderEmail: string) {
  const senderEmailNormalized = normalizeEmailAddress(senderEmail);
  const rows = await db`
    SELECT *
    FROM platform_email_threads
    WHERE sender_email_normalized = ${senderEmailNormalized}
    ORDER BY updated_at DESC
    LIMIT 1
  `;

  return (rows[0] as PlatformEmailThread | undefined) || null;
}

export async function createPlatformEmailThread(db: DbClient, options: {
  senderEmail: string;
  userId?: string | null;
  projectId?: string | null;
  status?: string;
  awaitingProjectClarification?: boolean;
  pendingSubject?: string | null;
  pendingBodyText?: string | null;
  pendingBodyHtml?: string | null;
  lastMessageId?: string | null;
  lastOutboundMessageId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const rows = await db`
    INSERT INTO platform_email_threads (
      sender_email,
      sender_email_normalized,
      user_id,
      project_id,
      status,
      awaiting_project_clarification,
      pending_subject,
      pending_body_text,
      pending_body_html,
      last_message_id,
      last_outbound_message_id,
      metadata
    )
    VALUES (
      ${options.senderEmail},
      ${normalizeEmailAddress(options.senderEmail)},
      ${options.userId || null},
      ${options.projectId || null},
      ${options.status || "open"},
      ${options.awaitingProjectClarification || false},
      ${options.pendingSubject || null},
      ${options.pendingBodyText || null},
      ${options.pendingBodyHtml || null},
      ${normalizeMessageId(options.lastMessageId) || null},
      ${normalizeMessageId(options.lastOutboundMessageId) || null},
      ${JSON.stringify(options.metadata || {})}::jsonb
    )
    RETURNING *
  `;

  return rows[0] as PlatformEmailThread;
}

export async function updatePlatformEmailThread(
  db: DbClient,
  thread: PlatformEmailThread,
  patch: {
    userId?: string | null;
    projectId?: string | null;
    status?: string;
    awaitingProjectClarification?: boolean;
    pendingSubject?: string | null;
    pendingBodyText?: string | null;
    pendingBodyHtml?: string | null;
    lastMessageId?: string | null;
    lastOutboundMessageId?: string | null;
    metadataPatch?: Record<string, unknown>;
  }
) {
  const mergedMetadata = patch.metadataPatch
    ? { ...(thread.metadata || {}), ...patch.metadataPatch }
    : (thread.metadata || {});

  const rows = await db`
    UPDATE platform_email_threads
    SET user_id = ${patch.userId === undefined ? thread.user_id : patch.userId},
        project_id = ${patch.projectId === undefined ? thread.project_id : patch.projectId},
        status = ${patch.status ?? thread.status},
        awaiting_project_clarification = ${patch.awaitingProjectClarification ?? thread.awaiting_project_clarification},
        pending_subject = ${patch.pendingSubject === undefined ? thread.pending_subject : patch.pendingSubject},
        pending_body_text = ${patch.pendingBodyText === undefined ? thread.pending_body_text : patch.pendingBodyText},
        pending_body_html = ${patch.pendingBodyHtml === undefined ? thread.pending_body_html : patch.pendingBodyHtml},
        last_message_id = ${patch.lastMessageId === undefined ? thread.last_message_id : normalizeMessageId(patch.lastMessageId) || null},
        last_outbound_message_id = ${patch.lastOutboundMessageId === undefined ? thread.last_outbound_message_id : normalizeMessageId(patch.lastOutboundMessageId) || null},
        metadata = ${JSON.stringify(mergedMetadata)}::jsonb,
        updated_at = NOW()
    WHERE id = ${thread.id}
    RETURNING *
  `;

  return rows[0] as PlatformEmailThread;
}

export async function insertPlatformEmailMessage(db: DbClient, options: {
  threadId: string;
  direction: "inbound" | "outbound";
  fromEmail: string;
  toEmail: string;
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  messageId?: string | null;
  inReplyTo?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const normalizedMessageId = normalizeMessageId(options.messageId);
  const rows = await db`
    INSERT INTO platform_email_messages (
      thread_id,
      direction,
      from_email,
      to_email,
      subject,
      body_text,
      body_html,
      message_id,
      in_reply_to,
      metadata
    )
    VALUES (
      ${options.threadId},
      ${options.direction},
      ${options.fromEmail},
      ${options.toEmail},
      ${options.subject || null},
      ${options.bodyText || null},
      ${options.bodyHtml || null},
      ${normalizedMessageId},
      ${normalizeMessageId(options.inReplyTo) || null},
      ${JSON.stringify(options.metadata || {})}::jsonb
    )
    ON CONFLICT (message_id)
    DO UPDATE SET
      thread_id = COALESCE(EXCLUDED.thread_id, platform_email_messages.thread_id),
      metadata = COALESCE(platform_email_messages.metadata, '{}'::jsonb) || EXCLUDED.metadata
    RETURNING id
  `;

  return rows[0]?.id as string | undefined;
}
