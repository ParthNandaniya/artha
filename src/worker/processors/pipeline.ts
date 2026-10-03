import { createHash } from "node:crypto";
import { getDb, emitPipelineEvent } from "../db";
import { ingestMemory, userTag, companyTag } from "@/lib/supermemory";
import { setCompanyMemory, setCompanyMemoryBatch } from "@/lib/neon";
import { generateAgentJSON } from "@/lib/ai/agent-model-router";
import { generateMission } from "@/lib/ai/research/mission-generator";
import { generateMarketResearch } from "@/lib/ai/research/market-researcher";
import { summarizeContentForMemory } from "@/lib/personalization";
import {
  searchWebMulti,
  buildIdeaResearchQueries,
  formatSearchContext,
} from "@/lib/search";
import { getSearchEngine } from "@/config/search-engines";
import { gatherPersonResearchContext } from "@/lib/person-research";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function generateUniqueProjectSlug(baseName: string): Promise<string> {
  const db = getDb();
  const baseSlug = slugify(baseName) || `company-${Date.now().toString(36)}`;
  let slug = baseSlug;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const existing = await db`SELECT id FROM projects WHERE slug = ${slug} LIMIT 1`;
    if (existing.length === 0) return slug;
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  return `${baseSlug}-${Date.now().toString(36).slice(-6)}`;
}

function isProjectsSlugConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? error.code : undefined;
  const message = "message" in error ? String(error.message) : "";
  return code === "23505" && /projects_slug_key|slug/i.test(message);
}

