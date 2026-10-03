/**
 * Generates a color theme + content plan for a landing page using a lightweight
 * AI call. This is a small JSON-only call (~500 tokens output) that produces the
 * structured data the template system needs — no HTML generation here.
 */

import { generateAgentCompletion, isRetryableProviderError } from "@/lib/ai/agent-model-router";
import type { ProjectMemory } from "@/lib/memory";
import type {
  LandingPageContent,
  SiteTheme,
  ThemeColors,
  HeroContent,
  CtaContent,
  Section,
  Testimonial,
  PricingPlan,
  FaqItem,
} from "./website-template";

interface ThemeGeneratorInput {
  companyName: string;
  companyPrompt: string;
  projectSlug: string;
  memory: ProjectMemory;
  tagline?: string;
  /** Force pricing section generation regardless of prompt keywords */
  includePricing?: boolean;
}

interface GeneratedSection {
  id: string;
  type: "features" | "how-it-works" | "benefits" | "early-access" | "testimonials" | "pricing" | "faq";
  layout?: "cards" | "alternating" | "list" | "numbered" | "bento";
  headline: string;
  subheadline?: string;
  items?: Array<{ icon: string; title: string; description: string }>;
  testimonials?: Testimonial[];
  plans?: PricingPlan[];
  faqs?: FaqItem[];
}

interface GeneratedContent {
  mode: "light" | "dark";
  colors: ThemeColors;
  fontFamily: "Inter" | "Poppins" | "Space Grotesk" | "DM Sans" | "Outfit";
  borderRadius: "0.5rem" | "0.75rem" | "1rem" | "1.25rem";
  tagline: string;
  hero: HeroContent & { layout?: "centered" | "split" | "minimal" | "left" | "bold-statement" | "diagonal" | "spotlight" | "editorial" };
  cta: CtaContent & { layout?: "gradient" | "minimal" | "outline" };
  sections: GeneratedSection[];
}

type NormalizedPlanPeriod = "mo" | "yr" | "once";

function requestNeedsPricing(companyPrompt: string): boolean {
  return /\b(pricing|price|plan|plans|tier|tiers|checkout|billing|subscription|monthly|annual|yearly)\b/i.test(
    companyPrompt
  );
}

