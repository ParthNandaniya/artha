import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";

// ── Rate Limiting ────────────────────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  return false;
}

function corsHeaders(origin: string | null) {
  const allowed =
    !origin ||
    origin.endsWith(".tryartha.com") ||
    origin === "https://tryartha.com" ||
    process.env.NODE_ENV === "development";

  return {
    "Access-Control-Allow-Origin": allowed ? (origin ?? "*") : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

// ── Types ────────────────────────────────────────────────────────────

interface ReplayPayload {
  vid: string;
  sid: string;
  start: number;
  dur: number;
  page: string;
  device: string;
  events: unknown[];
}

const MAX_EVENTS = 5000;
const MAX_PAYLOAD_SIZE = 512_000; // 512KB per batch

// ── POST Handler ─────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers }
    );
  }

  // Check content length before parsing
  const contentLength = parseInt(
    request.headers.get("content-length") ?? "0",
    10
  );
  if (contentLength > MAX_PAYLOAD_SIZE) {
    return NextResponse.json(
      { error: "Payload too large" },
      { status: 413, headers }
    );
  }

  const db = getDb();

  // Look up project
  const rows = await db`
    SELECT id FROM projects WHERE slug = ${slug} LIMIT 1
  `;
  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  }
  const projectId = rows[0].id as string;

  // Parse body (sendBeacon sends as text/plain)
  let body: ReplayPayload;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = (await request.json()) as ReplayPayload;
  } else {
    const text = await request.text();
    try {
      body = JSON.parse(text) as ReplayPayload;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON" },
        { status: 400, headers }
      );
    }
  }

  // Validate required fields
  if (!body.vid || !body.sid || !body.start || !Array.isArray(body.events)) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400, headers }
    );
  }

  const events = body.events.slice(0, MAX_EVENTS);
  const visitorId = String(body.vid).substring(0, 64);
  const sessionId = String(body.sid).substring(0, 64);
  const durationMs = typeof body.dur === "number" ? Math.min(body.dur, 300_000) : null;
  const page = typeof body.page === "string" ? body.page.substring(0, 500) : "/";
  const device = typeof body.device === "string" ? body.device.substring(0, 20) : null;
  const startedAt = new Date(body.start).toISOString();

  // For MVP, store replay data as JSON in storage_key field (will move to R2 later)
  const replayData = JSON.stringify({ events });

  // Upsert: append events to existing session or create new
  const existing = await db`
    SELECT id, storage_key, events_count FROM session_replays
    WHERE project_id = ${projectId}
      AND session_id = ${sessionId}
      AND visitor_id = ${visitorId}
    LIMIT 1
  `;

  if (existing.length > 0) {
    // Append events to existing replay
    const existingId = existing[0].id as string;
    const existingData = JSON.parse(existing[0].storage_key as string);
    const mergedEvents = [...(existingData.events || []), ...events].slice(-MAX_EVENTS);
    const mergedData = JSON.stringify({ events: mergedEvents });
    const existingPages: string[] = [];
    try {
      const pagesRow = await db`
        SELECT pages FROM session_replays WHERE id = ${existingId}
      `;
      if (pagesRow[0]?.pages) {
        existingPages.push(...(pagesRow[0].pages as string[]));
      }
    } catch {
      // pages column might be null
    }
    const allPages = [...new Set([...existingPages, page])];

    await db`
      UPDATE session_replays
      SET storage_key = ${mergedData},
          duration_ms = ${durationMs},
          events_count = ${mergedEvents.length},
          pages = ${allPages}
      WHERE id = ${existingId}
    `;
  } else {
    // Create new replay record
    await db`
      INSERT INTO session_replays (
        project_id, visitor_id, session_id, storage_key,
        duration_ms, pages, events_count, device, started_at
      ) VALUES (
        ${projectId}, ${visitorId}, ${sessionId}, ${replayData},
        ${durationMs}, ${[page]}, ${events.length}, ${device}, ${startedAt}
      )
    `;
  }

  return NextResponse.json({ ok: true }, { headers });
}
