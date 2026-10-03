import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/neon";

// Simple in-memory rate limiter: IP → { count, resetAt }
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
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

export async function OPTIONS(
  request: NextRequest,
) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  // Rate limiting
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many submissions. Please wait a minute." },
      { status: 429, headers }
    );
  }

  // Look up project by slug
  const db = getDb();
  const rows = await db`
    SELECT id FROM projects
    WHERE slug = ${slug}
    LIMIT 1
  `;
  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  }

  const projectId = rows[0].id as string;

  // Parse body — support both JSON and form-encoded
  let formData: Record<string, string> = {};
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.json() as Record<string, unknown>;
    for (const [k, v] of Object.entries(body)) {
      if (typeof v === "string") formData[k] = v;
    }
  } else {
    const text = await request.text();
    const params = new URLSearchParams(text);
    for (const [k, v] of params.entries()) formData[k] = v;
  }

  const formSlug = formData.formSlug ?? formData.form_slug ?? "default";
  const email = formData.email?.trim().toLowerCase();
  const name = formData.name?.trim() || formData.firstName?.trim() || null;
  const phone = formData.phone?.trim() || null;

  // Strip internal fields from stored data
  const { formSlug: _fs, form_slug: _fls, ...publicData } = formData;
  void _fs; void _fls;

  // Upsert contact (deduplicate by email within project)
  let contactId: string | null = null;
  if (email) {
    const contactRows = await db`
      INSERT INTO contacts (project_id, email, name, phone, source, form_slug, page_slug)
      VALUES (${projectId}, ${email}, ${name}, ${phone}, 'form', ${formSlug}, ${publicData.page ?? null})
      ON CONFLICT (project_id, email) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, contacts.name),
        phone = COALESCE(EXCLUDED.phone, contacts.phone),
        updated_at = NOW()
      RETURNING id
    `;
    contactId = (contactRows[0] as { id: string } | undefined)?.id ?? null;
  }

  // Insert submission
  await db`
    INSERT INTO form_submissions (project_id, form_slug, contact_id, data, ip, user_agent)
    VALUES (
      ${projectId},
      ${formSlug},
      ${contactId},
      ${JSON.stringify(publicData)}::jsonb,
      ${ip},
      ${request.headers.get("user-agent")}
    )
  `;

  // Send email notification to project owner (non-blocking)
  try {
    const projectRows = await db`
      SELECT p.name, p.slug, u.email as owner_email
      FROM projects p
      JOIN users u ON u.id = p.user_id
      WHERE p.id = ${projectId}
      LIMIT 1
    `;
    const project = projectRows[0] as { name: string; slug: string; owner_email: string } | undefined;
    if (project?.owner_email && email) {
      const { sendFormNotificationEmail } = await import("@/lib/postmark");
      sendFormNotificationEmail({
        to: project.owner_email,
        projectName: project.name || project.slug,
        formSlug,
        submitterEmail: email,
        submitterName: name || undefined,
        data: publicData,
      }).catch((err: unknown) => console.error("[form] Email notification failed:", err));
    }
  } catch {
    // Non-blocking — form submission is already saved
  }

  // Check if form has a redirect_url
  const formRows = await db`
    SELECT redirect_url FROM forms WHERE project_id = ${projectId} AND slug = ${formSlug} LIMIT 1
  `;
  const redirectUrl = (formRows[0] as { redirect_url: string | null } | undefined)?.redirect_url;

  if (redirectUrl) {
    return NextResponse.redirect(redirectUrl, { headers });
  }

  return NextResponse.json({ ok: true }, { headers });
}