const SYSTEM_PROMPT = `You are an elite branding and web design expert. Given a company description, you must ANALYZE the company's industry, target audience, and brand personality, then SELECT the best-fitting design system from the options below.

YOUR JOB: Study what the company does, who its customers are, and what emotion the site should evoke — then pick the design choices that best serve THAT specific business. Every choice must be intentional and justified by the company's identity.

═══ DESIGN DECISION FRAMEWORK ═══

STEP 1 — CHOOSE MODE based on industry:
- "dark": tech/dev tools, cybersecurity, gaming, AI/ML, crypto, music, nightlife, premium luxury
- "light": healthcare, education, food, wellness, children, real estate, finance, legal, non-profit, e-commerce

STEP 2 — CHOOSE FONT based on brand personality:
- "Space Grotesk": technical, developer-facing, futuristic, precise, geometric — best for dev tools, APIs, robotics, aerospace
- "Poppins": friendly, warm, approachable, rounded — best for consumer apps, kids, food, wellness, lifestyle, beauty
- "DM Sans": clean, professional, modern, trustworthy — best for SaaS, healthcare, finance, consulting, B2B
- "Outfit": bold, energetic, high-impact, geometric — best for fitness, gaming, music, startups, creative agencies
- "Inter": neutral, enterprise, reliable, universal — best for marketplaces, legal, real estate, infrastructure, research

STEP 3 — CHOOSE HERO LAYOUT based on what the company needs to communicate:
- "bold-statement": Full-screen gradient background, oversized text, inverted CTA. USE WHEN the company has a strong, confident value prop that speaks for itself. Best for: brands with a clear one-liner, luxury, bold consumer products.
- "editorial": Magazine-style, asymmetric, tagline badge top-left, headline left-aligned, subheadline + CTA in a row. USE WHEN the brand is premium, professional, or content-driven. Best for: agencies, consulting, media, architecture.
- "spotlight": Centered with dramatic radial glow, pill badge above headline. USE WHEN launching a product or creating excitement. Best for: product launches, tech companies, AI tools, new platforms.
- "diagonal": Angled gradient slice on right, left-aligned content. USE WHEN the brand is dynamic and modern. Best for: marketing agencies, startups, sports, logistics.
- "split": Two-column, text left + abstract visual right. USE WHEN showing features/capabilities alongside messaging. Best for: SaaS with many features, dev tools, platforms.
- "centered": Classic centered hero with floating decorative orbs. USE WHEN simplicity and trust matter most. Best for: non-profits, community, simple products.
- "minimal": Ultra-clean, no decorations, shorter height. USE WHEN elegance and restraint are the brand identity. Best for: luxury, fashion, minimalist products, premium services.
- "left": Left-aligned with floating orbs. USE WHEN the brand is story-driven or narrative-focused. Best for: personal brands, storytelling, newsletters, podcasts.

STEP 4 — CHOOSE CTA LAYOUT:
- "gradient": Bold, high-contrast gradient card. USE WHEN you want maximum conversion pressure. Best for: SaaS, products with clear pricing.
- "minimal": Subtle, text-focused. USE WHEN the brand is understated or premium. Best for: luxury, consulting, agencies.
- "outline": Bordered card with transparent background. USE WHEN you want a softer touch. Best for: community, education, non-profits.

STEP 5 — CHOOSE SECTION LAYOUT for features/how-it-works/benefits:
- "cards": Grid layout. Best for: products with 3-4 equal features to showcase.
- "alternating": Zigzag left-right. Best for: step-by-step processes, detailed features.
- "list": Vertical stack. Best for: simple feature lists, minimal designs.
- "numbered": Numbered steps with spacing. Best for: how-it-works, processes, onboarding flows.

STEP 6 — CHOOSE COLORS based on industry:
- Healthcare/medical → clean blues (#0EA5E9), whites, soft greens (#10B981)
- Finance/fintech → deep navy (#1E3A5F), gold (#D4A843), slate
- Food/restaurant → warm oranges (#EA580C), reds (#DC2626), earthy tones
- Education → friendly greens (#22C55E), sky blues (#38BDF8), warm yellows
- Creative/design → bold contrasts, unique accent combos
- Tech/SaaS → modern teals (#14B8A6), indigos (#6366F1), electric blues (NOT always purple)
- Wellness/fitness → calming greens (#86EFAC), soft corals (#FB923C), naturals
- E-commerce/retail → brand-appropriate, high-contrast CTAs
- Security/crypto → dark backgrounds with neon accents (green #00FF88, cyan #00D4FF)
- Real estate → warm whites, forest green (#166534), warm browns
- Legal/consulting → charcoal (#374151), navy (#1E40AF), understated
- Gaming/entertainment → vivid neons, purples (#7C3AED), deep blacks
- Beauty/cosmetics → soft pink (#EC4899), rose gold, blush tones
- For anything else → pick a palette that genuinely reflects the brand personality
- NEVER default to purple/violet — it must be earned by the brand identity

COLOR RULES:
- All colors must be valid hex codes
- primary, primaryLight, primaryDark, accent should ALL be different hues — not just lighter/darker versions of the same color

CONTENT RULES:
- Hero headline: punchy, under 10 words
- Hero subheadline: 1-2 sentences
- Tagline: under 10 words
- Generate 2-4 sections. Mix section types — do NOT use only features. Choose from: features, how-it-works, benefits, early-access, testimonials, pricing, faq
- NO fake numbers, NO fake testimonials, NO made-up statistics
- Pricing generation rules for checkout compatibility:
  - If the user asks for pricing, plans, subscriptions, billing, checkout, monthly, or annual, a pricing section is REQUIRED
  - Pricing plans must be fixed-price plans only
  - DO NOT output "Contact us", "Custom", "Let's talk", usage-based pricing, seat-based pricing, metered pricing, or free-only pricing
  - price must be machine-readable like "$19", "$49", "$99", "$499"
  - period must be exactly one of: "mo", "yr", "once"
  - Use 1-3 plans maximum
  - Plan names must be short and clean
  - ctaText must be short, generic, and checkout-safe, like "Get started", "Choose plan", or "Buy now"
  - Choose believable pricing for the business model and target audience

Return ONLY valid JSON matching this schema:
{
  "mode": "light" | "dark",
  "colors": { "primary": "#hex", "primaryLight": "#hex", "primaryDark": "#hex", "accent": "#hex", "background": "#hex", "surface": "#hex", "text": "#hex", "textMuted": "#hex", "border": "#hex" },
  "fontFamily": "Inter" | "Poppins" | "Space Grotesk" | "DM Sans" | "Outfit",
  "borderRadius": "0.5rem" | "0.75rem" | "1rem" | "1.25rem",
  "tagline": "short tagline",
  "hero": {
    "layout": "centered" | "split" | "minimal" | "left" | "bold-statement" | "diagonal" | "spotlight" | "editorial",
    "headline": "Bold headline",
    "subheadline": "One or two sentence description",
    "ctaText": "Action text",
    "ctaHref": "mailto:email"
  },
  "cta": {
    "layout": "gradient" | "minimal" | "outline",
    "headline": "CTA headline",
    "subheadline": "Supporting line",
    "buttonText": "Button label"
  },
  "sections": [
    { "id": "features", "type": "features", "layout": "cards" | "alternating" | "list" | "numbered", "headline": "...", "subheadline": "...", "items": [{ "icon": "🚀", "title": "...", "description": "..." }] },
    { "id": "testimonials", "type": "testimonials", "headline": "...", "testimonials": [{ "quote": "...", "author": "...", "role": "..." }] },
    { "id": "pricing", "type": "pricing", "headline": "...", "plans": [{ "name": "...", "price": "...", "period": "mo", "features": ["..."], "ctaText": "..." }] },
    { "id": "faq", "type": "faq", "headline": "...", "faqs": [{ "question": "...", "answer": "..." }] }
  ]
}`;

