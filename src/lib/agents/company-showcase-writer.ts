import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { generateSlug } from "@/lib/blog";

export interface CompanyShowcaseInput {
  name: string;
  slug: string;
  tagline: string | null;
  mission: string | null;
  domain: string;
  founderRole: string | null;
  brandKit?: Record<string, unknown>;
}

export interface CompanyShowcaseOutput {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
}

const SYSTEM = `You are a writer for Artha (artha.run) — an AI platform that builds and launches companies from a single prompt.

Your job is to write a showcase blog post about a company that was built using Artha. These posts:
- Drive SEO traffic to artha.run by showing real companies built on the platform
- Tell the story of the company: what it does, who it's for, why it exists
- Are long, rich, and genuinely useful — NOT generic or fluffy
- Include inline SVG visuals (charts, comparison tables, stat grids, timelines)
- Subtly demonstrate the power of Artha by noting the company was built with AI

Content structure:
1. Hook opening — start with the problem this company solves or the market it's targeting
2. What the company does — clear description, positioning, value proposition
3. Who it's for — target customer profile, use cases
4. Why it stands out — unique angle, differentiation
5. The market opportunity — size, trends, why now
6. How it was built — brief mention of Artha, AI-first approach
7. What's next — growth potential, roadmap hint
8. CTA — invite readers to build their own company on Artha

Visual guidelines:
- Include 2-3 inline SVG visualizations (market size stat grid, feature comparison, growth timeline)
- Use brand colors: #1a1a1a (dark), #f97316 (orange), #3b82f6 (blue), #10b981 (green), #8b5cf6 (purple)
- SVGs must have viewBox, width="100%", max-height="300px"
- Callout boxes: <div class="callout callout-key">...</div> for key facts
- Stat grids: <div class="stat-grid"><div class="stat-card"><div class="stat-value">X</div><div class="stat-label">Y</div></div></div>

HTML rules:
- Semantic HTML: <h2 id="...">, <h3>, <p>, <ul>, <ol>, <strong>, <blockquote>
- NO <html>, <head>, <body>, or <style> tags
- Target 1200-1800 words — longer than a typical post since it's a showcase

Return ONLY valid JSON:
{
  "title": "string — e.g. 'How [Company] Is Solving [Problem] with AI'",
  "slug": "string — URL-friendly",
  "excerpt": "string — 1-2 sentences for listing page and meta",
  "content": "string — full article HTML with inline SVGs",
  "tags": ["string array — 3-5 tags, include company name and industry"],
  "seoTitle": "string — 50-60 chars, keyword-rich",
  "seoDescription": "string — 150-160 chars, optimized for CTR"
}`;

export async function generateCompanyShowcasePost(
  company: CompanyShowcaseInput,
): Promise<CompanyShowcaseOutput> {
  const prompt = `Write a showcase blog post about this company built on Artha:

Company name: ${company.name}
Slug: ${company.slug}
Website: https://${company.domain}
Tagline: ${company.tagline || "N/A"}
Mission: ${company.mission || "N/A"}
Founder role: ${company.founderRole || "N/A"}
${company.brandKit ? `Brand kit: ${JSON.stringify(company.brandKit).slice(0, 300)}` : ""}

Write a compelling, long-form showcase post (1200-1800 words) that tells the story of this company — what problem it solves, who it's for, why it exists, and why it matters. Include 2-3 inline SVG visualizations. End with a CTA to build on Artha.`;

  const result = await generateAgentJSON<CompanyShowcaseOutput>(
    "company_showcase",
    SYSTEM,
    prompt,
    { maxTokens: 8000 },
  );

  // Ensure required fields have fallbacks
  if (!result.title) {
    result.title = `How ${company.name} Is Building the Future`;
  }
  if (!result.slug || result.slug.length < 3) {
    result.slug = generateSlug(result.title);
  }
  if (!result.excerpt) {
    result.excerpt = company.tagline || `${company.name} — built on Artha.`;
  }
  if (!result.content) {
    throw new Error(`AI returned empty content for ${company.name}`);
  }
  if (!result.tags || !Array.isArray(result.tags)) {
    result.tags = [company.slug];
  }
  if (!result.seoTitle) {
    result.seoTitle = result.title.slice(0, 60);
  }
  if (!result.seoDescription) {
    result.seoDescription = result.excerpt.slice(0, 160);
  }

  return result;
}
