import type { AgentInput, AgentOutput } from "./types";
import { generateLandingPageContent, generateEditedLandingPageContent } from "@/lib/ai/website-builder/theme-generator";
import { buildLandingPageHtml, type PricingPlan } from "@/lib/ai/website-builder/website-template";
import { ensureFooter, validateLandingPage, cleanGeneratedHtml } from "@/lib/ai/website-builder/validation";
import type { ProjectMemory } from "@/lib/memory";
import { summarizeContentForMemory } from "@/lib/personalization";
import {
  normalizeGeneratedPricingPlans,
  shouldProvisionPricingCheckout,
  syncProjectPricingPlans,
  getActivePricingPlansForProject,
} from "@/lib/marketplace";
import { generateAgentCompletion, generateAgentCompletionStreaming } from "@/lib/ai/agent-model-router";

// ---------------------------------------------------------------------------
// Edit mode: direct HTML editing of an existing site
// ---------------------------------------------------------------------------

const ARTHA_SDK_DOCS = `
ARTHA SDK (window.artha):
The site has a built-in SDK injected as window.artha. Use it to build full interactive apps — auth, databases, payments, credits — all from the client side.

artha.auth.signup(email, password, name) → Promise<{user, token}>  // Creates account, stores session
artha.auth.signin(email, password) → Promise<{user, token}>        // Login, stores session
artha.auth.signout() → Promise<void>                               // Logout, clears session
artha.auth.getUser() → Promise<user|null>                          // Get current logged-in user (cached)
artha.auth.getToken() → string|null                                // Get stored bearer token
artha.auth.resendVerification() → Promise                          // Resend email verification
artha.auth.onAuthChange(callback) → unsubscribe                   // Listen for login/logout events

artha.data.list(table, {limit, offset, sort, order}) → Promise<{rows}>  // List rows (auto-scoped to user)
artha.data.get(table, id) → Promise<{row}>                              // Get single row
artha.data.insert(table, data, {creditCost}) → Promise<{row}>           // Insert row (optional credit deduction)
artha.data.update(table, id, data) → Promise<{row}>                     // Update row
artha.data.delete(table, id) → Promise                                  // Delete row

artha.credits.getBalance() → Promise<{credits, transactions}>     // Check credit balance
artha.credits.use(amount, reason) → Promise<{credits}>             // Deduct credits (402 if insufficient)

artha.payments.checkout(planPublicId) → Promise                    // Redirects to Stripe checkout

artha.ai.complete(prompt, {system, creditCost, maxTokens, temperature, imageUrl}) → Promise<{result, credits}>
  // Call AI from the client side (proxied through backend — no API keys exposed)
  // creditCost defaults to 1. Credits are deducted before the AI call and refunded on failure.
  // imageUrl: pass a file URL (from artha.files.getUrl) for vision/image analysis

artha.files.upload(file) → Promise<{id, filename, contentType, sizeBytes, url}>
  // Upload a File object (from <input type="file">). Max 5MB.
  // Accepts: images (jpeg/png/gif/webp/svg), PDF, text, CSV, JSON
artha.files.uploadBase64(base64, filename, contentType) → Promise<{id, ...}>  // Upload raw base64
artha.files.list() → Promise<{files}>                              // List user's uploaded files
artha.files.getUrl(fileId) → string                                // Get direct URL to serve a file

IMPORTANT SDK NOTES:
- Auth state persists in localStorage. Token is auto-attached to all requests.
- data.insert with creditCost atomically deducts credits before inserting — use for AI features, premium actions, etc.
- If a table has a site_user_id column, queries are automatically scoped to the logged-in user's rows only.
- The database manager agent creates custom tables. Assume any table the user mentions exists or will be created.
- All API errors throw with error.status and error.data.
- On 401, the SDK auto-clears the session and fires onAuthChange(null).
- For AI-powered features (image analysis, text generation, chatbots), use artha.ai.complete(). It deducts user credits automatically.
- For file uploads, use artha.files.upload(file) with a File from an <input type="file">. Then pass artha.files.getUrl(id) to artha.ai.complete() as imageUrl for vision analysis.
`;