// Deterministic style seed based on company name — ensures different companies get different directions.
// Each entry is a unique combination of font × mode × radius × heroLayout × ctaLayout × sectionLayout × hint.
// 48 entries cover a wide spread so the AI gets a strong, varied starting point per company.
const STYLE_DIRECTIONS = [
  // ── Space Grotesk ──────────────────────────────────────────────────
  { font: "Space Grotesk", mode: "dark",  radius: "0.5rem",  heroLayout: "spotlight",      ctaLayout: "gradient", sectionLayout: "cards",       hint: "Sharp, technical, modern. Cool-toned blues/cyans. Spotlight hero with radial glow." },
  { font: "Space Grotesk", mode: "light", radius: "0.5rem",  heroLayout: "editorial",      ctaLayout: "outline",  sectionLayout: "alternating", hint: "Futuristic, precise, premium. Monochrome with one vivid accent. Editorial magazine layout." },
  { font: "Space Grotesk", mode: "dark",  radius: "0.75rem", heroLayout: "diagonal",       ctaLayout: "minimal",  sectionLayout: "numbered",    hint: "Cyberpunk-inspired, neon accents on dark. Diagonal angled hero." },
  { font: "Space Grotesk", mode: "light", radius: "1rem",    heroLayout: "bold-statement",  ctaLayout: "gradient", sectionLayout: "list",        hint: "Architect-clean, structured. Bold statement hero with strong gradient." },
  { font: "Space Grotesk", mode: "dark",  radius: "0.5rem",  heroLayout: "centered",       ctaLayout: "outline",  sectionLayout: "cards",       hint: "Developer-focused, terminal-green on black. Centered hero, outlined CTA." },
  { font: "Space Grotesk", mode: "light", radius: "0.75rem", heroLayout: "minimal",        ctaLayout: "minimal",  sectionLayout: "alternating", hint: "Swiss design, grid-based, ultra-clean. Minimal hero, no decorations." },
  // ── Poppins ────────────────────────────────────────────────────────
  { font: "Poppins",       mode: "light", radius: "1.25rem", heroLayout: "bold-statement",  ctaLayout: "gradient", sectionLayout: "cards",       hint: "Warm, friendly, approachable. Coral/peach/warm tones. Bold gradient hero." },
  { font: "Poppins",       mode: "dark",  radius: "1rem",    heroLayout: "split",           ctaLayout: "outline",  sectionLayout: "alternating", hint: "Creative, expressive, playful. Unexpected color combos. Split hero with visual." },
  { font: "Poppins",       mode: "light", radius: "1.25rem", heroLayout: "spotlight",       ctaLayout: "minimal",  sectionLayout: "numbered",    hint: "Cheerful, energetic, youth-oriented. Bright yellows/oranges. Spotlight hero." },
  { font: "Poppins",       mode: "dark",  radius: "0.75rem", heroLayout: "editorial",       ctaLayout: "gradient", sectionLayout: "list",        hint: "Night-mode lifestyle brand. Deep purples/pinks. Editorial layout." },
  { font: "Poppins",       mode: "light", radius: "1rem",    heroLayout: "diagonal",        ctaLayout: "outline",  sectionLayout: "cards",       hint: "Bubbly, consumer-friendly. Soft pastels. Diagonal hero with angled slice." },
  { font: "Poppins",       mode: "dark",  radius: "1.25rem", heroLayout: "centered",        ctaLayout: "gradient", sectionLayout: "numbered",    hint: "Gaming/entertainment vibe. Vivid neons on dark. Centered hero." },
  { font: "Poppins",       mode: "light", radius: "0.5rem",  heroLayout: "left",            ctaLayout: "minimal",  sectionLayout: "alternating", hint: "Handcrafted, artisan feel. Warm terracotta/sage. Left-aligned hero." },
  { font: "Poppins",       mode: "dark",  radius: "1rem",    heroLayout: "minimal",         ctaLayout: "outline",  sectionLayout: "list",        hint: "Elegant dark consumer brand. Minimal hero, clean lines." },
  // ── DM Sans ────────────────────────────────────────────────────────
  { font: "DM Sans",       mode: "light", radius: "0.75rem", heroLayout: "editorial",       ctaLayout: "minimal",  sectionLayout: "cards",       hint: "Clean, minimal, professional. Neutral/blue palette. Editorial magazine-style." },
  { font: "DM Sans",       mode: "dark",  radius: "0.75rem", heroLayout: "bold-statement",  ctaLayout: "gradient", sectionLayout: "alternating", hint: "Sophisticated, luxurious, refined. Dark with gold/warm accents. Bold statement." },
  { font: "DM Sans",       mode: "light", radius: "1rem",    heroLayout: "spotlight",       ctaLayout: "outline",  sectionLayout: "numbered",    hint: "Healthcare/wellness, trustworthy. Soft blues/greens. Spotlight hero." },
  { font: "DM Sans",       mode: "dark",  radius: "0.5rem",  heroLayout: "split",           ctaLayout: "minimal",  sectionLayout: "list",        hint: "Fintech, data-dense. Dark navy with teal accents. Split hero." },
  { font: "DM Sans",       mode: "light", radius: "0.75rem", heroLayout: "diagonal",        ctaLayout: "gradient", sectionLayout: "cards",       hint: "Consultancy, B2B services. Steel blue/slate. Diagonal hero." },
  { font: "DM Sans",       mode: "dark",  radius: "1rem",    heroLayout: "centered",        ctaLayout: "outline",  sectionLayout: "alternating", hint: "SaaS dashboard vibe. Charcoal with electric blue accents. Centered hero." },
  { font: "DM Sans",       mode: "light", radius: "1.25rem", heroLayout: "left",            ctaLayout: "minimal",  sectionLayout: "numbered",    hint: "Education/learning platform. Warm whites with indigo accents. Left-aligned hero." },
  { font: "DM Sans",       mode: "dark",  radius: "0.5rem",  heroLayout: "minimal",         ctaLayout: "gradient", sectionLayout: "list",        hint: "Developer tools, API product. Near-black with green/lime accents. Minimal hero." },
  // ── Outfit ─────────────────────────────────────────────────────────
  { font: "Outfit",         mode: "dark",  radius: "1rem",    heroLayout: "diagonal",        ctaLayout: "gradient", sectionLayout: "cards",       hint: "Bold, energetic, startup-y. High-contrast with vibrant accent. Diagonal hero." },
  { font: "Outfit",         mode: "light", radius: "1.25rem", heroLayout: "spotlight",       ctaLayout: "minimal",  sectionLayout: "alternating", hint: "Fresh, organic, natural. Earthy greens/tans. Spotlight hero with soft glow." },
  { font: "Outfit",         mode: "dark",  radius: "0.75rem", heroLayout: "bold-statement",  ctaLayout: "outline",  sectionLayout: "numbered",    hint: "Music/culture brand. Deep blacks with hot pink/magenta. Bold statement hero." },
  { font: "Outfit",         mode: "light", radius: "0.5rem",  heroLayout: "editorial",       ctaLayout: "gradient", sectionLayout: "list",        hint: "Design agency, portfolio. Crisp whites with a single bold color. Editorial layout." },
  { font: "Outfit",         mode: "dark",  radius: "1rem",    heroLayout: "split",           ctaLayout: "minimal",  sectionLayout: "cards",       hint: "AI/ML product. Dark gradient with purple/violet glow. Split hero." },
  { font: "Outfit",         mode: "light", radius: "1.25rem", heroLayout: "centered",        ctaLayout: "outline",  sectionLayout: "alternating", hint: "Kids/family brand. Bright, multi-color. Centered hero with playful orbs." },
  { font: "Outfit",         mode: "dark",  radius: "0.5rem",  heroLayout: "left",            ctaLayout: "gradient", sectionLayout: "numbered",    hint: "Fitness/sports. Black with red/orange energy. Left-aligned hero." },
  { font: "Outfit",         mode: "light", radius: "0.75rem", heroLayout: "minimal",         ctaLayout: "minimal",  sectionLayout: "list",        hint: "Minimalist e-commerce. Off-white with single accent. Minimal hero." },
  { font: "Outfit",         mode: "dark",  radius: "1.25rem", heroLayout: "diagonal",        ctaLayout: "outline",  sectionLayout: "cards",       hint: "Web3/crypto. Dark with gradient neon borders. Diagonal hero." },
  // ── Inter ──────────────────────────────────────────────────────────
  { font: "Inter",          mode: "light", radius: "0.75rem", heroLayout: "minimal",         ctaLayout: "gradient", sectionLayout: "cards",       hint: "Classic, trustworthy, enterprise. Muted blue/green palette. Minimal hero." },
  { font: "Inter",          mode: "dark",  radius: "1rem",    heroLayout: "diagonal",        ctaLayout: "outline",  sectionLayout: "alternating", hint: "Sleek, data-driven, analytical. Deep navy with teal/cyan. Diagonal hero." },
  { font: "Inter",          mode: "light", radius: "0.5rem",  heroLayout: "editorial",       ctaLayout: "minimal",  sectionLayout: "numbered",    hint: "Legal/finance, authoritative. Dark blues/grays. Editorial hero." },
  { font: "Inter",          mode: "dark",  radius: "0.75rem", heroLayout: "spotlight",       ctaLayout: "gradient", sectionLayout: "list",        hint: "Cybersecurity/infra. Black with green/emerald. Spotlight hero." },
  { font: "Inter",          mode: "light", radius: "1rem",    heroLayout: "split",           ctaLayout: "outline",  sectionLayout: "cards",       hint: "B2B marketplace. Clean white with warm orange accent. Split hero." },
  { font: "Inter",          mode: "dark",  radius: "0.5rem",  heroLayout: "bold-statement",  ctaLayout: "gradient", sectionLayout: "alternating", hint: "Infrastructure/cloud. Midnight blue gradient. Bold statement hero." },
  { font: "Inter",          mode: "light", radius: "1.25rem", heroLayout: "centered",        ctaLayout: "minimal",  sectionLayout: "numbered",    hint: "Non-profit/community. Soft sage/lavender. Centered hero." },
  { font: "Inter",          mode: "dark",  radius: "1rem",    heroLayout: "left",            ctaLayout: "outline",  sectionLayout: "list",        hint: "Podcast/media. Charcoal with amber accents. Left-aligned hero." },
  { font: "Inter",          mode: "light", radius: "0.75rem", heroLayout: "bold-statement",  ctaLayout: "gradient", sectionLayout: "cards",       hint: "Real estate/property. Warm whites with forest green. Bold statement." },
  { font: "Inter",          mode: "dark",  radius: "0.5rem",  heroLayout: "editorial",       ctaLayout: "minimal",  sectionLayout: "alternating", hint: "Research/science. Dark slate with electric blue. Editorial layout." },
  // ── Cross-font wild cards (unexpected combos for max variety) ──────
  { font: "Outfit",         mode: "light", radius: "1rem",    heroLayout: "bold-statement",  ctaLayout: "outline",  sectionLayout: "cards",       hint: "Travel/adventure. Sky blue gradients, sand accents. Bold statement, outlined CTA." },
  { font: "DM Sans",        mode: "light", radius: "1rem",    heroLayout: "centered",        ctaLayout: "gradient", sectionLayout: "numbered",    hint: "Food/restaurant. Warm cream with deep burgundy accent. Centered hero." },
  { font: "Space Grotesk",  mode: "dark",  radius: "1.25rem", heroLayout: "split",           ctaLayout: "gradient", sectionLayout: "list",        hint: "Robotics/hardware. Gunmetal with electric orange. Split hero with angular visual." },
  { font: "Poppins",        mode: "light", radius: "0.75rem", heroLayout: "bold-statement",  ctaLayout: "gradient", sectionLayout: "alternating", hint: "Beauty/cosmetics. Soft pink/rose gold gradient. Bold statement hero." },
  { font: "DM Sans",        mode: "dark",  radius: "1.25rem", heroLayout: "diagonal",        ctaLayout: "minimal",  sectionLayout: "cards",       hint: "Music streaming/audio. Deep violet with coral accents. Diagonal hero." },
  { font: "Space Grotesk",  mode: "light", radius: "1rem",    heroLayout: "left",            ctaLayout: "outline",  sectionLayout: "numbered",    hint: "Architecture/construction. Concrete grays with copper accent. Left-aligned hero." },
  { font: "Outfit",         mode: "dark",  radius: "0.75rem", heroLayout: "spotlight",       ctaLayout: "outline",  sectionLayout: "alternating", hint: "Space/aerospace. Near-black with star-white and nebula purple. Spotlight hero." },
] as const;