export async function processPipelineJob(jobId: string, payload: Record<string, unknown>) {
  const db = getDb();
  let { prompt } = payload as { prompt: string };
  const { userId, url, role } = payload as { userId: string; url?: string; role?: string };
  const isSurpriseMe = prompt === "__SURPRISE_ME__";

  const emit = (step: string, status: string, msg?: string, logType?: string, data?: Record<string, unknown>) =>
    emitPipelineEvent(jobId, null, step, status, msg, logType, data);

  // Get user info
  const users = await db`SELECT id, name, email, google_data FROM users WHERE id = ${userId}`;
  if (users.length === 0) throw new Error("User not found");
  const user = users[0];
  let googleData = (user.google_data as Record<string, unknown>) || {};
  let userBackground = googleData.research
    ? JSON.stringify(googleData.research)
    : (user.name as string) || "";

  // Step 0: User research (one-time, per user)
  await emit("user_research", "running", isSurpriseMe ? "Deeply researching your background to find the perfect idea..." : "Researching your public background...");
  try {
    let research = googleData.research as Record<string, unknown> | undefined;

    if (!research) {
      const personResearch = await gatherPersonResearchContext({
        name: (user.name as string) || "Unknown",
        email: (user.email as string) || "",
        projectPrompt: prompt,
        companyUrl: url,
        searchDepth: "fast",
        maxResultsPerQuery: 3,
        maxExtractUrls: 3,
      });

      const result = await generateAgentJSON<{
        summary: string;
        backgroundSummary: string;
        linkedinUrl?: string;
        twitterHandle?: string;
        githubUsername?: string;
        personalSite?: string;
        currentRole?: string;
        pastExperience: string[];
        skills: string[];
        strengths: string[];
        areasToFocusOn: string[];
        suggestedTasks: string[];
        interests: string[];
        relevanceToProject: string;
        fitSignals: string[];
        riskSignals: string[];
        confidence: "high" | "medium" | "low";
        socialProfiles: Record<string, string>;
        notableLinks: string[];
        evidenceNotes: string[];
      }>(
        "research",
        `You are a careful researcher profiling a specific person during onboarding for a startup-building product.

CRITICAL — Identity verification:
The person you are researching is: "${user.name || "Unknown"}" with email "${(user.email as string) || "unknown"}".
${url ? `Their existing company/website: ${url}` : ""}
Their email domain is "${((user.email as string) || "").split("@")[1] || "unknown"}" — use this as a KEY identity anchor.

Search results below may contain information about MULTIPLE people with the same or similar name.
You MUST cross-reference and only include information you can confidently attribute to THIS specific person.

Identity disambiguation rules:
1. Use the email domain, company URL, and project description to identify which search results belong to this person
2. If a LinkedIn profile, GitHub account, or Twitter handle appears in results, verify it matches by checking if the profile's company/role/location aligns with other known signals (email domain, company URL)
3. If search results show different people with the same name (e.g., one at Google, another at a startup), only use info that matches the identity anchors above
4. When two sources conflict about this person's role or background, prefer the source that aligns with the email domain / company URL
5. If you cannot confidently determine which search results belong to this person, return sparse fields and set confidence to "low"
6. NEVER merge information from different people into one profile — this is worse than returning empty fields

Start from a clean slate. Do NOT assume this person is a founder, CEO, entrepreneur, or technical operator unless the evidence clearly says so.
Use ONLY information grounded in the live web context below. If something is ambiguous, say so and lower confidence.

Return strictly valid JSON with:
- summary: 2-4 sentences on who this person appears to be professionally (only verified info)
- backgroundSummary: concise summary of their background and public history (only details confirmed to belong to this person)
- linkedinUrl?: string (only if you're confident this profile belongs to this person)
- twitterHandle?: string (only if confirmed to belong to this person)
- githubUsername?: string (only if confirmed to belong to this person)
- personalSite?: string
- currentRole?: string
- pastExperience: string[] (only roles you can attribute to this specific person)
- skills: string[]
- strengths: string[]
- areasToFocusOn: string[]
- suggestedTasks: string[]
- interests: string[]
- relevanceToProject: 2-4 sentences on how their background connects to the project they want to build, including whether the fit looks strong, weak, or unclear
- fitSignals: string[]
- riskSignals: string[]
- confidence: "high" | "medium" | "low" — factor in identity certainty. If you're unsure whether the info is about the right person, this MUST be "low"
- socialProfiles: Record<string, string> (only verified profiles)
- notableLinks: string[] (only links confirmed about this person)
- evidenceNotes: string[] (include notes about which sources you used and any disambiguation decisions you made)

Research rules:
- Prefer evidence from extracted pages over search snippets when they conflict
- Never assign a leadership title without direct support
- Keep lists short and specific
- It is better to return sparse fields than to guess
- If multiple people with this name appear in results, explicitly note this in evidenceNotes and explain which one you identified as the target person and why
- Exclude any detail you are not confident belongs to THIS person — accuracy over completeness

Live web search:
${personResearch.searchContext || "No results — keep fields minimal and do not hallucinate."}

Extracted source content:
${personResearch.extractedContext || "No extracted pages were available."}

Project they want to build:
${prompt}
${url ? `\nExisting company URL: ${url}` : ""}`,
        `Research the person named "${user.name || "Unknown"}" with email domain "${((user.email as string) || "").split("@")[1] || "Unknown"}".
Their business idea: ${prompt}
${url ? `Their company URL: ${url}` : ""}
Remember: only include information you can confidently attribute to THIS specific person. Do not mix up with other people who share the same name.`
      );

      research = {
        ...result,
        notableLinks: [...new Set([...(result.notableLinks || []), ...personResearch.sourceUrls])].slice(0, 8),
      } as unknown as Record<string, unknown>;
      googleData = { ...googleData, research };
      await db`UPDATE users SET google_data = ${JSON.stringify(googleData)}::jsonb WHERE id = ${userId}`;
      await emit("user_research", "completed", "Background profile created", "success");
    } else {
      await emit("user_research", "completed", "Using existing background profile", "info");
    }

    if (research) {
      userBackground = JSON.stringify(research);

      const summary = typeof (research as Record<string, unknown>).summary === "string"
        ? (research as Record<string, unknown>).summary as string
        : "";
      const strengths = Array.isArray((research as Record<string, unknown>).strengths)
        ? ((research as Record<string, unknown>).strengths as string[]).join(", ")
        : "";
      const focusAreas = Array.isArray((research as Record<string, unknown>).areasToFocusOn)
        ? ((research as Record<string, unknown>).areasToFocusOn as string[]).join(", ")
        : "";
      const interests = Array.isArray((research as Record<string, unknown>).interests)
        ? ((research as Record<string, unknown>).interests as string[]).join(", ")
        : "";
      const fitSignals = Array.isArray((research as Record<string, unknown>).fitSignals)
        ? ((research as Record<string, unknown>).fitSignals as string[]).join(", ")
        : "";
      const riskSignals = Array.isArray((research as Record<string, unknown>).riskSignals)
        ? ((research as Record<string, unknown>).riskSignals as string[]).join(", ")
        : "";

      const summaryLines = [
        `Person: ${(user.name as string) || "Unknown"} (${(user.email as string) || "unknown email"})`,
        summary ? `Summary: ${summary}` : "",
        strengths ? `Strengths: ${strengths}` : "",
        focusAreas ? `Areas to focus on: ${focusAreas}` : "",
        interests ? `Interests: ${interests}` : "",
        (research as Record<string, unknown>).currentRole
          ? `Current role: ${(research as Record<string, unknown>).currentRole as string}`
          : "",
        (research as Record<string, unknown>).backgroundSummary
          ? `Background: ${(research as Record<string, unknown>).backgroundSummary as string}`
          : "",
        (research as Record<string, unknown>).relevanceToProject
          ? `Relevance to this project: ${(research as Record<string, unknown>).relevanceToProject as string}`
          : "",
        (research as Record<string, unknown>).confidence
          ? `Confidence: ${(research as Record<string, unknown>).confidence as string}`
          : "",
        fitSignals ? `Fit signals: ${fitSignals}` : "",
        riskSignals ? `Risk signals: ${riskSignals}` : "",
      ].filter(Boolean);

      if (summaryLines.length > 0) {
        await ingestMemory({
          content: summaryLines.join("\n"),
          containerTag: userTag(userId),
          userId,
          customId: `user_research_${userId}`,
          dedupeKey: `user_research_${userId}`,
          metadata: { type: "user_research" },
        });
      }
    }
  } catch (err) {
    await emit("user_research", "failed", `User research failed: ${String(err)}`, "error");
  }

  // Surprise Me: generate a business idea from user research
  if (isSurpriseMe) {
    await emit("research_idea", "running", "Generating a business idea tailored to your background...");
    try {
      const generated = await generateAgentJSON<{ idea: string }>(
        "research",
        `You are a startup ideation expert. Based on the founder's background, skills, interests, and experience, generate ONE specific, actionable business idea that plays to their strengths.

The idea should be:
- A real business they could start today (micro-SaaS, agency, product, newsletter, marketplace, etc.)
- Specific enough to build a landing page and mission from
- In a growing market with clear demand
- Something where their background gives them an unfair advantage

Founder background:
${userBackground || `Name: ${user.name || "Unknown"}, Email: ${(user.email as string) || "unknown"}`}

Return JSON with:
- idea: A 1-2 sentence business description, written as if the founder described it themselves (e.g. "A platform that helps freelance designers find and manage their clients through automated proposals and invoicing")`,
        `Generate a personalized business idea for this founder based on their research profile. Be specific and creative.`
      );
      prompt = generated.idea;
      await emit("research_idea", "running", `Generated idea: ${prompt}`, "success");
    } catch (err) {
      // Fallback: generic but functional
      prompt = "A micro-SaaS tool that solves a common pain point for small businesses";
      await emit("research_idea", "running", `Using fallback idea: ${prompt}`, "info");
    }
  }

  // Step 1: Research idea (with live web search)
  await emit("research_idea", "running", "Analyzing your business idea...");
  let ideaResearch: { competitors: string[]; marketSize: string; timing: string; summary: string } | null = null;
  try {
    const urlContext = url ? `\nTheir website/domain: ${url}` : "";
    await emit("research_idea", "running", "Searching the web for competitors and market data...");
    const ideaSearches = await searchWebMulti(
      buildIdeaResearchQueries(prompt, url),
      { engine: getSearchEngine("idea_research"), depth: "basic", maxResultsPerQuery: 3 }
    );
    const ideaWebContext = formatSearchContext(ideaSearches);
    if (ideaWebContext) await emit("research_idea", "running", "Web data found — analyzing competitive landscape...");

    ideaResearch = await generateAgentJSON<{ competitors: string[]; marketSize: string; timing: string; summary: string }>(
      "research",
      `You are a startup research analyst. Given a business idea and live web research, analyze the competitive landscape, estimate market size, and assess timing.
${ideaWebContext ? `\nLive web research:\n${ideaWebContext}\n` : ""}
Return JSON with:
- competitors: array of real company names found in the research (3-7 companies)
- marketSize: specific estimate with rationale (e.g. "$2.4B TAM — based on...")
- timing: why now is a good/bad time to enter this market (2-3 sentences)
- summary: 2-3 sentence overview of the opportunity and competitive dynamics`,
      `Research this business idea:\n"${prompt}"${urlContext}`
    );
    await emit("research_idea", "completed", `Found ${ideaResearch.competitors.length} competitors. Market: ${ideaResearch.marketSize}`, "success",
      { competitors: ideaResearch.competitors.length, summary: ideaResearch.summary });
    await ingestMemory({
      content: `Business idea research:\n${ideaResearch.summary}\nCompetitors: ${ideaResearch.competitors.join(", ")}\nMarket Size: ${ideaResearch.marketSize}\nTiming: ${ideaResearch.timing}`,
      containerTag: userTag(userId),
      dedupeKey: `idea_research:${userId}:${stableHash(prompt)}`,
      userId,
      customId: `idea_research_${userId}_${stableHash(prompt)}`,
      metadata: { type: "idea_research" },
    });
  } catch (err) {
    await emit("research_idea", "failed", `Research failed: ${String(err)}`, "error");
  }

  // Step 1b: Classify business vertical (freelance, digital product, SaaS, or general)
  let verticalId = "general";
  try {
    const { classifyVerticalByKeywords } = await import("@/config/vertical-templates");
    const classificationInput = `${prompt} ${ideaResearch?.summary || ""} ${ideaResearch?.competitors?.join(" ") || ""}`;
    verticalId = classifyVerticalByKeywords(classificationInput);
  } catch {
    // Non-blocking — fall back to "general"
  }

  // Step 2: Save profile
  await emit("save_profile", "running", `Saving profile for ${user.name || "user"}...`);
  try {
    if (role || url) {
      const existingRows = await db`SELECT google_data FROM users WHERE id = ${userId}`;
      const existing = (existingRows[0]?.google_data as Record<string, unknown>) || {};
      const updates: Record<string, unknown> = { ...existing };
      if (role) updates.role = role;
      if (url) updates.company_url = url;
      await db`UPDATE users SET google_data = ${JSON.stringify(updates)}::jsonb WHERE id = ${userId}`;
    }
    await emit("save_profile", "completed", "Profile saved", "success");
    const profileParts = [`User: ${user.name || "unknown"}`];
    if (role) profileParts.push(`Role: ${role}`);
    if (url) profileParts.push(`Company URL: ${url}`);
    if (userBackground) profileParts.push(`Background: ${userBackground}`);
    await ingestMemory({
      content: profileParts.join("\n"),
      containerTag: userTag(userId),
      userId,
      customId: `profile_${userId}`,
      metadata: { type: "user_profile" },
    });
  } catch (err) {
    await emit("save_profile", "failed", `Failed: ${String(err)}`, "error");
  }

  // Step 3: Name the company
  await emit("name_company", "running", "Generating company name...");
  let companyName: string;
  let tagline = "";
  try {
    const urlHint = url ? ` (domain: ${url})` : "";
    const naming = await generateAgentJSON<{ name: string; tagline: string }>(
      "pipeline_naming",
      `You are a branding expert. Given a business idea, generate a concise, memorable company name and a short tagline. If a domain is provided, derive the name from it. Return JSON with: name (the company name, 1-3 words), tagline (under 10 words).`,
      `Business idea: "${prompt}"${urlHint}`
    );
    companyName = naming.name;
    tagline = naming.tagline;
    await emit("name_company", "completed", `Company: ${companyName} — "${tagline}"`, "success", { name: companyName, tagline });
  } catch {
    companyName = prompt.length > 40 ? prompt.slice(0, 40) : prompt;
    await emit("name_company", "completed", `Fallback name: ${companyName}`, "info");
  }

  // Step 4: Create project in platform DB
  await emit("create_project", "running", `Creating project "${companyName}"...`);
  let slug = await generateUniqueProjectSlug(companyName);
  const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
  let projectId = "";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const projects = await db`
        INSERT INTO projects (user_id, name, slug, status, company_email, memory)
        VALUES (${userId}, ${companyName}, ${slug}, 'onboarding', NULL, ${JSON.stringify({ companyDescription: prompt })}::jsonb)
        RETURNING id
      `;
      if (projects.length === 0) throw new Error("Failed to create project");
      projectId = projects[0].id as string;
      break;
    } catch (error) {
      if (!isProjectsSlugConflict(error) || attempt === 4) throw error;
      // Use timestamp + random to guarantee uniqueness on retry
      slug = `${slugify(companyName) || "company"}-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 5)}`;
    }
  }

  const companyEmail = `${slug}@${companyDomain}`;
  if (!projectId) throw new Error("Failed to create project");

  // Update pipeline events with project_id from here on
  const emitP = (step: string, status: string, msg?: string, logType?: string, data?: Record<string, unknown>) =>
    emitPipelineEvent(jobId, projectId, step, status, msg, logType, data);

  await emitP("create_project", "completed", `Project created: ${slug}`, "success", { projectId, slug });

  // Step 5: Initialize company profile and memory in platform DB
  await emitP("init_company", "running", "Setting up company profile...");
  try {
    const domain = slug + "." + companyDomain;
    await db`
      INSERT INTO company_profile (project_id, name, tagline, domain, founder_role)
      VALUES (${projectId}, ${companyName}, ${tagline}, ${domain}, ${role || null})
      ON CONFLICT (project_id) DO NOTHING
    `;
    const memoryEntries: Record<string, unknown> = {
      companyDescription: prompt,
      companyName,
      tagline,
    };
    if (userBackground) memoryEntries.userBackground = userBackground;
    if (url) memoryEntries.companyUrl = url;
    if (role) memoryEntries.founderRole = role;
    if (ideaResearch) {
      memoryEntries.ideaResearch = ideaResearch;
      memoryEntries.competitors = ideaResearch.competitors;
    }
    if (verticalId !== "general") {
      memoryEntries.vertical = verticalId;
    }
    await setCompanyMemoryBatch(projectId, memoryEntries);
    await emitP("init_company", "completed", "Company profile initialized", "success");
    const foundationParts = [
      `Company: ${companyName}`,
      tagline ? `Tagline: ${tagline}` : "",
      `Business idea: ${prompt}`,
      userBackground ? `Founder background: ${userBackground}` : "",
      url ? `Website/domain: ${url}` : "",
      role ? `Founder role: ${role}` : "",
    ].filter(Boolean);
    if (ideaResearch) {
      foundationParts.push(`Competitors: ${ideaResearch.competitors.join(", ")}`);
      foundationParts.push(`Market size: ${ideaResearch.marketSize}`);
      foundationParts.push(`Research summary: ${ideaResearch.summary}`);
    }
    await ingestMemory({
      content: foundationParts.join("\n"),
      containerTag: companyTag(projectId),
      projectId,
      userId,
      customId: `foundation_${projectId}`,
      dedupeKey: `foundation_${projectId}`,
      metadata: { type: "company_foundation" },
    });
  } catch (err) {
    await emitP("init_company", "failed", `Company init failed: ${String(err)}`, "error");
    throw err;
  }

  // Steps 6 & 7: Mission + Market research — run in parallel for speed
  let missionText = "";
  let missionSummary = "";
  let competitors: string[] = [];

  const missionPromise = (async () => {
    await emitP("mission", "running", "Writing mission & strategy document...");
    try {
      await emitP("mission", "running", "Researching industry benchmarks...");
      const missionKeyInsights: string[] = [];
      if (ideaResearch) {
        missionKeyInsights.push(`Known competitors: ${ideaResearch.competitors.join(", ")}`);
        missionKeyInsights.push(`Market size: ${ideaResearch.marketSize}`);
        missionKeyInsights.push(`Market timing: ${ideaResearch.timing}`);
        if (ideaResearch.summary) missionKeyInsights.push(`Market context: ${ideaResearch.summary}`);
      }
      await emitP("mission", "running", "Generating mission document with market context...");
      const mission = await generateMission(
        prompt,
        {
          companyName,
          companyDescription: prompt,
          tagline,
          keyInsights: missionKeyInsights.length > 0 ? missionKeyInsights : undefined,
        },
        userBackground
      );
      const missionContent = mission.content;
      missionText = missionContent.slice(0, 300);
      missionSummary = missionContent.slice(0, 600);
      await db`INSERT INTO documents (project_id, type, title, content, metadata) VALUES (${projectId}, 'mission', ${mission.title}, ${missionContent}, ${JSON.stringify(mission.metadata)}::jsonb)`;
      await setCompanyMemory(projectId, "mission", missionText);
      await ingestMemory({
        content: [
          `Mission document for ${companyName}`,
          `Summary: ${summarizeContentForMemory(missionContent, 900)}`,
        ].join("\n"),
        containerTag: companyTag(projectId),
        dedupeKey: `mission_${projectId}`,
        projectId,
        userId,
        customId: `mission_${projectId}`,
        metadata: { type: "mission_document" },
      });
      await emitP("mission", "completed", "Mission document generated", "success");
    } catch (err) {
      await emitP("mission", "failed", `Mission failed: ${String(err)}`, "error");
    }
  })();

  const marketResearchPromise = (async () => {
    await emitP("market_research", "running", "Generating targeted research queries...");
    try {
      await emitP("market_research", "running", "Searching for competitors and market data...");
      const research = await generateMarketResearch(prompt, {
        companyName,
        companyDescription: prompt,
        tagline,
        mission: undefined, // Skip mission dependency to enable parallelism
        competitors: undefined,
        keyInsights: undefined,
      }, { mode: "onboarding", companyUrl: url });
      const metadata = research.metadata;
      competitors = metadata.competitors?.map((c) => c.name) || [];
      await emitP("market_research", "running", `Found ${competitors.length} competitors`, "success");

      await db`INSERT INTO documents (project_id, type, title, content, metadata) VALUES (${projectId}, 'market_research', ${research.title}, ${research.content}, ${JSON.stringify(metadata)}::jsonb)`;
      await setCompanyMemory(projectId, "competitors", competitors);
      await setCompanyMemory(projectId, "keyInsights", metadata.gaps || []);
      await ingestMemory({
        content: [
          `Market research for ${companyName}`,
          metadata.targetMarketSize ? `Market Size: ${metadata.targetMarketSize}` : "",
          metadata.competitors?.length ? `Competitors: ${metadata.competitors.map((item) => item.name).slice(0, 5).join(", ")}` : "",
          metadata.gaps?.length ? `Key Gaps: ${metadata.gaps.slice(0, 4).join(" | ")}` : "",
          metadata.keyTrends?.length ? `Key Trends: ${metadata.keyTrends.slice(0, 4).join(" | ")}` : "",
          `Summary: ${summarizeContentForMemory(research.content, 900)}`,
        ].filter(Boolean).join("\n"),
        containerTag: companyTag(projectId),
        dedupeKey: `market_research_${projectId}`,
        projectId,
        userId,
        customId: `market_research_${projectId}`,
        metadata: { type: "market_research" },
      });
      await emitP("market_research", "completed", `${competitors.length} competitors, ${metadata.gaps?.length || 0} gaps identified`, "success");
    } catch (err) {
      await emitP("market_research", "failed", `Research failed: ${String(err)}`, "error");
    }
  })();

  await Promise.all([missionPromise, marketResearchPromise]);

  // Step 8: Build landing page (template-based: AI generates JSON content, template builds HTML)
  await emitP("landing_page", "running", "Researching competitor landing pages...");
  let landingHtml = "";
  try {
    const { generateLandingPage } = await import("@/lib/ai/website-builder/landing-page-builder");

    // Pass mission + market research context for better hero copy and section content
    const memory = {
      companyDescription: prompt,
      mission: missionSummary || missionText || undefined,
      competitors: competitors.length ? competitors : undefined,
      keyInsights: ideaResearch
        ? [
          `Market size: ${ideaResearch.marketSize}`,
          `Competitive landscape: ${ideaResearch.summary || ""}`,
        ].filter(Boolean)
        : undefined,
    };
    await emitP("landing_page", "running", "Generating landing page design...");

    // During onboarding, generate pricing sections visually but DON'T provision
    // Stripe checkout URLs — the user hasn't set up payments yet. Pricing buttons
    // will default to mailto: links. Users can enable checkout later from the dashboard.
    landingHtml = await generateLandingPage(prompt, memory, slug, companyName, tagline);

    await db`UPDATE projects SET landing_page_html = ${landingHtml}, landing_page_published = TRUE WHERE id = ${projectId}`;
    await db`INSERT INTO pages (project_id, slug, title, html, published) VALUES (${projectId}, 'index', ${companyName}, ${landingHtml}, TRUE) ON CONFLICT (project_id, slug) DO UPDATE SET html = ${landingHtml}, published = TRUE, updated_at = NOW()`;

    // Multi-page generation skipped during onboarding — only landing page is created.
    // Additional pages (about, contact, pricing) can be added later from the dashboard.

    const pageUrl = `https://${slug}.${companyDomain}`;
    await setCompanyMemory(projectId, "landingPageUrl", pageUrl);

    // If marketplace was provisioned, generate Stripe Connect onboarding link
    const [projectAfterLanding] = await db`SELECT marketplace_enabled FROM projects WHERE id = ${projectId}`;
    if (projectAfterLanding?.marketplace_enabled) {
      try {
        const { createConnectManagementLink } = await import("@/lib/marketplace");
        const connectLink = await createConnectManagementLink(userId);
        await setCompanyMemory(projectId, "stripeConnectUrl", connectLink.url);
        await emitP("landing_page", "completed", `Live at ${pageUrl} — pricing enabled`, "success", { url: pageUrl, marketplaceEnabled: true });
      } catch (connectErr) {
        console.error("Stripe Connect link generation failed (non-blocking):", connectErr);
        await emitP("landing_page", "completed", `Live at ${pageUrl}`, "success", { url: pageUrl });
      }
    } else {
      await emitP("landing_page", "completed", `Live at ${pageUrl}`, "success", { url: pageUrl });
    }

    await ingestMemory({
      content: `Landing page built and published at ${pageUrl}. The website showcases ${companyName} and its value proposition.${projectAfterLanding?.marketplace_enabled ? " Pricing plans and checkout are live." : ""}`,
      containerTag: companyTag(projectId),
      projectId,
      userId,
      customId: `landing_page_${projectId}`,
      dedupeKey: `landing_page_${projectId}`,
      metadata: { type: "landing_page", url: pageUrl },
    });
  } catch (err) {
    await emitP("landing_page", "failed", `Landing page failed: ${String(err)}`, "error");
  }

  // Step 9: Post launch tweet from platform account (@tryarthaHQ)
  let tweetUrl: string | undefined;
  try {
    const { getTwitterAccountStatus, postCompanyLaunchTweet, postLaunchTweetReply } = await import("@/lib/twitter");
    const pageUrl = `https://${slug}.${companyDomain}`;
    const oneLiner = ideaResearch?.summary
      ? ideaResearch.summary.split(".")[0].trim() + "."
      : tagline;

    const twitterStatus = await getTwitterAccountStatus({ validate: true });
    if (!twitterStatus.appConfigured) {
      await db`
        UPDATE projects
        SET tweet_setup_status = 'skipped',
            tweet_setup_error = 'Twitter app credentials are missing.'
        WHERE id = ${projectId}
      `;
      await emitP("tweet_launch", "skipped", "Twitter app credentials missing — skipped", "info");
      throw new Error("__TWITTER_SKIP__");
    }

    if (!twitterStatus.connected) {
      const reason = twitterStatus.connectionError || "Twitter platform account is not configured.";
      await db`
        UPDATE projects
        SET tweet_setup_status = 'skipped',
            tweet_setup_error = ${reason}
        WHERE id = ${projectId}
      `;
      await emitP("tweet_launch", "skipped", `Twitter platform account unavailable — ${reason}`, "info");
      throw new Error("__TWITTER_SKIP__");
    }

    const posted = await postCompanyLaunchTweet({
      companyName,
      tagline,
      oneLiner,
      landingPageUrl: pageUrl,
    });

    if (posted) {
      tweetUrl = posted.tweetUrl;
      await db`UPDATE projects SET first_tweet_url = ${tweetUrl} WHERE id = ${projectId}`;
      await db`
        UPDATE projects
        SET tweet_setup_status = 'configured',
            tweet_setup_error = NULL
        WHERE id = ${projectId}
      `;
      // Save tweet to platform DB tweets table
      await db`INSERT INTO tweets (project_id, tweet_id, tweet_url, content, status, posted_at) VALUES (${projectId}, ${posted.tweetId}, ${posted.tweetUrl}, ${posted.text}, 'posted', NOW())`;
      await setCompanyMemory(projectId, "firstTweetUrl", tweetUrl);
      await emitP("tweet_launch", "completed", `Tweet posted: ${tweetUrl}`, "success", { tweetUrl });

      // Post a reply to the launch tweet with more company details
      try {
        const reply = await postLaunchTweetReply({
          inReplyToTweetId: posted.tweetId,
          launchTweetText: posted.text,
          companyName,
          tagline,
          oneLiner,
          landingPageUrl: pageUrl,
        });
        if (reply) {
          await db`INSERT INTO tweets (project_id, tweet_id, tweet_url, content, status, posted_at) VALUES (${projectId}, ${reply.tweetId}, ${reply.tweetUrl}, ${reply.text}, 'posted', NOW())`;
          await emitP("tweet_launch", "completed", `Reply posted: ${reply.tweetUrl}`, "success", { replyTweetUrl: reply.tweetUrl });
        }
      } catch {
        // Non-fatal: the main launch tweet was already posted successfully.
      }
    } else {
      await db`
        UPDATE projects
        SET tweet_setup_status = 'skipped',
            tweet_setup_error = 'Twitter platform account is not configured.'
        WHERE id = ${projectId}
      `;
      await emitP("tweet_launch", "skipped", "Twitter platform account not configured — skipped", "info");
    }
  } catch (err) {
    if (String(err) === "Error: __TWITTER_SKIP__") {
      // Status already persisted and event already emitted above.
    } else {
      await db`
        UPDATE projects
        SET tweet_setup_status = 'failed',
            tweet_setup_error = ${String(err)}
        WHERE id = ${projectId}
      `;
      await emitP("tweet_launch", "failed", `Tweet failed: ${String(err)}`, "error");
    }
  }

  // Step 10: Setup company email (Postmark)
  await emitP("email_setup", "running", `Configuring ${companyEmail}...`);
  try {
    const { ensureCompanyEmailAddressReady, isPostmarkConfigured } = await import("@/lib/postmark");

    // Early check: skip immediately if Postmark isn't configured at all
    if (!isPostmarkConfigured("company")) {
      await db`UPDATE projects SET company_email = NULL WHERE id = ${projectId}`;
      await db`
        UPDATE projects
        SET email_setup_status = 'skipped',
            email_setup_error = 'Postmark company server token not configured'
        WHERE id = ${projectId}
      `;
      await setCompanyMemory(projectId, "emailConfigured", false);
      await setCompanyMemory(projectId, "companyEmail", null);
      await emitP("email_setup", "skipped", "Postmark not configured — skipped", "info");
      throw new Error("__EMAIL_SKIP__");
    }

    const emailSetup = await ensureCompanyEmailAddressReady();

    if (!emailSetup.ok) {
      await db`UPDATE projects SET company_email = NULL WHERE id = ${projectId}`;
      await db`
        UPDATE projects
        SET email_setup_status = ${emailSetup.status},
            email_setup_error = ${emailSetup.reason}
        WHERE id = ${projectId}
      `;
      await setCompanyMemory(projectId, "emailConfigured", false);
      await setCompanyMemory(projectId, "companyEmail", null);
      await emitP("email_setup", "skipped", `Email setup skipped: ${emailSetup.reason}`, "info");
    } else {
      await db`UPDATE projects SET company_email = ${companyEmail} WHERE id = ${projectId}`;
      await db`
        UPDATE projects
        SET email_setup_status = 'configured',
            email_setup_error = NULL
        WHERE id = ${projectId}
      `;
      await setCompanyMemory(projectId, "emailConfigured", true);
      await setCompanyMemory(projectId, "companyEmail", companyEmail);
      await ingestMemory({
        content: `Company email configured: ${companyEmail}. Can send and receive emails for outreach, digests, and task replies.`,
        containerTag: companyTag(projectId),
        projectId,
        userId,
        customId: `email_setup_${projectId}`,
        dedupeKey: `email_setup_${projectId}`,
        metadata: { type: "email_setup", email: companyEmail },
      });
      await emitP("email_setup", "completed", `Email ready: ${companyEmail}`, "success", { email: companyEmail });
    }
  } catch (err) {
    if (String(err) === "Error: __EMAIL_SKIP__") {
      // Already handled above — early skip due to missing Postmark config.
    } else {
      await db`UPDATE projects SET company_email = NULL WHERE id = ${projectId}`;
      await db`
        UPDATE projects
        SET email_setup_status = 'failed',
            email_setup_error = ${String(err)}
        WHERE id = ${projectId}
      `;
      await setCompanyMemory(projectId, "emailConfigured", false);
      await setCompanyMemory(projectId, "companyEmail", null);
      await emitP("email_setup", "failed", `Email setup failed: ${String(err)}`, "error");
    }
  }

  // Step 11: Create GitHub repo
  await emitP("github_repo", "running", "Creating code repository...");
  let repoFullName = "";
  try {
    const { createCompanyRepo } = await import("@/lib/github");
    const repo = await createCompanyRepo(slug);
    repoFullName = repo.fullName;
    await db`
      UPDATE projects
      SET github_repo_url = ${repo.repoUrl},
          github_repo_full_name = ${repoFullName}
      WHERE id = ${projectId}
    `;
    await emitP(
      "github_repo",
      "completed",
      `Repo created: ${repoFullName}`,
      "success",
      { repoUrl: repo.repoUrl }
    );
  } catch (err) {
    await emitP("github_repo", "failed", `Repo creation failed: ${String(err)}`, "error");
  }

  // Step 12: Setup Cloudflare Pages BEFORE pushing so the GitHub webhook is in place
  let cloudflareSetupOk = false;
  if (repoFullName && landingHtml) {
    await emitP("cloudflare_setup", "running", "Connecting to Cloudflare Pages...");
    try {
      const { setupCloudflarePages } = await import("@/lib/cloudflare");
      const githubOrg = process.env.GITHUB_ORG || "artha-companies";
      await setupCloudflarePages(slug, githubOrg);
      cloudflareSetupOk = true;
      await emitP("cloudflare_setup", "running", "Cloudflare Pages connected");
    } catch (err) {
      await db`UPDATE projects SET cloudflare_setup_status = 'failed', cloudflare_setup_error = ${String(err)} WHERE id = ${projectId}`;
      await emitP("cloudflare_setup", "failed", `Cloudflare setup failed: ${String(err)}`, "error");
    }
  } else {
    await db`UPDATE projects SET cloudflare_setup_status = 'skipped', cloudflare_setup_error = 'Skipped (no repo or no landing page)' WHERE id = ${projectId}`;
    await emitP("cloudflare_setup", "skipped", "Skipped (no repo or no landing page)", "info");
  }

  // Step 12b: Push website to repo (triggers Cloudflare auto-deploy via webhook)
  let pushOk = false;
  if (repoFullName && landingHtml) {
    await emitP("push_website", "running", "Deploying website to repository...");
    try {
      const { pushWebsite } = await import("@/lib/github");
      await pushWebsite(repoFullName, landingHtml, "", {
        slug,
        companyName,
        tagline,
        domain: `${slug}.${companyDomain}`,
        email: companyEmail,
        missionSummary,
      });

      pushOk = true;
      await emitP("push_website", "completed", "Website deployed to repo", "success");
    } catch (err) {
      await emitP("push_website", "failed", `Push failed: ${String(err)}`, "error");
    }
  } else {
    await emitP("push_website", "skipped", "Skipped (no repo or no landing page)", "info");
  }

  // Step 12c: Wait for Cloudflare deployment to finish
  // Only wait if both setup and push succeeded — otherwise the deployment can't exist
  if (cloudflareSetupOk && pushOk) {
    await emitP("cloudflare_setup", "running", "Deploying site to Cloudflare...");
    try {
      const { waitForDeployment } = await import("@/lib/cloudflare");
      const companyDomainEnv = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
      const siteUrl = `https://${slug}.${companyDomainEnv}`;
      const deployResult = await waitForDeployment(slug);
      if (deployResult === "success") {
        await db`UPDATE projects SET cloudflare_setup_status = 'configured', cloudflare_setup_error = NULL WHERE id = ${projectId}`;
        await emitP("cloudflare_setup", "completed", `Site is live at ${siteUrl}`, "success", { siteUrl });
      } else if (deployResult === "timeout") {
        await db`UPDATE projects SET cloudflare_setup_status = 'configured', cloudflare_setup_error = 'Deployment still in progress (timed out waiting)' WHERE id = ${projectId}`;
        await emitP("cloudflare_setup", "completed", `Site deployment in progress at ${siteUrl}`, "success", { siteUrl });
      } else {
        await db`UPDATE projects SET cloudflare_setup_status = 'failed', cloudflare_setup_error = 'Cloudflare deployment failed' WHERE id = ${projectId}`;
        await emitP("cloudflare_setup", "failed", `Cloudflare deployment failed for ${siteUrl}`, "error");
      }
    } catch (err) {
      await db`UPDATE projects SET cloudflare_setup_status = 'failed', cloudflare_setup_error = ${String(err)} WHERE id = ${projectId}`;
      await emitP("cloudflare_setup", "failed", `Deployment wait failed: ${String(err)}`, "error");
    }
  }

  // Step 13: Generate revenue-focused task queue
  await emitP("task_queue", "running", "Generating revenue-focused tasks...");
  try {
    const { buildTaskContext } = await import("@/lib/supermemory");
    const { runTaskGeneratorAgent } = await import("@/lib/agents/task-generator");
    const { VERTICAL_TEMPLATES } = await import("@/config/vertical-templates");

    const template = VERTICAL_TEMPLATES[verticalId];
    const templateTasks = template?.taskTemplates || [];

    const taskContext = await buildTaskContext({
      projectId,
      userId,
      taskDescription: "Generate high-impact revenue-driving tasks for this newly created company",
    });

    // Generate AI tasks (fewer if we have template tasks)
    const aiTaskCount = Math.max(2, 6 - templateTasks.length);
    const result = await runTaskGeneratorAgent({
      prompt: `Generate ${aiTaskCount} high-impact tasks for this newly created company. Prioritize in this order:
1. Tasks that DIRECTLY generate revenue (outreach to paying customers, setting up pricing, lead generation)
2. Tasks that build audience and pipeline (content, social, community posts)
3. Tasks that strengthen positioning (competitor analysis, landing page optimization)

The founder just launched — they need their first dollar FAST. Every task should be specific and executable by an AI agent.${templateTasks.length > 0 ? `\n\nNOTE: The following tasks are already planned, so generate DIFFERENT tasks that complement them:\n${templateTasks.map((t) => `- ${t.title}`).join("\n")}` : ""}`,
      context: taskContext,
      projectId,
      userId,
      metadata: { count: aiTaskCount, executionSource: "pipeline" },
    });

    // Merge: template tasks first (revenue-driving), then AI-generated tasks
    const allTasks = [
      ...templateTasks.map((t) => ({
        title: t.title,
        description: t.description,
        type: t.type,
        tag: t.tag,
        agent: t.agent,
        revenue_impact: t.revenue_impact,
      })),
      ...(result.tasksCreated || []),
    ];
    const tasks = allTasks.filter((t) => t.title && t.description);
    if (tasks.length === 0) {
      throw new Error("No tasks generated — both template and AI returned empty results");
    }
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      await db`INSERT INTO tasks (project_id, type, title, description, status, priority, prompt, is_recurring, source, tag, agent, revenue_impact)
        VALUES (${projectId}, ${t.type || "custom"}, ${t.title}, ${t.description}, 'queued', ${i + 1}, ${t.description}, TRUE, 'system', ${t.tag || null}, ${t.agent || null}, ${t.revenue_impact || null})`;
    }
    await db`UPDATE projects SET status = 'active', task_credits = 5 WHERE id = ${projectId}`;
    const taskSummary = tasks.map((t) => `- ${t.title}: ${t.description}`).join("\n");
    await ingestMemory({
      content: `Initial task queue created with ${tasks.length} revenue-focused tasks:\n${taskSummary}`,
      containerTag: companyTag(projectId),
      projectId,
      userId,
      customId: `initial_tasks_${projectId}`,
      dedupeKey: `initial_tasks_${projectId}`,
      metadata: { type: "task_queue" },
    });
    await emitP("task_queue", "completed", `${tasks.length} revenue-focused tasks queued`, "success", { tasksCreated: tasks.length });
  } catch (err) {
    await emitP("task_queue", "failed", `Task generation failed: ${String(err)}`, "error");
  }

  // Step 14: Send welcome email from agents@artha.run to founder
  await emitP("welcome_email", "running", "Sending welcome email...");
  try {
    const { sendCompanyWelcome } = await import("@/lib/postmark");

    const queuedTasks = await db`
      SELECT title, description FROM tasks WHERE project_id = ${projectId} AND status = 'queued' ORDER BY priority ASC LIMIT 3
    `;

    const researchDocs = await db`
      SELECT content FROM documents WHERE project_id = ${projectId} AND type = 'market_research' ORDER BY created_at DESC LIMIT 1
    `;
    const researchSummary = researchDocs.length > 0
      ? (researchDocs[0].content as string).split("\n").filter((l: string) => l.trim()).slice(0, 2).join(" ").slice(0, 300)
      : ideaResearch?.summary || undefined;

    // Check if marketplace was provisioned and get Stripe Connect URL
    const [projectForEmail] = await db`SELECT marketplace_enabled FROM projects WHERE id = ${projectId}`;
    const { getCompanyMemory } = await import("@/lib/neon");
    const stripeConnectUrl = await getCompanyMemory(projectId, "stripeConnectUrl");

    await sendCompanyWelcome({
      slug,
      companyName,
      founderEmail: user.email as string,
      founderName: user.name as string | null,
      researchSummary,
      tweetUrl,
      tasks: queuedTasks.map((t: Record<string, unknown>) => ({
        title: t.title as string,
        description: (t.description as string)?.slice(0, 80),
      })),
      marketplaceEnabled: projectForEmail?.marketplace_enabled as boolean || false,
      stripeConnectUrl: stripeConnectUrl as string | undefined,
    });
    await emitP("welcome_email", "completed", `Welcome email sent to ${user.email}`, "success");
  } catch (err) {
    await emitP("welcome_email", "failed", `Email failed: ${String(err)}`, "error");
  }

  // Store build summary for shareable /built/{slug} page
  try {
    const buildEndTime = Date.now();
    const jobRows = await db`SELECT created_at FROM jobs WHERE id = ${jobId}`;
    const jobCreatedAt = jobRows.length > 0 ? new Date(jobRows[0].created_at as string).getTime() : buildEndTime - 60000;
    const buildDurationSeconds = Math.round((buildEndTime - jobCreatedAt) / 1000);

    const buildSummary = {
      companyName,
      tagline,
      slug,
      buildDurationSeconds,
      competitorsFound: competitors.length,
      tasksQueued: (await db`SELECT COUNT(*) FROM tasks WHERE project_id = ${projectId} AND status = 'queued'`)[0].count,
      builtAt: new Date().toISOString(),
    };

    await db`
      UPDATE projects
      SET memory = jsonb_set(COALESCE(memory, '{}'::jsonb), '{buildSummary}', ${JSON.stringify(buildSummary)}::jsonb)
      WHERE id = ${projectId}
    `;
  } catch (err) {
    console.error("Failed to store build summary:", err);
  }

  // Insert welcome chat message so the user sees an intro from the AI
  try {
    const siteUrl = `https://${slug}.${companyDomain}`;
    const welcomeContent = `Hey! I just finished setting up ${companyName} for you — your site is live at ${siteUrl} and your task queue is ready.\n\nI'm your AI chief of staff. Here are a few things I can help with right now:\n\n• Research your competitors and find gaps you can exploit\n• Write and send cold outreach emails to potential customers\n• Update your landing page copy and design\n• Generate content ideas and social media posts\n\nWhat would you like to tackle first?`;
    await db`
      INSERT INTO chat_messages (project_id, role, content, type, metadata)
      VALUES (${projectId}, 'assistant', ${welcomeContent}, 'chat', '{"source": "onboarding_welcome"}'::jsonb)
    `;
  } catch (err) {
    console.error("Failed to insert welcome chat message:", err);
  }

  await emitP("done", "completed", "Pipeline complete!", "success", { projectId, slug });
}

function stableHash(value: string): string {
  return createHash("sha256")
    .update(value.trim().toLowerCase())
    .digest("hex")
    .slice(0, 12);
}
