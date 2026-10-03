import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { buildWebsitePreviewHtml, getProjectWebsite } from "@/lib/website";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function assertProjectOwnership(projectId: string, userId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db`
    SELECT id
    FROM projects
    WHERE id = ${projectId} AND user_id = ${userId}
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) {
    return new Response("<h1>Unauthorized</h1>", {
      status: 401,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return new Response("<h1>Missing projectId</h1>", {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (!await assertProjectOwnership(projectId, user.id)) {
    return new Response("<h1>Not found</h1>", {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  try {
    const website = await getProjectWebsite(projectId);
    if (!website.previewHtml) {
      return new Response("<h1>No website preview available</h1>", {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response(
      buildWebsitePreviewHtml(website.previewHtml, website.liveUrl),
      {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build website preview";
    return new Response(`<h1>${escapeHtml(message)}</h1>`, {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}