function getStyleSeed(name: string): typeof STYLE_DIRECTIONS[number] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return STYLE_DIRECTIONS[Math.abs(hash) % STYLE_DIRECTIONS.length];
}

function buildUserPrompt(input: ThemeGeneratorInput): string {
  const { companyName, companyPrompt, projectSlug, memory, tagline } = input;
  const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
  const companyEmail = `${projectSlug}@${companyDomain}`;
  const wantsPricing = input.includePricing || requestNeedsPricing(companyPrompt);
  // Pick a reference example based on company name hash — shown as inspiration, not a directive
  const styleSeed = getStyleSeed(companyName);

  const parts = [
    `Company: ${companyName}`,
    `Idea: ${companyPrompt}`,
    tagline ? `Existing tagline: ${tagline}` : "",
    memory.mission ? `Mission: ${memory.mission}` : "",
    memory.targetAudience ? `Target audience: ${memory.targetAudience}` : "",
    memory.competitors?.length ? `Differentiators from: ${memory.competitors.join(", ")}` : "",
    `Domain: ${projectSlug}.${companyDomain}`,
    `Contact email: ${companyEmail}`,
    `CTA href should be: mailto:${companyEmail}`,
    "",
    `INSTRUCTIONS: Analyze this company's industry, audience, and personality. Then use the Design Decision Framework (Steps 1-6) in the system prompt to pick the BEST design choices for THIS company. Every choice (mode, font, hero layout, CTA layout, section layout, colors) must be justified by what the company actually does — not random.`,
    "",
    `REFERENCE EXAMPLE (one possible direction — use ONLY if it genuinely fits this company, otherwise pick what's best):`,
    `  Font: ${styleSeed.font} | Mode: ${styleSeed.mode} | Radius: ${styleSeed.radius} | Hero: ${styleSeed.heroLayout} | CTA: ${styleSeed.ctaLayout} | Sections: ${styleSeed.sectionLayout}`,
    `  Vibe: ${styleSeed.hint}`,
    wantsPricing
      ? "IMPORTANT: Include a pricing section with 1-3 PAID plans that are ready for fixed-price Stripe Checkout."
      : "",
    wantsPricing
      ? 'IMPORTANT: Every pricing plan must use price values like "$19" or "$99" and period values exactly "mo", "yr", or "once".'
      : "",
    wantsPricing
      ? "IMPORTANT: Avoid custom quote, contact sales, seat-based, metered, or usage-based pricing."
      : "",
    wantsPricing && input.includePricing
      ? "IMPORTANT: If this business clearly cannot sell anything (e.g., open source project, nonprofit, community group, personal blog), you may SKIP the pricing section. Otherwise, ALWAYS include pricing — the founder wants to start earning revenue immediately."
      : "",
  ];

  return parts.filter(Boolean).join("\n");
}

