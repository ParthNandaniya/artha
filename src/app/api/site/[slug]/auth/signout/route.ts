import { NextRequest } from "next/server";
import { handlePreflight, destroySiteSession, getProjectBySlug, getWebsiteDb, jsonResponse } from "@/lib/site-api";

export async function OPTIONS(request: NextRequest) {
  return handlePreflight(request);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const origin = request.headers.get("origin");

  const project = await getProjectBySlug(slug);
  if (!project) return jsonResponse({ error: "Not found" }, 404, origin);

  const websiteDb = await getWebsiteDb(slug);
  if (!websiteDb) {
    return jsonResponse({ error: "Database not available" }, 403, origin);
  }

  // Extract token and destroy session
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;

  if (token) {
    await destroySiteSession(websiteDb, token);
  }

  return jsonResponse({ ok: true }, 200, origin);
}
