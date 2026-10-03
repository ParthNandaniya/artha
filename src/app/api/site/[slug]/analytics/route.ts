import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";
import { captureServerEvent } from "@/lib/posthog";

// In-memory rate limiter: IP → { count, resetAt }
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

const VALID_EVENTS = new Set(["pageview", "pageview_end", "click", "custom"]);
const MAX_BATCH_SIZE = 20;

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

interface TrackingEvent {
  e: string;
  p?: string;
  v?: string;
  s?: string;
  r?: string;
  sw?: number;
  ts?: number;
  m?: Record<string, unknown>;
}

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

  const db = getDb();
  const rows = await db`
    SELECT id FROM projects WHERE slug = ${slug} LIMIT 1
  `;
  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  }
  const projectId = rows[0].id as string;
  const userAgent = request.headers.get("user-agent") ?? null;

  // Parse body — sendBeacon sends as text/plain, fetch sends as application/json
  let body: Record<string, unknown>;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = (await request.json()) as Record<string, unknown>;
  } else {
    const text = await request.text();
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON" },
        { status: 400, headers }
      );
    }
  }

  const events = Array.isArray(body.events)
    ? (body.events as TrackingEvent[]).slice(0, MAX_BATCH_SIZE)
    : [];

  if (events.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 }, { headers });
  }

  const validEvents = events.filter((ev) => ev.e && VALID_EVENTS.has(ev.e));

  const insertPromises = validEvents.map((ev) => {
    const metadata = ev.m && typeof ev.m === "object" ? ev.m : {};
    const durationMs =
      ev.e === "pageview_end" && typeof metadata.engaged_ms === "number"
        ? metadata.engaged_ms
        : null;

    return db`
      INSERT INTO site_analytics (
        project_id, event, path, visitor_id, session_id,
        referrer, user_agent, screen_width, duration_ms,
        metadata, created_at
      ) VALUES (
        ${projectId},
        ${ev.e},
        ${typeof ev.p === "string" ? ev.p.substring(0, 500) : "/"},
        ${typeof ev.v === "string" ? ev.v.substring(0, 64) : null},
        ${typeof ev.s === "string" ? ev.s.substring(0, 64) : null},
        ${typeof ev.r === "string" ? ev.r.substring(0, 2000) : null},
        ${typeof userAgent === "string" ? userAgent.substring(0, 500) : null},
        ${typeof ev.sw === "number" ? ev.sw : null},
        ${durationMs},
        ${JSON.stringify(metadata)}::jsonb,
        ${ev.ts ? new Date(ev.ts).toISOString() : new Date().toISOString()}
      )
    `;
  });

  await Promise.all(insertPromises);

  // Relay events to PostHog for unified dashboard (fire-and-forget)
  for (const ev of validEvents) {
    const visitorId = typeof ev.v === "string" ? ev.v : "anonymous";
    const metadata = ev.m && typeof ev.m === "object" ? ev.m : {};
    captureServerEvent(visitorId, `site_${ev.e}`, {
      slug,
      path: typeof ev.p === "string" ? ev.p : "/",
      referrer: typeof ev.r === "string" ? ev.r : null,
      screen_width: typeof ev.sw === "number" ? ev.sw : null,
      session_id: typeof ev.s === "string" ? ev.s : null,
      user_agent: userAgent,
      $current_url: `https://${slug}.tryartha.com${typeof ev.p === "string" ? ev.p : "/"}`,
      ...metadata,
    });
  }

  return NextResponse.json(
    { ok: true, inserted: validEvents.length },
    { headers }
  );
}