// ── Mandatory rules injected into every HTML-generating prompt ──────────────
// These rules are non-negotiable and prevent the most common blank-page bugs.
export const WEBSITE_BUILD_RULES = `
## MANDATORY HTML OUTPUT RULES — violations cause blank pages

### 1. Runtime dependencies — load every library you use
If the page uses React/JSX:
- Load React, ReactDOM, AND Babel standalone via CDN BEFORE the app script.
- The app <script> MUST have type="text/babel".
- Use ReactDOM.createRoot (React 18), NOT the deprecated ReactDOM.render.

Minimum boilerplate for React + Tailwind:
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script type="text/babel">
  // ALL React/JSX code goes here — NEVER in a plain <script> tag
</script>

### 2. JSX ONLY inside type="text/babel" — NEVER in plain <script>
Putting JSX (e.g. return <div>) inside a regular <script> tag causes:
  Uncaught SyntaxError: Unexpected token '<'
This is the #1 cause of blank pages. There are NO exceptions to this rule.

### 3. HTML entities in JSX — use raw characters
In JSX (inside type="text/babel"), do NOT use &amp; or &amp;amp;.
Use the raw character: & not &amp;, > not &gt;, etc.

### 4. Complete every component — never truncate
Every function component MUST have complete, valid JSX.
If you are running low on output space, SIMPLIFY — never cut off mid-tag or mid-attribute.
A minimal valid component is always better than a half-written complex one.

### 5. Self-audit before output
- Every library used in code has a <script> or <link> loading it above.
- All JSX is inside <script type="text/babel">.
- Every <div>, <section>, ( and { is closed.
- No &amp;amp; anywhere. No ReactDOM.render() (use createRoot).
- The LAST component (footer) is complete — it's the most common truncation victim.
`;

const EDIT_SYSTEM_PROMPT = `You are an expert web developer. You receive the current HTML of a live website and a user request. Edit the site to fulfill the request.

${WEBSITE_BUILD_RULES}
TECH STACK:
- Prefer pure HTML/CSS with vanilla JavaScript for new pages. If the existing site uses React + Babel CDN, match that pattern — keep ALL JSX inside <script type="text/babel">.
- Keep all existing inline <style> blocks and class attributes. Use class= for vanilla HTML, className= only inside JSX.
- Tailwind CSS may be present via CDN — preserve it if it exists; otherwise use inline styles.
- Forms POST to formCaptureUrl (already in the existing code). The API accepts JSON fields and stores them in the contacts table.
- The site has a built-in SDK (window.artha) for auth, data, payments, credits, and file uploads. Use it when building interactive features.
${ARTHA_SDK_DOCS}
OUTPUT RULES:
1. Return COMPLETE HTML — not diffs, not snippets. Start with <!DOCTYPE html>.
2. PRESERVE everything the user did NOT ask to change. Do NOT remove, shorten, or simplify existing content.
3. Make TARGETED changes only. Match the existing design language (colors, fonts, spacing).
4. Do NOT wrap in markdown code fences — return raw HTML.

MULTI-PAGE:
- You can create new pages. Separate each with: <!-- NEW_PAGE: {slug} --> before its HTML.
- The first HTML block is always the updated index page (return it even if unchanged).
- New pages should be standalone HTML matching the site's theme.
- Add navigation links between pages as appropriate.

You are fully autonomous. Build exactly what the user needs.`;

interface EditResult {
  pages: Array<{ slug: string; html: string }>;
}

function parseEditOutput(raw: string, indexSlug: string): EditResult {
  const cleaned = cleanGeneratedHtml(raw);
  const pages: Array<{ slug: string; html: string }> = [];

  // Check for multi-page delimiter
  const delimiter = /<!--\s*NEW_PAGE:\s*(\S+)\s*-->/g;
  const parts = cleaned.split(delimiter);

  if (parts.length <= 1) {
    // Single page output — this is the updated index page
    pages.push({ slug: indexSlug, html: cleaned });
  } else {
    // First part is the updated index page
    const indexHtml = parts[0].trim();
    if (indexHtml) {
      pages.push({ slug: indexSlug, html: indexHtml });
    }

    // Remaining parts alternate: slug, html, slug, html, ...
    for (let i = 1; i < parts.length; i += 2) {
      const pageSlug = parts[i]?.trim();
      const pageHtml = parts[i + 1]?.trim();
      if (pageSlug && pageHtml) {
        pages.push({ slug: pageSlug, html: cleanGeneratedHtml(pageHtml) });
      }
    }
  }

  return { pages };
}

