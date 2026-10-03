import { getDb } from "@/lib/neon";
import { scorePage } from "@/lib/seo-scorer";

// ── Types ────────────────────────────────────────────────────────────

export type IssueSeverity = "error" | "warning" | "info";

export interface AuditIssue {
  severity: IssueSeverity;
  message: string;
  element?: string;
}

export interface SiteAuditResult {
  score: number;
  issues: AuditIssue[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function checkMetaTags(html: string, issues: AuditIssue[]) {
  // Open Graph tags
  const ogTitle = /<meta\s[^>]*property\s*=\s*["']og:title["']/i.test(html);
  const ogDesc = /<meta\s[^>]*property\s*=\s*["']og:description["']/i.test(html);
  const ogImage = /<meta\s[^>]*property\s*=\s*["']og:image["']/i.test(html);

  if (!ogTitle) issues.push({ severity: "warning", message: "Missing og:title meta tag", element: "meta[property='og:title']" });
  if (!ogDesc) issues.push({ severity: "warning", message: "Missing og:description meta tag", element: "meta[property='og:description']" });
  if (!ogImage) issues.push({ severity: "info", message: "Missing og:image meta tag — social sharing thumbnails won't appear", element: "meta[property='og:image']" });

  // Charset
  const hasCharset = /<meta\s[^>]*charset/i.test(html);
  if (!hasCharset) issues.push({ severity: "warning", message: "Missing charset declaration", element: "meta[charset]" });

  // Canonical URL
  const hasCanonical = /<link\s[^>]*rel\s*=\s*["']canonical["']/i.test(html);
  if (!hasCanonical) issues.push({ severity: "warning", message: "Missing canonical URL — may cause duplicate content issues", element: "link[rel='canonical']" });

  // Favicon
  const hasFavicon = /<link\s[^>]*rel\s*=\s*["'](?:icon|shortcut icon)["']/i.test(html);
  if (!hasFavicon) issues.push({ severity: "info", message: "No favicon link found", element: "link[rel='icon']" });
}

function checkImageAlts(html: string, issues: AuditIssue[]) {
  const imgRegex = /<img\s([^>]*)>/gi;
  let match;
  let index = 0;

  while ((match = imgRegex.exec(html)) !== null) {
    index++;
    const attrs = match[1];
    const hasAlt = /alt\s*=\s*["'][^"']+["']/i.test(attrs);
    const emptyAlt = /alt\s*=\s*["']\s*["']/i.test(attrs);

    if (!hasAlt || emptyAlt) {
      const src = attrs.match(/src\s*=\s*["']([^"']*)["']/i)?.[1] ?? `image #${index}`;
      issues.push({
        severity: "warning",
        message: `Image missing alt text: ${src.slice(0, 80)}`,
        element: `img[src="${src.slice(0, 80)}"]`,
      });
    }
  }
}

function checkHeadingHierarchy(html: string, issues: AuditIssue[]) {
  const headings: number[] = [];
  const headingRegex = /<h([1-6])[\s>]/gi;
  let match;

  while ((match = headingRegex.exec(html)) !== null) {
    headings.push(parseInt(match[1], 10));
  }

  if (headings.length === 0) {
    issues.push({ severity: "error", message: "No headings found — page lacks structure" });
    return;
  }

  // Check for heading level skips (e.g., h1 -> h3, skipping h2)
  for (let i = 1; i < headings.length; i++) {
    if (headings[i] > headings[i - 1] + 1) {
      issues.push({
        severity: "warning",
        message: `Heading hierarchy skip: H${headings[i - 1]} followed by H${headings[i]}`,
        element: `h${headings[i]}`,
      });
    }
  }
}

function checkPageStructure(html: string, issues: AuditIssue[]) {
  const hasDoctype = /^<!DOCTYPE/i.test(html.trimStart());
  if (!hasDoctype) issues.push({ severity: "warning", message: "Missing <!DOCTYPE html> declaration" });

  const hasLang = /<html\s[^>]*lang\s*=/i.test(html);
  if (!hasLang) issues.push({ severity: "warning", message: "Missing lang attribute on <html> tag", element: "html" });

  // Check for inline styles (excessive use is a flag)
  const inlineStyleCount = (html.match(/style\s*=\s*["']/gi) || []).length;
  if (inlineStyleCount > 20) {
    issues.push({
      severity: "info",
      message: `High number of inline styles found (${inlineStyleCount}). Consider using CSS classes.`,
    });
  }
}

function checkSecurityHeaders(html: string, issues: AuditIssue[]) {
  // Check for Content Security Policy meta tag
  const hasCSP = /<meta\s[^>]*http-equiv\s*=\s*["']Content-Security-Policy["']/i.test(html);
  if (!hasCSP) {
    issues.push({
      severity: "info",
      message: "No Content-Security-Policy meta tag — consider adding CSP headers on server",
    });
  }

  // Check for external scripts without integrity
  const scriptRegex = /<script\s[^>]*src\s*=\s*["']https?:\/\//gi;
  const integrityRegex = /<script\s[^>]*integrity\s*=/gi;
  const externalScripts = (html.match(scriptRegex) || []).length;
  const withIntegrity = (html.match(integrityRegex) || []).length;

  if (externalScripts > 0 && withIntegrity < externalScripts) {
    issues.push({
      severity: "info",
      message: `${externalScripts - withIntegrity} external script(s) without subresource integrity`,
    });
  }
}

function checkSitemapAndRobots(html: string, issues: AuditIssue[]) {
  // These are typically at /sitemap.xml and /robots.txt, not in HTML.
  // We check if the HTML references them.
  const hasSitemapLink = /sitemap/i.test(html);
  if (!hasSitemapLink) {
    issues.push({
      severity: "info",
      message: "No sitemap reference found in page — ensure /sitemap.xml exists on the live site",
    });
  }

  // Check robots meta
  const robotsMeta = /<meta\s[^>]*name\s*=\s*["']robots["'][^>]*content\s*=\s*["']([^"']*)["']/i.exec(html);
  if (robotsMeta) {
    const content = robotsMeta[1].toLowerCase();
    if (content.includes("noindex")) {
      issues.push({
        severity: "warning",
        message: "Page has noindex meta tag — it will not be indexed by search engines",
        element: "meta[name='robots']",
      });
    }
  }
}

// ── Main audit ───────────────────────────────────────────────────────

/**
 * Run a technical SEO audit on a project's website.
 * Fetches the landing page HTML from the platform DB and checks for
 * common SEO and technical issues.
 */
export async function auditSite(projectId: string): Promise<SiteAuditResult> {
  const db = getDb();

  // Fetch landing page HTML
  const rows = await db`
    SELECT landing_page_html FROM projects
    WHERE id = ${projectId}
    LIMIT 1
  `;

  if (rows.length === 0) {
    return { score: 0, issues: [{ severity: "error", message: "Project not found" }] };
  }

  const html = rows[0].landing_page_html as string | null;

  if (!html || html.trim().length === 0) {
    return { score: 0, issues: [{ severity: "error", message: "No website HTML found for this project" }] };
  }

  const issues: AuditIssue[] = [];

  // Run all checks
  checkMetaTags(html, issues);
  checkImageAlts(html, issues);
  checkHeadingHierarchy(html, issues);
  checkPageStructure(html, issues);
  checkSecurityHeaders(html, issues);
  checkSitemapAndRobots(html, issues);

  // Also run the SEO scorer for basic on-page checks
  const seoResult = scorePage(html);
  // Merge any failing checks from the scorer that aren't already covered
  for (const check of seoResult.checks) {
    if (check.status === "fail") {
      const alreadyCovered = issues.some((i) => i.message.toLowerCase().includes(check.name.toLowerCase()));
      if (!alreadyCovered) {
        issues.push({ severity: "error", message: `${check.name}: ${check.message}` });
      }
    }
  }

  // Calculate score: start at 100, deduct per issue severity
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const infoCount = issues.filter((i) => i.severity === "info").length;

  const score = Math.max(0, Math.round(100 - errorCount * 15 - warningCount * 5 - infoCount * 1));

  return { score, issues };
}