function normalizePlanPrice(price: string): string | null {
  const cleaned = price.trim().replace(/,/g, "");
  if (!cleaned) return null;
  if (/(free|custom|contact|quote|talk)/i.test(cleaned)) return null;

  const numeric = cleaned.replace(/[^0-9.]/g, "");
  if (!numeric) return null;

  const amount = Number.parseFloat(numeric);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const whole = Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2).replace(/\.00$/, "");
  return `$${whole}`;
}

function normalizePlanPeriod(period: string): NormalizedPlanPeriod {
  const value = period.trim().toLowerCase();
  if (!value) return "mo";
  if (["once", "one-time", "one time", "lifetime"].includes(value)) return "once";
  if (["yr", "year", "annual", "annually", "yearly"].some((entry) => value.includes(entry))) return "yr";
  return "mo";
}

function sanitizePricingPlans(plans: PricingPlan[]): PricingPlan[] {
  const sanitized: PricingPlan[] = [];

  for (const plan of plans) {
    const name = String(plan.name || "").trim();
    const price = normalizePlanPrice(String(plan.price || ""));
    if (!name || !price) continue;

    const features = Array.isArray(plan.features)
      ? plan.features.map((feature) => String(feature || "").trim()).filter(Boolean).slice(0, 8)
      : [];

    sanitized.push({
      name,
      price,
      period: normalizePlanPeriod(String(plan.period || "")),
      features: features.length > 0 ? features : ["Core offering", "Email support", "Fast setup"],
      ctaText: String(plan.ctaText || "").trim() || "Get started",
    });
  }

  return sanitized.slice(0, 3);
}