async function editExistingWebsite(args: {
  existingHtml: string;
  existingPages: Array<{ slug: string; title: string; html: string }>;
  editRequest: string;
  companyContext: string;
  slug: string;
  onToken?: (chunk: string) => void;
}): Promise<EditResult> {
  const pageList = args.existingPages.length > 0
    ? `\n\nEXISTING ADDITIONAL PAGES:\n${args.existingPages.map((p) => `- /${p.slug} (${p.title})`).join("\n")}`
    : "";

  const userPrompt = `EXISTING WEBSITE HTML:
${args.existingHtml}
${pageList}

COMPANY CONTEXT:
${args.companyContext}

USER REQUEST:
${args.editRequest}`;

  const raw = args.onToken
    ? await generateAgentCompletionStreaming("website_builder", EDIT_SYSTEM_PROMPT, userPrompt, args.onToken, {
        maxTokens: 32000,
        temperature: 0.3,
      })
    : await generateAgentCompletion("website_builder", EDIT_SYSTEM_PROMPT, userPrompt, {
        maxTokens: 32000,
        temperature: 0.3,
      });

  if (!raw || raw.trim().length < 100) {
    console.error("[website_builder] edit returned empty/short output:", JSON.stringify(raw?.slice(0, 200)));
    throw new Error("Model returned empty response. Please try again.");
  }
  if (!raw.includes("<!DOCTYPE") && !raw.includes("<html")) {
    console.error("[website_builder] edit output missing HTML structure. First 500 chars:", raw.slice(0, 500));
    throw new Error("Model did not return valid HTML. Please try again.");
  }

  return parseEditOutput(raw, args.slug);
}

// ---------------------------------------------------------------------------
// Main agent runner
// ---------------------------------------------------------------------------

