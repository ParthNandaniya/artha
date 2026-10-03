import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import {
  handlePreflight,
  createRateLimiter,
  getClientIp,
  getProjectBySlug,
  getWebsiteDb,
  requireSiteUser,
  isErrorResponse,
  jsonResponse,
} from "@/lib/site-api";
import { uploadToR2 } from "@/lib/r2";

const isRateLimited = createRateLimiter(10); // 10 req/min per IP
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
  "text/plain", "text/csv",
  "application/json",
  "audio/mpeg", "audio/wav", "audio/ogg",
  "video/mp4", "video/webm",
]);

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request);
}

// ── POST: Upload file ────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const origin = request.headers.get("origin");

  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return jsonResponse({ error: "Too many requests" }, 429, origin);
  }

  const project = await getProjectBySlug(slug);
  if (!project) return jsonResponse({ error: "Not found" }, 404, origin);

  const websiteDb = await getWebsiteDb(slug);
  if (!websiteDb) return jsonResponse({ error: "Database not available" }, 403, origin);

  const userOrError = await requireSiteUser(request, websiteDb, origin);
  if (isErrorResponse(userOrError)) return userOrError;

  let body: { data?: string; filename?: string; contentType?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const { data, filename, contentType } = body;

  if (!data || typeof data !== "string") {
    return jsonResponse({ error: "data (base64) is required" }, 400, origin);
  }

  // Strip data URI prefix if present
  let base64 = data;
  let detectedContentType = contentType || "application/octet-stream";
  const dataUriMatch = data.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUriMatch) {
    detectedContentType = dataUriMatch[1];
    base64 = dataUriMatch[2];
  }

  // Validate content type
  if (!ALLOWED_TYPES.has(detectedContentType)) {
    return jsonResponse({ error: `Content type not allowed: ${detectedContentType}` }, 400, origin);
  }

  // Decode and check size
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > MAX_FILE_SIZE) {
    return jsonResponse({ error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` }, 413, origin);
  }

  const id = randomUUID();
  const safeName = (filename || "file").slice(0, 255);
  const ext = safeName.includes(".") ? safeName.split(".").pop() : "";
  const r2Key = `${slug}/${userOrError.id}/${id}${ext ? "." + ext : ""}`;

  // Upload to R2
  await uploadToR2({ key: r2Key, body: buffer, contentType: detectedContentType });

  // Store metadata in company DB (not the file data itself)
  await websiteDb`
    CREATE TABLE IF NOT EXISTS site_files (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_user_id UUID NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      r2_key TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await websiteDb`
    INSERT INTO site_files (id, site_user_id, filename, content_type, size_bytes, r2_key)
    VALUES (${id}, ${userOrError.id}, ${safeName}, ${detectedContentType}, ${buffer.length}, ${r2Key})
  `;

  return jsonResponse(
    {
      id,
      filename: safeName,
      contentType: detectedContentType,
      sizeBytes: buffer.length,
      url: `/api/site/${slug}/files/${id}`,
    },
    201,
    origin
  );
}

// ── GET: List user's files ────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const origin = request.headers.get("origin");

  const project = await getProjectBySlug(slug);
  if (!project) return jsonResponse({ error: "Not found" }, 404, origin);

  const websiteDb = await getWebsiteDb(slug);
  if (!websiteDb) return jsonResponse({ error: "Database not available" }, 403, origin);

  const userOrError = await requireSiteUser(request, websiteDb, origin);
  if (isErrorResponse(userOrError)) return userOrError;

  // Check if table exists
  const tableExists = await websiteDb`
    SELECT 1 FROM information_schema.tables WHERE table_name = 'site_files' LIMIT 1
  `;
  if (tableExists.length === 0) {
    return jsonResponse({ files: [] }, 200, origin);
  }

  const files = await websiteDb`
    SELECT id, filename, content_type, size_bytes, created_at
    FROM site_files
    WHERE site_user_id = ${userOrError.id}
    ORDER BY created_at DESC
    LIMIT 50
  `;

  return jsonResponse({ files }, 200, origin);
}
