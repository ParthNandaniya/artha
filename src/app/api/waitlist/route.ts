import { NextResponse } from "next/server";
import { getDb, type DbClient } from "@/lib/neon";
import { WaitlistSchema, parseBody } from "@/lib/validation";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = parseBody(WaitlistSchema, body);
  if (!parsed.success) return parsed.response;
  const email = parsed.data.email.trim();
  const emailNormalized = email.toLowerCase();
  const source = parsed.data.source;

  const metadata = {
    referer: request.headers.get("referer"),
    userAgent: request.headers.get("user-agent"),
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
  };

  try {
    const db = getDb();
    await ensureWaitlistTable(db);

    const rows = await db`
      INSERT INTO waitlist_signups (email, email_normalized, source, metadata)
      VALUES (${email}, ${emailNormalized}, ${source}, ${JSON.stringify(metadata)}::jsonb)
      ON CONFLICT (email_normalized)
      DO UPDATE SET
        email = EXCLUDED.email,
        source = EXCLUDED.source,
        metadata = COALESCE(waitlist_signups.metadata, '{}'::jsonb) || EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING created_at = updated_at AS is_new
    `;

    const isNew = Boolean(rows[0]?.is_new);

    return NextResponse.json({
      ok: true,
      alreadyJoined: !isNew,
      message: isNew
        ? "You're on the waitlist. We'll email you as soon as Artha is ready."
        : "You're already on the waitlist. We'll email you when Artha opens.",
    });
  } catch (error) {
    console.error("Waitlist signup failed:", error);
    return NextResponse.json(
      { error: "Could not save your waitlist signup right now. Please try again." },
      { status: 500 }
    );
  }
}

async function ensureWaitlistTable(db: DbClient) {
  await db`
    CREATE TABLE IF NOT EXISTS waitlist_signups (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name TEXT,
      email TEXT NOT NULL,
      email_normalized TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL DEFAULT 'landing_page',
      status TEXT NOT NULL DEFAULT 'pending',
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `;

  await db`
    ALTER TABLE waitlist_signups
      ADD COLUMN IF NOT EXISTS name TEXT,
      ADD COLUMN IF NOT EXISTS email TEXT,
      ADD COLUMN IF NOT EXISTS email_normalized TEXT,
      ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'landing_page',
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
  `;

  await db`
    ALTER TABLE waitlist_signups
      ALTER COLUMN name DROP NOT NULL
  `;

  await db`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_signups_email_normalized
      ON waitlist_signups(email_normalized)
  `;

  await db`
    CREATE INDEX IF NOT EXISTS idx_waitlist_signups_status
      ON waitlist_signups(status, created_at DESC)
  `;
}