export async function runWebsiteBuilderAgent(input: AgentInput): Promise<AgentOutput> {
  try {
    const progress = input.onProgress || (() => {});
    const slug = (input.metadata?.slug as string) || input.projectId;
    const companyName = (input.metadata?.companyName as string) || slug;
    const tagline = input.metadata?.tagline as string | undefined;
    const existingHtml = input.metadata?.existingHtml as string | undefined;
    const existingPages = (input.metadata?.existingPages as Array<{ slug: string; title: string; html: string }>) || [];

    const memory = parseMemoryFromContext(input.context);
    const companyEmail = `${slug}@${process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com"}`;

    // ── Edit mode: existing site ──
    if (existingHtml) {
      // Detect if the user wants a new page added — only then fall back to direct HTML editing
      const wantsNewPage = /\b(new page|add(?: a)? page|create(?: a)? page|additional page|contact page|about page|pricing page|blog page|faq page|terms page|privacy page)\b/i.test(input.prompt);

      if (wantsNewPage) {
        // Multi-page request: direct HTML editing (can add new pages)
        progress("Adding new page...");
        const editResult = await editExistingWebsite({
          existingHtml,
          existingPages,
          editRequest: input.prompt,
          companyContext: input.context,
          slug,
          onToken: input.onToken,
        });

        const validatedPages: Array<{ slug: string; title: string; html: string }> = [];
        for (const page of editResult.pages) {
          const validation = validateLandingPage(page.html);
          if (!validation.valid) {
            throw new Error(`Edited page "${page.slug}" failed validation: ${validation.errors.join("; ")}`);
          }
          const html = ensureFooter(page.html, companyEmail);
          const title = page.slug === slug
            ? `${companyName} Website`
            : `${companyName} — ${page.slug}`;
          validatedPages.push({ slug: page.slug, title, html });
        }

        let pricingCheckoutConfigured = false;
        const existingPlans = await getActivePricingPlansForProject(input.projectId);
        if (existingPlans.length > 0) pricingCheckoutConfigured = true;

        if (input.scratchpad) {
          input.scratchpad.write("website.slug", slug);
          input.scratchpad.write("website.companyName", companyName);
          input.scratchpad.write("website.pricingConfigured", pricingCheckoutConfigured);
        }

        return {
          success: true,
          agent: "website_builder",
          summary: `Website updated (${validatedPages.length} pages) and ready in preview.`,
          pages: validatedPages,
          supermemoryIngestions: [{
            content: [
              `Website edited for ${companyName}.`,
              `Edit: ${summarizeContentForMemory(input.prompt, 320)}`,
              `Pages: ${validatedPages.map((p) => p.slug).join(", ")}`,
            ].join("\n"),
            customId: `website_draft_${input.projectId}`,
            dedupeKey: `website_draft_${input.projectId}`,
            metadata: { type: "website_draft" },
          }],
          links: [],
        };
      }

      // ── Template-based edit: JSON → buildLandingPageHtml() (same as onboarding) ──
      // This guarantees structurally valid HTML every time — no blank pages, no broken output.
      progress("Updating website content...");

      // Extract readable text from existing HTML so AI knows what's currently on the site
      const existingText = existingHtml
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 2000);

      const content = await generateEditedLandingPageContent({
        companyName,
        companyPrompt: input.context,
        projectSlug: slug,
        memory: parseMemoryFromContext(input.context),
        tagline,
        editRequest: input.prompt,
        existingTextSummary: existingText || undefined,
      });

      // Wire up existing pricing checkout URLs if present
      let pricingCheckoutConfigured = false;
      const existingPlans = await getActivePricingPlansForProject(input.projectId);
      const hasExistingPlans = existingPlans.length > 0;

      const wantsPricingEdit = /\b(pricing|price|plan|plans|checkout|billing|subscription|monthly|annual)\b/i.test(input.prompt);
      if (wantsPricingEdit) {
        const pricingPlans = content.sections
          .filter((s) => s.type === "pricing" && s.plans?.length)
          .flatMap((s) => s.plans || []);

        if (pricingPlans.length > 0 && shouldProvisionPricingCheckout(input.prompt)) {
          const syncedPlans = await syncProjectPricingPlans({
            projectId: input.projectId,
            userId: input.userId,
            plans: pricingPlans,
          });
          const checkoutUrls = new Map(syncedPlans.map((plan) => [plan.slug, plan.checkoutUrl]));
          content.sections = content.sections.map((section) => {
            if (section.type !== "pricing" || !section.plans?.length) return section;
            return {
              ...section,
              plans: section.plans.map((plan) => {
                const normalized = normalizeGeneratedPricingPlans([plan as PricingPlan])[0];
                if (!normalized) return plan;
                const checkoutUrl = checkoutUrls.get(normalized.slug);
                if (!checkoutUrl) return plan;
                pricingCheckoutConfigured = true;
                return { ...plan, ctaHref: checkoutUrl };
              }),
            };
          });
        }
      } else if (hasExistingPlans) {
        const existingCheckoutUrls = new Map(existingPlans.map((p) => [p.slug, p.checkoutUrl]));
        content.sections = content.sections.map((section) => {
          if (section.type !== "pricing" || !section.plans?.length) return section;
          return {
            ...section,
            plans: section.plans.map((plan) => {
              const normalized = normalizeGeneratedPricingPlans([plan as PricingPlan])[0];
              if (!normalized) return plan;
              let checkoutUrl = existingCheckoutUrls.get(normalized.slug);
              if (!checkoutUrl) {
                const match = existingPlans.find((ep) => ep.name.toLowerCase() === normalized.name.toLowerCase());
                if (match) checkoutUrl = match.checkoutUrl;
              }
              if (!checkoutUrl) return plan;
              pricingCheckoutConfigured = true;
              return { ...plan, ctaHref: checkoutUrl };
            }),
          };
        });
      }

      progress("Building website...");
      const builtHtml = buildLandingPageHtml(content);
      const validation = validateLandingPage(builtHtml);
      if (!validation.valid) {
        throw new Error(`Template-built page failed validation: ${validation.errors.join("; ")}`);
      }
      const html = ensureFooter(builtHtml, companyEmail);

      if (input.scratchpad) {
        input.scratchpad.write("website.slug", slug);
        input.scratchpad.write("website.companyName", companyName);
        input.scratchpad.write("website.pricingConfigured", pricingCheckoutConfigured);
      }

      return {
        success: true,
        agent: "website_builder",
        summary: "Website updated and ready in preview.",
        pages: [{ slug, title: `${companyName} Website`, html }],
        supermemoryIngestions: [{
          content: [
            `Website edited for ${companyName}.`,
            `Edit: ${summarizeContentForMemory(input.prompt, 320)}`,
          ].join("\n"),
          customId: `website_draft_${input.projectId}`,
          dedupeKey: `website_draft_${input.projectId}`,
          metadata: { type: "website_draft" },
        }],
        links: [],
      };
    }

    // ── Initial generation mode: JSON → template ──
    progress("Designing page layout...");
    const content = await generateLandingPageContent({
      companyName,
      companyPrompt: input.prompt,
      projectSlug: slug,
      memory,
      tagline,
    });

    const pricingPlans = content.sections
      .filter((section) => section.type === "pricing" && section.plans?.length)
      .flatMap((section) => section.plans || []);

    let pricingCheckoutConfigured = false;

    // Check for existing pricing plans already synced to Stripe
    const existingPlans = await getActivePricingPlansForProject(input.projectId);
    const hasExistingPlans = existingPlans.length > 0;

    progress("Generating HTML and styling...");
    if (pricingPlans.length > 0 && shouldProvisionPricingCheckout(input.prompt)) {
      // User explicitly asked for pricing — sync new plans from AI output
      const syncedPlans = await syncProjectPricingPlans({
        projectId: input.projectId,
        userId: input.userId,
        plans: pricingPlans,
      });
      const checkoutUrls = new Map(syncedPlans.map((plan) => [plan.slug, plan.checkoutUrl]));

      content.sections = content.sections.map((section) => {
        if (section.type !== "pricing" || !section.plans?.length) {
          return section;
        }

        return {
          ...section,
          plans: section.plans.map((plan) => {
            const normalized = normalizeGeneratedPricingPlans([plan as PricingPlan])[0];
            if (!normalized) return plan;

            const checkoutUrl = checkoutUrls.get(normalized.slug);
            if (!checkoutUrl) return plan;

            pricingCheckoutConfigured = true;
            return {
              ...plan,
              ctaHref: checkoutUrl,
            };
          }),
        };
      });
    } else if (hasExistingPlans && pricingPlans.length > 0) {
      // AI generated a pricing section on rebuild and existing plans exist — wire existing checkout URLs
      const existingCheckoutUrls = new Map(existingPlans.map((p) => [p.slug, p.checkoutUrl]));

      content.sections = content.sections.map((section) => {
        if (section.type !== "pricing" || !section.plans?.length) {
          return section;
        }

        return {
          ...section,
          plans: section.plans.map((plan) => {
            const normalized = normalizeGeneratedPricingPlans([plan as PricingPlan])[0];
            if (!normalized) return plan;

            // Try matching by slug first, then by name similarity
            let checkoutUrl = existingCheckoutUrls.get(normalized.slug);
            if (!checkoutUrl) {
              const match = existingPlans.find(
                (ep) => ep.name.toLowerCase() === normalized.name.toLowerCase()
              );
              if (match) checkoutUrl = match.checkoutUrl;
            }
            if (!checkoutUrl) return plan;

            pricingCheckoutConfigured = true;
            return {
              ...plan,
              ctaHref: checkoutUrl,
            };
          }),
        };
      });
    }

    progress("Saving website draft...");
    const builtHtml = buildLandingPageHtml(content);
    const validation = validateLandingPage(builtHtml);
    if (!validation.valid) {
      throw new Error(`Template-built page failed validation: ${validation.errors.join("; ")}`);
    }

    const html = ensureFooter(builtHtml, companyEmail);

    // Write to scratchpad for downstream agents
    if (input.scratchpad) {
      input.scratchpad.write("website.slug", slug);
      input.scratchpad.write("website.companyName", companyName);
      input.scratchpad.write("website.pricingConfigured", pricingCheckoutConfigured);
      input.scratchpad.write(
        "website.sections",
        content.sections.map((s) => s.type).join(", "),
      );
    }

    return {
      success: true,
      agent: "website_builder",
      summary: pricingCheckoutConfigured
        ? "Website draft updated, checkout configured, and ready in preview."
        : "Website draft updated and ready in preview.",
      pages: [{ slug, title: `${companyName} Website`, html }],
      supermemoryIngestions: [{
        content: [
          `Website draft generated for ${companyName}.`,
          `Pricing checkout configured: ${pricingCheckoutConfigured}`,
          `Prompt summary: ${summarizeContentForMemory(input.prompt, 320)}`,
        ].join("\n"),
        customId: `website_draft_${input.projectId}`,
        dedupeKey: `website_draft_${input.projectId}`,
        metadata: { type: "website_draft" },
      }],
      links: [],
    };
  } catch (error) {
    return {
      success: false,
      agent: "website_builder",
      summary: "Website build failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function parseMemoryFromContext(context: string): ProjectMemory {
  return {
    companyDescription: extractField(context, "Company") || extractField(context, "Description") || "",
    mission: extractField(context, "Mission") || undefined,
    targetAudience: extractField(context, "Target Audience") || undefined,
    competitors: undefined,
    keyInsights: undefined,
  };
}

function extractField(context: string, field: string): string | undefined {
  const regex = new RegExp(`${field}:\\s*(.+?)(?:\\n|$)`, "i");
  const match = context.match(regex);
  return match?.[1]?.trim();
}
