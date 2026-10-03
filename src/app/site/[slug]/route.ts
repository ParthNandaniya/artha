import { getDb } from "@/lib/neon";
import { injectIntoHead } from "@/lib/website";
import { buildTrackingScript } from "@/lib/analytics-tracking-script";
import { buildChatWidgetScript } from "@/lib/chat-widget-script";
import { buildArthaBadgeScript } from "@/lib/artha-badge";

const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const db = getDb();

    const rows = await db`
      SELECT
        p.id, p.landing_page_html, p.landing_page_published, p.name, p.subscription_status,
        p.memory->>'tagline' AS tagline
      FROM projects p
      WHERE p.slug = ${slug}
    `;

    if (rows.length === 0 || !rows[0].landing_page_published || !rows[0].landing_page_html) {
      return new Response("Not Found", { status: 404 });
    }

    const { name, tagline } = rows[0];
    const siteUrl = `https://${slug}.${companyDomain}`;
    const apiBase = process.env.NEXT_PUBLIC_APP_URL || "https://artha.run";

    const trackingTag = `<script>${buildTrackingScript(slug, apiBase)}</script>`;
    const chatWidgetTag = `<script>${buildChatWidgetScript(slug, apiBase)}</script>`;

    const isSubscribed = rows[0].subscription_status === "active";
    const badgeTag = isSubscribed ? "" : `<script>${buildArthaBadgeScript(slug)}</script>`;

    // Inject OG meta tags for SEO + tracking/widget scripts
    const ogTags = [
      `<meta property="og:type" content="website" />`,
      `<meta property="og:url" content="${siteUrl}" />`,
      `<meta property="og:title" content="${escapeAttr(name as string)}" />`,
      `<meta property="og:description" content="${escapeAttr((tagline as string) || `${name} — Built with Artha`)}" />`,
      `<meta property="og:site_name" content="${escapeAttr(name as string)}" />`,
      `<link rel="canonical" href="${siteUrl}" />`,
    ].join("\n  ");

    const injection = ogTags + "\n" + trackingTag + chatWidgetTag + badgeTag;
    const html = injectIntoHead(rows[0].landing_page_html as string, injection);

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    console.error("[site-route] Error:", err);
    return new Response("Internal Server Error", { status: 500, headers: { "Content-Type": "text/plain" } });
  }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
