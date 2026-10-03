import { NextRequest, NextResponse } from "next/server";
import {
  handlePreflight,
  getProjectBySlug,
  getWebsiteDb,
  jsonResponse,
  corsHeaders,
} from "@/lib/site-api";
import { getFromR2 } from "@/lib/r2";

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request);
}

// ── GET: Serve file by ID ─────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;
  const origin = request.headers.get("origin");

  const project = await getProjectBySlug(slug);
  if (!project) return jsonResponse({ error: "Not found" }, 404, origin);

  const websiteDb = await getWebsiteDb(slug);
  if (!websiteDb) return jsonResponse({ error: "Database not available" }, 403, origin);

  // Check if table exists
  const tableExists = await websiteDb`
    SELECT 1 FROM information_schema.tables WHERE table_name = 'site_files' LIMIT 1
  `;
  if (tableExists.length === 0) {
    return jsonResponse({ error: "File not found" }, 404, origin);
  }

  // Get file metadata from DB
  const rows = await websiteDb`
    SELECT r2_key, content_type, filename FROM site_files WHERE id = ${id} LIMIT 1
  `;

  if (rows.length === 0) {
    return jsonResponse({ error: "File not found" }, 404, origin);
  }

  const file = rows[0];
  const r2Key = file.r2_key as string;

  // Fetch from R2
  const r2File = await getFromR2(r2Key);
  if (!r2File) {
    return jsonResponse({ error: "File not found in storage" }, 404, origin);
  }

  return new NextResponse(new Uint8Array(r2File.body), {
    status: 200,
    headers: {
      "Content-Type": file.content_type as string,
      "Content-Length": r2File.body.length.toString(),
      "Cache-Control": "public, max-age=31536000, immutable",
      ...corsHeaders(origin),
    },
  });
}
