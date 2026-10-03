import { searchWeb } from "@/lib/search";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface EnrichmentResult {
  company_info: {
    name?: string;
    website?: string;
    industry?: string;
    description?: string;
    size?: string;
    location?: string;
  } | null;
  social_profiles: {
    linkedin?: string;
    twitter?: string;
    github?: string;
  };
  job_title: string | null;
  verified_email: string | null;
}

export interface LeadInput {
  name?: string | null;
  email?: string | null;
  company?: string | null;
  website?: string | null;
  linkedin_url?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Enrichment from web (Exa person search)
// ═══════════════════════════════════════════════════════════════════════════

export async function enrichFromWeb(
  name?: string | null,
  email?: string | null,
  company?: string | null
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    company_info: null,
    social_profiles: {},
    job_title: null,
    verified_email: null,
  };

  if (!name && !email && !company) return result;

  // --- Person search ---
  const personQuery = [name, company].filter(Boolean).join(" ") + " professional";
  try {
    const personSearch = await searchWeb(personQuery, {
      engine: "exa",
      maxResults: 5,
    });

    for (const r of personSearch.results) {
      const content = r.content || "";

      // Extract LinkedIn
      if (r.url.includes("linkedin.com/in/") && !result.social_profiles.linkedin) {
        result.social_profiles.linkedin = r.url;
      }

      // Extract Twitter/X
      const twitterMatch = content.match(
        /(?:twitter\.com|x\.com)\/([A-Za-z0-9_]+)/
      );
      if (twitterMatch && !result.social_profiles.twitter) {
        result.social_profiles.twitter = `https://x.com/${twitterMatch[1]}`;
      }

      // Extract GitHub
      const githubMatch = content.match(/github\.com\/([A-Za-z0-9_-]+)/);
      if (githubMatch && !result.social_profiles.github) {
        result.social_profiles.github = `https://github.com/${githubMatch[1]}`;
      }

      // Extract job title
      if (!result.job_title) {
        const titlePatterns = [
          /(?:is|as)\s+(?:a\s+)?(?:the\s+)?((?:Chief|Senior|Lead|Head|VP|Director|Manager|Principal|Staff|Co-?founder|CEO|CTO|COO|CFO|CMO|CPO|CRO)[A-Za-z\s,&]+?)(?:\s+at|\s+of|\s*[,.|])/i,
          /(?:title|role|position)[:\s]+([A-Za-z\s,&]+?)(?:\s+at|\s+of|\s*[,.|])/i,
        ];
        for (const pattern of titlePatterns) {
          const match = content.match(pattern);
          if (match) {
            result.job_title = match[1].trim();
            break;
          }
        }
      }
    }
  } catch {
    // Person search failed, continue with other sources
  }

  // --- Company website extraction ---
  if (company || (email && !isPersonalEmail(email))) {
    try {
      const companyQuery = company
        ? `${company} company about`
        : `${email!.split("@")[1]} company`;

      const companySearch = await searchWeb(companyQuery, {
        engine: "exa",
        maxResults: 3,
      });

      if (companySearch.results.length > 0) {
        const top = companySearch.results[0];
        const content = top.content || "";

        result.company_info = {
          name: company || extractCompanyName(content),
          website: extractCompanyWebsite(top.url),
          description: content.slice(0, 300),
        };

        // Try to extract industry
        const industryMatch = content.match(
          /(?:industry|sector|space)[:\s]+([A-Za-z\s&,]+?)(?:\.|,|\n)/i
        );
        if (industryMatch) {
          result.company_info.industry = industryMatch[1].trim();
        }

        // Try to extract size
        const sizeMatch = content.match(
          /(\d+[\s-]+\d+|\d+\+?)\s+employees/i
        );
        if (sizeMatch) {
          result.company_info.size = sizeMatch[0];
        }
      }
    } catch {
      // Company search failed
    }
  }

  // --- LinkedIn profile discovery ---
  if (!result.social_profiles.linkedin && name) {
    try {
      const linkedinQuery = `${name} ${company || ""} site:linkedin.com/in`;
      const linkedinSearch = await searchWeb(linkedinQuery, {
        engine: "exa",
        maxResults: 2,
        includeDomains: ["linkedin.com"],
      });

      const linkedinResult = linkedinSearch.results.find((r) =>
        r.url.includes("linkedin.com/in/")
      );
      if (linkedinResult) {
        result.social_profiles.linkedin = linkedinResult.url;
      }
    } catch {
      // LinkedIn search failed
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Waterfall enrichment — try sources in priority order
// ═══════════════════════════════════════════════════════════════════════════

export async function waterfall(lead: LeadInput): Promise<EnrichmentResult> {
  // Step 1: Exa person search (primary source)
  const result = await enrichFromWeb(lead.name, lead.email, lead.company);

  // Step 2: If we still lack company info, try extracting from the lead's website
  if (!result.company_info && lead.website) {
    try {
      const siteSearch = await searchWeb(lead.website, {
        engine: "exa",
        maxResults: 1,
      });
      if (siteSearch.results.length > 0) {
        const content = siteSearch.results[0].content || "";
        result.company_info = {
          name: lead.company || extractCompanyName(content),
          website: lead.website,
          description: content.slice(0, 300),
        };
      }
    } catch {
      // Website extraction failed
    }
  }

  // Step 3: LinkedIn profile discovery (if not found in step 1)
  if (!result.social_profiles.linkedin && lead.linkedin_url) {
    result.social_profiles.linkedin = lead.linkedin_url;
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com",
  "outlook.com", "hotmail.com", "live.com", "icloud.com",
  "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com",
  "pm.me", "hey.com", "fastmail.com",
]);

function isPersonalEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return !domain || PERSONAL_DOMAINS.has(domain);
}

function extractCompanyName(content: string): string | undefined {
  // Try to find company name from "About [Company]" or similar patterns
  const patterns = [
    /(?:about|welcome to|introducing)\s+([A-Z][A-Za-z0-9\s&.]+?)(?:\s*[-|,.]|\s+is\s)/i,
    /^([A-Z][A-Za-z0-9\s&.]{2,30})\s*[-|]/m,
  ];
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) return match[1].trim();
  }
  return undefined;
}

function extractCompanyWebsite(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    // Skip social media domains
    const skipDomains = ["linkedin.com", "twitter.com", "x.com", "facebook.com", "crunchbase.com"];
    if (skipDomains.some((d) => parsed.hostname.includes(d))) return undefined;
    return parsed.origin;
  } catch {
    return undefined;
  }
}
