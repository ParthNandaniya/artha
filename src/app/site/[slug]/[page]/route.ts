import { getDb } from "@/lib/neon";
import { injectIntoHead } from "@/lib/website";
import { buildTrackingScript } from "@/lib/analytics-tracking-script";
import { buildChatWidgetScript } from "@/lib/chat-widget-script";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; page: string }> }
) {
  const { slug, page } = await params;
  const db = getDb();

  const rows = await db`
    SELECT id, landing_page_published
    FROM projects WHERE slug = ${slug}
    LIMIT 1
  `;

  if (rows.length === 0 || !rows[0].landing_page_published) {
    return new Response("Not Found", { status: 404 });
  }

  const projectId = rows[0].id as string;

  const pageRows = await db`
    SELECT html, published FROM pages WHERE project_id = ${projectId} AND slug = ${page} LIMIT 1
  `;

  if (pageRows.length === 0 || !pageRows[0].published || !pageRows[0].html) {
    return new Response("Not Found", { status: 404 });
  }

  const apiBase = process.env.NEXT_PUBLIC_APP_URL || "https://artha.run";
  const trackingTag = `<script>${buildTrackingScript(slug, apiBase)}</script>`;
  const chatWidgetTag = `<script>${buildChatWidgetScript(slug, apiBase)}</script>`;
  const html = injectIntoHead(pageRows[0].html as string, trackingTag + chatWidgetTag);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