function inferPricingModel(input: ThemeGeneratorInput): "service" | "membership" | "software" {
  const text = `${input.companyPrompt}\n${input.memory.targetAudience || ""}\n${input.memory.mission || ""}`.toLowerCase();

  if (/\b(agency|consulting|consultant|studio|freelance|design service|marketing service|development service)\b/.test(text)) {
    return "service";
  }

  if (/\b(coaching|course|community|membership|newsletter|education|academy|program)\b/.test(text)) {
    return "membership";
  }

  return "software";
}

function buildFallbackPricingSection(input: ThemeGeneratorInput): GeneratedSection {
  const model = inferPricingModel(input);

  if (model === "service") {
    return {
      id: "pricing",
      type: "pricing",
      headline: "Simple packages that scale with you",
      subheadline: "Clear scope, fixed pricing, and a path to upgrade as your needs grow.",
      plans: [
        {
          name: "Starter",
          price: "$500",
          period: "once",
          features: ["Core deliverable", "Fast kickoff", "Email support"],
          ctaText: "Buy now",
        },
        {
          name: "Growth",
          price: "$1500",
          period: "once",
          features: ["Expanded scope", "Priority delivery", "Revision round"],
          ctaText: "Choose plan",
        },
        {
          name: "Premium",
          price: "$3500",
          period: "once",
          features: ["High-touch execution", "Strategy support", "Priority communication"],
          ctaText: "Get started",
        },
      ],
    };
  }

  if (model === "membership") {
    return {
      id: "pricing",
      type: "pricing",
      headline: "Pick the level that fits your pace",
      subheadline: "Start small, upgrade when you want more depth, access, or support.",
      plans: [
        {
          name: "Starter",
          price: "$19",
          period: "mo",
          features: ["Core access", "Weekly updates", "Member support"],
          ctaText: "Get started",
        },
        {
          name: "Pro",
          price: "$49",
          period: "mo",
          features: ["Everything in Starter", "Premium resources", "Priority support"],
          ctaText: "Choose plan",
        },
        {
          name: "Annual",
          price: "$499",
          period: "yr",
          features: ["Full yearly access", "Best value", "Priority support"],
          ctaText: "Join annual",
        },
      ],
    };
  }

  return {
    id: "pricing",
    type: "pricing",
    headline: "Pricing built to grow with your team",
    subheadline: "Start lean, unlock more power as your workflow and usage expand.",
    plans: [
      {
        name: "Starter",
        price: "$19",
        period: "mo",
        features: ["Core workflow", "Basic automation", "Email support"],
        ctaText: "Get started",
      },
      {
        name: "Pro",
        price: "$49",
        period: "mo",
        features: ["Advanced features", "Faster workflows", "Priority support"],
        ctaText: "Choose plan",
      },
      {
        name: "Business",
        price: "$99",
        period: "mo",
        features: ["Team-ready setup", "Best performance", "Priority support"],
        ctaText: "Start now",
      },
    ],
  };
}

