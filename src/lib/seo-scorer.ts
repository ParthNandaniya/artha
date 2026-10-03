// ══════════════════════════════════════════════════════════════════════
// SEO Scoring Engine
// Analyzes raw HTML and returns a score 0-100 with individual checks.
// ══════════════════════════════════════════════════════════════════════

export type CheckStatus = "pass" | "warn" | "fail";

export interface SeoCheck {
  name: string;
  status: CheckStatus;
  message: string;
}

export interface SeoScoreResult {
  score: number;
  checks: SeoCheck[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function extractTag(html: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = html.match(regex);
  return match ? match[1].trim() : null;
}

function extractMeta(html: string, name: string): string | null {
  // Match both name= and property= variants
  const regex = new RegExp(
    `<meta\\s+(?:[^>]*?(?:name|property)\\s*=\\s*["']${name}["'][^>]*?content\\s*=\\s*["']([^"']*)["']|[^>]*?content\\s*=\\s*["']([^"']*)["'][^>]*?(?:name|property)\\s*=\\s*["']${name}["'])`,
    "i",
  );
  const match = html.match(regex);
  return match ? (match[1] ?? match[2] ?? null) : null;
}

function countMatches(html: string, regex: RegExp): number {
  const matches = html.match(regex);
  return matches ? matches.length : 0;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

function keywordDensity(text: string, keyword: string): number {
  const words = countWords(text);
  if (words === 0) return 0;
  const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const occurrences = (text.match(regex) || []).length;
  return (occurrences / words) * 100;
}

// ── Scoring ──────────────────────────────────────────────────────────

/**
 * Analyze an HTML string and return an SEO score 0-100 with individual checks.
 * Optionally provide a target keyword for density analysis.
 */
export function scorePage(html: string, targetKeyword?: string): SeoScoreResult {
  const checks: SeoCheck[] = [];
  const bodyText = stripTags(html);

  // 1. Title tag
  const title = extractTag(html, "title");
  if (!title) {
    checks.push({ name: "Title tag", status: "fail", message: "Missing <title> tag" });
  } else if (title.length < 30) {
    checks.push({ name: "Title tag", status: "warn", message: `Title is too short (${title.length} chars). Aim for 50-60 characters.` });
  } else if (title.length > 70) {
    checks.push({ name: "Title tag", status: "warn", message: `Title is too long (${title.length} chars). Keep under 60 characters.` });
  } else {
    checks.push({ name: "Title tag", status: "pass", message: `Title tag present (${title.length} chars)` });
  }

  // 2. Meta description
  const metaDesc = extractMeta(html, "description");
  if (!metaDesc) {
    checks.push({ name: "Meta description", status: "fail", message: "Missing meta description" });
  } else if (metaDesc.length < 70) {
    checks.push({ name: "Meta description", status: "warn", message: `Meta description is too short (${metaDesc.length} chars). Aim for 120-160.` });
  } else if (metaDesc.length > 170) {
    checks.push({ name: "Meta description", status: "warn", message: `Meta description is too long (${metaDesc.length} chars). Keep under 160.` });
  } else {
    checks.push({ name: "Meta description", status: "pass", message: `Meta description present (${metaDesc.length} chars)` });
  }

  // 3. H1 heading — exactly one
  const h1Count = countMatches(html, /<h1[\s>]/gi);
  if (h1Count === 0) {
    checks.push({ name: "H1 heading", status: "fail", message: "No <h1> heading found" });
  } else if (h1Count > 1) {
    checks.push({ name: "H1 heading", status: "warn", message: `Multiple H1 tags found (${h1Count}). Use exactly one.` });
  } else {
    checks.push({ name: "H1 heading", status: "pass", message: "Exactly one H1 heading found" });
  }

  // 4. Subheadings (h2+)
  const subheadingCount = countMatches(html, /<h[2-6][\s>]/gi);
  if (subheadingCount === 0) {
    checks.push({ name: "Subheadings", status: "warn", message: "No subheadings (H2-H6) found. Add structure." });
  } else {
    checks.push({ name: "Subheadings", status: "pass", message: `${subheadingCount} subheading(s) found` });
  }

  // 5. Keyword density
  if (targetKeyword) {
    const density = keywordDensity(bodyText, targetKeyword);
    if (density === 0) {
      checks.push({ name: "Keyword density", status: "fail", message: `Target keyword "${targetKeyword}" not found in content` });
    } else if (density < 0.5) {
      checks.push({ name: "Keyword density", status: "warn", message: `Keyword density is low (${density.toFixed(1)}%). Aim for 1-3%.` });
    } else if (density > 4) {
      checks.push({ name: "Keyword density", status: "warn", message: `Keyword density is high (${density.toFixed(1)}%). Risk of keyword stuffing.` });
    } else {
      checks.push({ name: "Keyword density", status: "pass", message: `Keyword density: ${density.toFixed(1)}%` });
    }
  }

  // 6. Image alt tags
  const imgCount = countMatches(html, /<img[\s]/gi);
  const imgWithAlt = countMatches(html, /<img\s[^>]*alt\s*=\s*["'][^"']+["']/gi);
  if (imgCount === 0) {
    checks.push({ name: "Image alt tags", status: "pass", message: "No images found (N/A)" });
  } else if (imgWithAlt === imgCount) {
    checks.push({ name: "Image alt tags", status: "pass", message: `All ${imgCount} images have alt text` });
  } else {
    const missing = imgCount - imgWithAlt;
    checks.push({
      name: "Image alt tags",
      status: missing > imgCount / 2 ? "fail" : "warn",
      message: `${missing} of ${imgCount} images missing alt text`,
    });
  }

  // 7. Internal links
  const internalLinkCount = countMatches(html, /<a\s[^>]*href\s*=\s*["'](?:\/|#)[^"']*/gi);
  if (internalLinkCount === 0) {
    checks.push({ name: "Internal links", status: "warn", message: "No internal links found" });
  } else {
    checks.push({ name: "Internal links", status: "pass", message: `${internalLinkCount} internal link(s) found` });
  }

  // 8. Word count
  const wordCount = countWords(bodyText);
  if (wordCount < 100) {
    checks.push({ name: "Word count", status: "fail", message: `Very low word count (${wordCount}). Aim for at least 300 words.` });
  } else if (wordCount < 300) {
    checks.push({ name: "Word count", status: "warn", message: `Low word count (${wordCount}). Aim for 300+ words.` });
  } else {
    checks.push({ name: "Word count", status: "pass", message: `Word count: ${wordCount}` });
  }

  // 9. Mobile viewport meta
  const hasViewport = /<meta\s[^>]*name\s*=\s*["']viewport["']/i.test(html);
  if (!hasViewport) {
    checks.push({ name: "Viewport meta", status: "fail", message: "Missing viewport meta tag for mobile" });
  } else {
    checks.push({ name: "Viewport meta", status: "pass", message: "Viewport meta tag present" });
  }

  // 10. Open Graph image
  const ogImage = extractMeta(html, "og:image");
  if (!ogImage) {
    checks.push({ name: "OG Image", status: "warn", message: "Missing og:image — social shares will have no preview image" });
  } else {
    checks.push({ name: "OG Image", status: "pass", message: "OG image present" });
  }

  // 11. Structured data (JSON-LD)
  const hasJsonLd = /<script\s[^>]*type\s*=\s*["']application\/ld\+json["']/i.test(html);
  if (!hasJsonLd) {
    checks.push({ name: "Structured data", status: "warn", message: "No JSON-LD structured data found" });
  } else {
    checks.push({ name: "Structured data", status: "pass", message: "JSON-LD structured data present" });
  }

  // 12. Canonical URL
  const hasCanonical = /<link\s[^>]*rel\s*=\s*["']canonical["']/i.test(html);
  if (!hasCanonical) {
    checks.push({ name: "Canonical URL", status: "warn", message: "Missing canonical URL" });
  } else {
    checks.push({ name: "Canonical URL", status: "pass", message: "Canonical URL present" });
  }

  // Calculate score
  const maxPoints = checks.length * 10;
  let earnedPoints = 0;
  for (const check of checks) {
    if (check.status === "pass") earnedPoints += 10;
    else if (check.status === "warn") earnedPoints += 5;
    // fail = 0
  }

  const score = maxPoints > 0 ? Math.round((earnedPoints / maxPoints) * 100) : 0;

  return { score, checks };
}
