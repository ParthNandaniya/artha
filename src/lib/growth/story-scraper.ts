/**
 * Scrapes founder revenue stories from public directories.
 * No search APIs — just fetch + HTML parsing.
 *
 * Sources:
 * - TrustMRR leaderboard (verified MRR data)
 * - Indie Hackers products DB (self-reported revenue)
 */

// ── Types ────────────────────────────────────────────────────────────

export interface FounderStory {
  name: string;
  description: string;
  founder: string;
  mrr: string;          // e.g. "$85,888"
  mrrNumeric: number;   // e.g. 85888
  growth?: string;      // e.g. "47%"
  sourceUrl: string;    // link to the product on the source site (TrustMRR/IH)
  productUrl?: string;  // actual product website URL
  source: "trustmrr" | "indiehackers";
}

// ── TrustMRR scraper ─────────────────────────────────────────────────

/**
 * Scrapes the TrustMRR leaderboard page.
 * Each leaderboard entry follows this pattern in the HTML:
 *   <a href="/startup/SLUG"> ... startup name ... description ... founder ... $MRR ... growth% ...
 */
export async function scrapeTrustMRR(): Promise<FounderStory[]> {
  const stories: FounderStory[] = [];

  try {
    const res = await fetch("https://trustmrr.com/", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.log(`[story-scraper] TrustMRR returned ${res.status}`);
      return [];
    }

    const html = await res.text();

    // Strategy: find all /startup/SLUG links, then extract surrounding data.
    // Each startup row contains: slug, name, description, founder, MRR, growth.
    // We extract data between consecutive /startup/ links.

    const slugPattern = /href="\/startup\/([\w-]+)"/g;
    const slugMatches: Array<{ slug: string; index: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = slugPattern.exec(html)) !== null) {
      slugMatches.push({ slug: m[1], index: m.index });
    }

    for (let i = 0; i < slugMatches.length; i++) {
      const { slug, index } = slugMatches[i];
      // Get the HTML chunk for this entry (up to the next startup link or 3000 chars)
      const endIdx = slugMatches[i + 1]?.index ?? index + 3000;
      const chunk = html.slice(index, Math.min(endIdx, index + 3000));

      // Skip hidden/stealth/unnamed companies
      if (/stealth|unnamed|hidden|private|confidential|secret/i.test(chunk)) continue;
      // Skip "FOR SALE" entries — less interesting for stories
      if (/FOR SALE/i.test(chunk)) continue;

      // Strip HTML tags to get clean text
      const text = chunk.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

      // Extract MRR — look for $X,XXX patterns
      const mrrMatch = text.match(/\$([\d,]+)/);
      if (!mrrMatch) continue;
      const mrr = `$${mrrMatch[1]}`;
      const mrrNumeric = parseInt(mrrMatch[1].replace(/,/g, ""), 10);

      // Filter: $5k–$500k range (sweet spot for indie stories)
      if (mrrNumeric < 5_000 || mrrNumeric > 500_000) continue;

      // Extract growth percentage (e.g. "47%", "3,162%")
      const growthMatch = text.match(/(\d+(?:,\d+)?%)/);

      // Build clean name from slug (most reliable — HTML text extraction is fragile)
      const name = slug
        .replace(/-+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .replace(/\bAi\b/g, "AI")
        .replace(/\bIo\b/g, ".io")
        .replace(/\bLlc\b/g, "LLC")
        .replace(/\bLtd\b/g, "Ltd")
        .replace(/\bInc\b/g, "Inc")
        .replace(/\bSaas\b/g, "SaaS")
        .replace(/\bSeo\b/g, "SEO");

      // Extract description — find longest sentence-like text (starts with capital letter)
      const sentences = text.match(/[A-Z][a-zA-Z\s,'-]{15,}[.!]/g) || [];
      const description = sentences
        .sort((a, b) => b.length - a.length)[0]
        ?.slice(0, 200)
        ?.trim() || "";

      // Extract founder — find /founder/USERNAME link, then the display name after it
      const founderLinkMatch = chunk.match(/href="\/founder\/([\w_]+)"/);
      let founder = "";
      if (founderLinkMatch) {
        // After the founder link, there's usually an alt text or display name
        const afterFounder = chunk.slice(
          chunk.indexOf(founderLinkMatch[0]) + founderLinkMatch[0].length
        );
        const founderText = afterFounder.replace(/<[^>]+>/g, " ").trim();
        // First 2-3 word chunk that looks like a name
        const nameMatch = founderText.match(/([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})/);
        founder = nameMatch?.[1] || "";
      }

      stories.push({
        name,
        description,
        founder,
        mrr,
        mrrNumeric,
        growth: growthMatch?.[1],
        sourceUrl: `https://trustmrr.com/startup/${slug}`,
        source: "trustmrr",
      });
    }
  } catch (err) {
    console.log(
      `[story-scraper] TrustMRR scrape failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Deduplicate by slug (some may appear in multiple sections)
  const seen = new Set<string>();
  return stories.filter((s) => {
    if (seen.has(s.sourceUrl)) return false;
    seen.add(s.sourceUrl);
    return true;
  });
}

// ── Indie Hackers scraper ────────────────────────────────────────────

/**
 * Scrapes Indie Hackers products page filtered by minimum revenue.
 */
export async function scrapeIndieHackers(): Promise<FounderStory[]> {
  const stories: FounderStory[] = [];

  try {
    const res = await fetch(
      "https://www.indiehackers.com/products?minRevenue=35137&sorting=highest-revenue",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(15_000),
      }
    );

    if (!res.ok) {
      console.log(`[story-scraper] IndieHackers returned ${res.status}`);
      return [];
    }

    const html = await res.text();

    // IH products page: look for /product/SLUG links with revenue data
    const slugPattern = /href="\/product\/([\w-]+)"/g;
    const slugMatches: Array<{ slug: string; index: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = slugPattern.exec(html)) !== null) {
      slugMatches.push({ slug: m[1], index: m.index });
    }

    for (let i = 0; i < slugMatches.length; i++) {
      const { slug, index } = slugMatches[i];
      const endIdx = slugMatches[i + 1]?.index ?? index + 2000;
      const chunk = html.slice(index, Math.min(endIdx, index + 2000));
      const text = chunk.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

      const mrrMatch = text.match(/\$([\d,]+)(?:\s*\/\s*mo)?/);
      if (!mrrMatch) continue;
      const mrrNumeric = parseInt(mrrMatch[1].replace(/,/g, ""), 10);
      if (mrrNumeric < 5_000) continue;

      const nameFromSlug = slug
        .replace(/-+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      stories.push({
        name: nameFromSlug,
        description: text.slice(0, 200).trim(),
        founder: "",
        mrr: `$${mrrMatch[1]}`,
        mrrNumeric,
        sourceUrl: `https://www.indiehackers.com/product/${slug}`,
        source: "indiehackers",
      });
    }
  } catch (err) {
    console.log(
      `[story-scraper] IndieHackers scrape failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return stories;
}

// ── Enrich a story with product URL + better description ─────────────

/**
 * Fetches the TrustMRR startup detail page to extract:
 * - The actual product website URL
 * - A richer description
 */
export async function enrichStoryFromTrustMRR(story: FounderStory): Promise<FounderStory> {
  if (story.source !== "trustmrr") return story;

  try {
    const res = await fetch(story.sourceUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return story;
    const html = await res.text();

    // Extract the product URL.
    // TrustMRR detail pages have noisy sidebars with unrelated links.
    // Strategy: only accept links whose domain clearly matches the startup name/slug.
    const SKIP_DOMAINS = /twitter\.com|x\.com|linkedin\.com|facebook\.com|instagram\.com|youtube\.com|github\.com|google\.|cloudflare|cdn\.|fonts\.|analytics|stripe\.com|lemonsqueezy|polar\.sh|t\.me|telegram\.|discord\.|reddit\.com|tiktok\.com|apple\.com|play\.google|apps\.apple|vercel\.app|netlify|herokuapp|notion\.so|medium\.com|substack\.com|newsletter\.|marclou\.com|beehiiv\.com|buttondown\.com|mailchimp\.com|convertkit\.com|w3\.org|schema\.org|sentry\.io|hotjar\.com|clarity\.ms|intercom\.io|crisp\.chat|codefa\.st|shipfa\.st|datafa\.st|trustmrr|\.js$|\.css$|\.png$|\.jpg$|\.svg$|\.woff|\.ico$|\/js\/|\/css\/|\/assets\//i;

    const externalLinks = html.match(/href="(https?:\/\/(?!trustmrr\.com)[^"]+)"/g) || [];
    const slug = story.sourceUrl.split("/startup/")[1] || "";
    // Build name variants to match against domains
    const nameClean = story.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const slugClean = slug.replace(/-/g, "");

    for (const link of externalLinks) {
      const url = link.match(/href="([^"]+)"/)?.[1];
      if (!url) continue;
      if (SKIP_DOMAINS.test(url)) continue;
      try {
        const u = new URL(url);
        if (u.pathname.length > 5) continue; // only homepages
        const domain = u.hostname.replace(/^www\./, "").toLowerCase();
        const domainBase = domain.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]/g, "");
        // ONLY accept if domain clearly contains the startup name or slug
        if (
          domainBase.includes(nameClean) ||
          nameClean.includes(domainBase) ||
          domainBase.includes(slugClean) ||
          slugClean.includes(domainBase)
        ) {
          story.productUrl = url;
          break;
        }
      } catch {
        continue;
      }
    }

    // Try to get a better description from the detail page
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const sentences = text.match(/[A-Z][a-zA-Z0-9\s,'-]{20,}[.!]/g) || [];
    const bestDesc = sentences
      .filter((s) => !s.includes("TrustMRR") && !s.includes("Cookie") && !s.includes("Sign"))
      .sort((a, b) => b.length - a.length)[0];
    if (bestDesc && bestDesc.length > (story.description?.length || 0)) {
      story.description = bestDesc.slice(0, 300).trim();
    }
  } catch {
    // Enrichment is best-effort
  }

  return story;
}

// ── Combined scraper ─────────────────────────────────────────────────

/**
 * Scrapes all configured sources and returns a merged, deduplicated list
 * sorted by MRR descending. Filters out stories we've already posted.
 */
export async function scrapeFounderStories(
  alreadyPostedNames: string[] = []
): Promise<FounderStory[]> {
  const posted = new Set(alreadyPostedNames.map((n) => n.toLowerCase()));

  // Scrape all sources in parallel
  const [trustmrr, ih] = await Promise.all([
    scrapeTrustMRR(),
    scrapeIndieHackers(),
  ]);

  const all = [...trustmrr, ...ih];

  // Deduplicate by name (lowercase) and filter already-posted
  const seen = new Set<string>();
  const unique = all.filter((s) => {
    const key = s.name.toLowerCase();
    if (seen.has(key) || posted.has(key)) return false;
    if (!s.name || s.name.length < 2) return false;
    seen.add(key);
    return true;
  });

  // Sort by MRR descending
  unique.sort((a, b) => b.mrrNumeric - a.mrrNumeric);

  return unique;
}