function ensurePricingSection(parsed: GeneratedContent, input: ThemeGeneratorInput): GeneratedContent {
  if (!requestNeedsPricing(input.companyPrompt)) return parsed;

  let foundUsablePricing = false;
  parsed.sections = parsed.sections.map((section) => {
    if (section.type !== "pricing") return section;

    const sanitizedPlans = sanitizePricingPlans(section.plans || []);
    if (sanitizedPlans.length === 0) {
      return section;
    }

    foundUsablePricing = true;
    return {
      ...section,
      plans: sanitizedPlans,
    };
  });

  if (!foundUsablePricing) {
    parsed.sections = [...parsed.sections, buildFallbackPricingSection(input)];
  }

  return parsed;
}

function parseAndValidateContent(raw: string, input: ThemeGeneratorInput): GeneratedContent {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const parsed = ensurePricingSection(JSON.parse(cleaned) as GeneratedContent, input);

  if (!parsed.mode || !["light", "dark"].includes(parsed.mode)) {
    parsed.mode = "light";
  }
  if (!parsed.colors || typeof parsed.colors !== "object") {
    throw new Error("Missing colors object");
  }
  const requiredColorKeys: (keyof ThemeColors)[] = [
    "primary", "primaryLight", "primaryDark", "accent",
    "background", "surface", "text", "textMuted", "border",
  ];
  for (const key of requiredColorKeys) {
    if (!parsed.colors[key] || !/^#[0-9a-fA-F]{3,8}$/.test(parsed.colors[key])) {
      throw new Error(`Invalid or missing color: ${key}`);
    }
  }
  if (!parsed.hero?.headline) throw new Error("Missing hero headline");
  if (!parsed.sections?.length) throw new Error("Missing sections");
  if (!parsed.cta?.headline || !parsed.cta?.subheadline || !parsed.cta?.buttonText) {
    throw new Error("Missing cta (headline, subheadline, buttonText)");
  }

  const validFonts = ["Inter", "Poppins", "Space Grotesk", "DM Sans", "Outfit"];
  if (!parsed.fontFamily || !validFonts.includes(parsed.fontFamily)) {
    parsed.fontFamily = "Inter";
  }
  const validRadius = ["0.5rem", "0.75rem", "1rem", "1.25rem"];
  if (!parsed.borderRadius || !validRadius.includes(parsed.borderRadius)) {
    parsed.borderRadius = "0.75rem";
  }

  const validHeroLayouts = ["centered", "split", "minimal", "left", "bold-statement", "diagonal", "spotlight", "editorial"];
  if (parsed.hero.layout && !validHeroLayouts.includes(parsed.hero.layout)) {
    parsed.hero.layout = "centered";
  }

  const validCtaLayouts = ["gradient", "minimal", "outline"];
  if (parsed.cta.layout && !validCtaLayouts.includes(parsed.cta.layout)) {
    parsed.cta.layout = "gradient";
  }

  for (const s of parsed.sections) {
    const itemTypes = ["features", "how-it-works", "benefits", "early-access"];
    if (itemTypes.includes(s.type) && (!s.items || s.items.length === 0)) {
      throw new Error(`Section ${s.id} (type ${s.type}) requires items`);
    }
    if (s.type === "testimonials" && (!s.testimonials || s.testimonials.length === 0)) {
      throw new Error(`Section ${s.id} (type testimonials) requires testimonials`);
    }
    if (s.type === "pricing" && (!s.plans || s.plans.length === 0)) {
      throw new Error(`Section ${s.id} (type pricing) requires plans`);
    }
    if (s.type === "faq" && (!s.faqs || s.faqs.length === 0)) {
      throw new Error(`Section ${s.id} (type faq) requires faqs`);
    }
    const validLayouts = ["cards", "alternating", "list", "numbered", "bento"];
    if (s.layout && !validLayouts.includes(s.layout)) {
      s.layout = "cards";
    }
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Edit mode: generate updated LandingPageContent JSON for an existing site
// ---------------------------------------------------------------------------

interface EditContentInput {
  companyName: string;
  companyPrompt: string;
  projectSlug: string;
  memory: ProjectMemory;
  tagline?: string;
  editRequest: string;
  /** Visible text extracted from the existing site (stripped of HTML tags) */
  existingTextSummary?: string;
}

const EDIT_SYSTEM_PROMPT = `You are an elite branding and web design expert. You have an existing website and a user's edit request. Generate an updated landing page content plan as JSON that APPLIES THE EDIT while preserving the existing design direction.

CRITICAL RULES:
- Apply ONLY what the user asked to change. Preserve everything else.
- If the user changes hero copy → update hero fields only. Keep the same color palette and sections.
- If the user changes colors → update colors only. Keep the same sections and copy.
- If the user asks to add/remove/reorder sections → do so. Keep everything else the same.
- Infer the current design direction from the "EXISTING SITE CONTENT" reference provided.
- The existing site's text and section structure should be your baseline — match it unless the edit says otherwise.

${SYSTEM_PROMPT.replace("You are an elite branding and web design expert who creates visually distinct, beautiful websites. Given a company description, generate a complete landing page content plan as JSON.\n\n", "")}`;

function extractTextSummary(html: string, maxChars = 2000): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

export async function generateEditedLandingPageContent(
  input: EditContentInput
): Promise<LandingPageContent> {
  const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
  const companyEmail = `${input.projectSlug}@${companyDomain}`;
  const wantsPricing = requestNeedsPricing(input.editRequest) || requestNeedsPricing(input.companyPrompt);

  const basePrompt = buildUserPrompt({
    companyName: input.companyName,
    companyPrompt: input.companyPrompt,
    projectSlug: input.projectSlug,
    memory: input.memory,
    tagline: input.tagline,
    includePricing: wantsPricing,
  });

  const userPrompt = [
    basePrompt,
    "",
    input.existingTextSummary
      ? `EXISTING SITE CONTENT (preserve this design/copy unless the edit changes it):\n${input.existingTextSummary}`
      : "",
    "",
    `USER EDIT REQUEST:\n${input.editRequest}`,
    "",
    "Apply the edit above to the JSON. Return ONLY valid JSON.",
  ].filter(Boolean).join("\n");

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const prompt = attempt === 0
      ? userPrompt
      : `${userPrompt}\n\nPREVIOUS ATTEMPT FAILED: ${lastError}\nPlease return valid JSON only.`;

    try {
      const raw = await generateAgentCompletion("website_builder", EDIT_SYSTEM_PROMPT, prompt, {
        maxTokens: 8000,
        temperature: 0.5,
      });

      const content = parseAndValidateContent(raw, {
        companyName: input.companyName,
        companyPrompt: input.editRequest,
        projectSlug: input.projectSlug,
        memory: input.memory,
        tagline: input.tagline,
        includePricing: wantsPricing,
      });

      const theme: SiteTheme = {
        mode: content.mode,
        colors: content.colors,
        fontFamily: `'${content.fontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
        borderRadius: content.borderRadius,
      };

      return {
        companyName: input.companyName,
        tagline: content.tagline || input.tagline || "",
        theme,
        hero: content.hero,
        cta: content.cta,
        sections: content.sections as Section[],
        companyEmail,
        domain: `${input.projectSlug}.${companyDomain}`,
      };
    } catch (err) {
      if (isRetryableProviderError(err)) throw err;
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(`Edit content generation failed after 3 attempts: ${lastError}`);
}

export async function generateLandingPageContent(
  input: ThemeGeneratorInput
): Promise<LandingPageContent> {
  const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
  const companyEmail = `${input.projectSlug}@${companyDomain}`;

  const userPrompt = buildUserPrompt(input);

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const prompt = attempt === 0
      ? userPrompt
      : `${userPrompt}\n\nPREVIOUS ATTEMPT FAILED: ${lastError}\nPlease return valid JSON only.`;

    try {
      const raw = await generateAgentCompletion("website_builder", SYSTEM_PROMPT, prompt, {
        maxTokens: 8000,
        temperature: 0.95,
      });

      const content = parseAndValidateContent(raw, input);

      const theme: SiteTheme = {
        mode: content.mode,
        colors: content.colors,
        fontFamily: `'${content.fontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
        borderRadius: content.borderRadius,
      };

      return {
        companyName: input.companyName,
        tagline: content.tagline || input.tagline || "",
        theme,
        hero: content.hero,
        cta: content.cta,
        sections: content.sections as Section[],
        companyEmail,
        domain: `${input.projectSlug}.${companyDomain}`,
      };
    } catch (err) {
      // Provider-level errors (529 overloaded, 503, etc.) should bubble up
      // immediately so the router's fallback logic can switch providers
      if (isRetryableProviderError(err)) throw err;
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(`Theme generation failed after 3 attempts: ${lastError}`);
}
