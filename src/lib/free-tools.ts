import { createRateLimiter, getClientIp } from "@/lib/site-api";
import { NextResponse } from "next/server";
import type { AgenticOverrides } from "@/lib/agents/framework/types";

// ── Free Tool Execution Tier ─────────────────────────────────────────
// Aggressive caps: 1 iteration, no thinking, no sub-agents, fast timeout.

export const FREE_TOOL_OVERRIDES: AgenticOverrides = {
  maxIterations: 2,
  thinkingBudget: 4_000,
  maxRetries: 1,
  maxSubAgents: 0,
  useExtendedThinking: true,
  timeoutMs: 45_000,
  qualityThreshold: 2.5,
};

// ── Per-Tool Rate Limiters ───────────────────────────────────────────
// Keyed by tool name. 24-hour window (86_400_000 ms).

const DAY_MS = 86_400_000;

const limiters: Record<string, ReturnType<typeof createRateLimiter>> = {
  "market-research": createRateLimiter(3, DAY_MS),
  "business-plan": createRateLimiter(3, DAY_MS),
  "logo-maker": createRateLimiter(2, DAY_MS),
  "landing-page": createRateLimiter(3, DAY_MS),
  "seo-audit": createRateLimiter(3, DAY_MS),
  "competitor-analysis": createRateLimiter(3, DAY_MS),
  "privacy-policy-generator": createRateLimiter(3, DAY_MS),
  "invoice-generator": createRateLimiter(3, DAY_MS),
  "company-roast": createRateLimiter(3, DAY_MS),
  "shorts": createRateLimiter(2, DAY_MS),
};

/** Check rate limit for a free tool. Returns a 429 response if limited, else null. */
export function checkFreeToolLimit(toolName: string, request: Request): NextResponse | null {
  const limiter = limiters[toolName];
  if (!limiter) return null;
  const ip = getClientIp(request);
  if (limiter(ip)) {
    return NextResponse.json(
      { error: "Daily limit reached. Sign up for unlimited access.", limitReached: true },
      { status: 429 }
    );
  }
  return null;
}

// ── Tool Definitions (for index page & SEO) ──────────────────────────

export interface FreeToolDef {
  slug: string;
  name: string;
  headline: string;
  description: string;
  icon: string;
  placeholder: string;
  cta: string;
  tier: 1 | 2 | 3;
  examples?: string[];
  features?: string[];
  about?: string;
  tips?: string[];
  dailyLimit?: number;
  faqs?: { q: string; a: string }[];
}

export const FREE_TOOLS: FreeToolDef[] = [
  {
    slug: "shorts",
    name: "AI UGC Video Generator",
    headline: "Free AI UGC Shorts — Script to Video in Minutes",
    description: "Write a script, pick an AI avatar, and generate a professional UGC short video with captions. No filming needed.",
    icon: "video",
    placeholder: "Write your video script...",
    cta: "Generate Video",
    tier: 1,
    dailyLimit: 2,
    examples: [
      "Hey everyone! I just discovered this amazing productivity app that completely changed my morning routine...",
      "Stop scrolling! You need to hear about this skincare product that actually works...",
      "Three things I wish I knew before starting my business...",
    ],
    features: [
      "AI-powered talking head avatars",
      "Professional TTS voices",
      "Auto-generated captions",
      "9:16 vertical format for Shorts/Reels/TikTok",
      "Upload your own face or use presets",
    ],
    about: "Our AI generates a professional UGC-style short video from just a script. Pick a voice, choose an avatar (or upload your own face), and get a ready-to-post video with animated captions.",
    tips: [
      "Keep scripts under 60 seconds for best engagement",
      "Start with a hook — the first 3 seconds matter most",
      "Use conversational language, not formal writing",
    ],
    faqs: [
      { q: "Is this UGC video generator free?", a: "Yes, completely free with up to 2 videos per day. No signup or credit card required." },
      { q: "Can I use my own face?", a: "Yes! Upload a clear headshot photo and the AI will animate it to lip-sync with the generated voice." },
      { q: "What format are the generated videos?", a: "Videos are generated in 9:16 vertical format, perfect for TikTok, Instagram Reels, and YouTube Shorts." },
      { q: "How long does generation take?", a: "Typically 2-4 minutes depending on script length. The AI generates voice, animates the avatar, and adds captions." },
    ],
  },
  {
    slug: "company-roast",
    name: "Company Roast Generator",
    headline: "AI Company Roast — Get Brutally Honest About Any Startup",
    description: "Enter any company URL and get a savage, funny, data-backed roast. We deep-research the company, read the reviews, check the competition, and deliver a brutal but fair takedown.",
    icon: "flame",
    placeholder: "Enter a company URL... e.g. https://notion.so",
    cta: "Roast This Company",
    tier: 1,
    dailyLimit: 3,
    examples: ["https://notion.so", "https://slack.com", "https://monday.com"],
    features: [
      "Deep web research on the company",
      "Real review and complaint data",
      "Competitor comparison shade",
      "Funding and investor analysis",
      "Shareable markdown output",
    ],
    about: "Our AI deeply researches the company — homepage, reviews, funding data, competitor landscape, and public sentiment — then generates a savage but data-backed roast. Every joke is grounded in real data.",
    tips: [
      "Enter the full URL including https://",
      "Works best with well-known startups and tech companies",
      "The more public data available, the better the roast",
    ],
    faqs: [
      { q: "Is this company roast tool free?", a: "Yes, completely free with up to 3 roasts per day. No signup or credit card required." },
      { q: "How does the research work?", a: "Our AI searches the web for real data — homepage content, user reviews, funding info, competitor landscape, news, and public sentiment — then crafts a roast grounded in facts." },
      { q: "Is the roast based on real data?", a: "Every joke and observation is backed by actual research data. We never fabricate claims — the truth is usually funnier anyway." },
      { q: "Can I share the roast?", a: "Absolutely. Copy the roast with one click and share it on Twitter, LinkedIn, or anywhere else. That's kind of the whole point." },
    ],
  },
  {
    slug: "market-research",
    name: "Market Research",
    headline: "Free AI Market Research in 30 Seconds",
    description: "Enter your business idea and get a competitive landscape report with real competitors, market size, gaps, and trends.",
    icon: "search",
    placeholder: "Describe your business idea... e.g. An AI tool that helps restaurants manage food waste",
    cta: "Analyze Market",
    tier: 1,
    dailyLimit: 3,
    examples: [
      "An AI tool that helps restaurants manage food waste",
      "A B2B SaaS for HR compliance automation",
      "A DTC brand selling sustainable sneakers",
    ],
    features: ["Real competitor identification", "Market size estimates", "Gap analysis and trends", "Actionable insights"],
    about: "Our AI agent searches the web for real-time data about your market, identifies actual competitors, estimates market size, and highlights gaps you can exploit.",
    tips: ["Be specific about your niche — 'AI for restaurant food waste' beats 'food tech'", "Include your target geography if relevant", "Mention what makes your approach unique"],
    faqs: [
      { q: "Is this AI market research tool free?", a: "Yes, completely free with up to 3 reports per day. No signup or credit card required." },
      { q: "How accurate is AI market research?", a: "Our AI searches the web for real-time data, identifying actual competitors and market trends. The results reflect current market conditions, not generic templates." },
      { q: "What does the market research report include?", a: "You get a competitive landscape with real competitors, market size estimates, gap analysis, emerging trends, and actionable insights for your specific business idea." },
      { q: "Can I use this for startup validation?", a: "Absolutely. It's designed for founders validating ideas — you'll see who your competitors are, how big the market is, and where the gaps are before you build." },
    ],
  },
  {
    slug: "business-plan",
    name: "Business Plan Generator",
    headline: "AI Business Plan — Specific, Not Generic",
    description: "Get a mission document with vision, problem/solution, target audience, value prop, and a 90-day strategy.",
    icon: "file-text",
    placeholder: "Describe your business idea... e.g. A SaaS platform for freelance designers to manage client projects",
    cta: "Generate Plan",
    tier: 1,
    dailyLimit: 3,
    examples: [
      "A SaaS platform for freelance designers to manage client projects",
      "A subscription box for home baristas with single-origin coffee",
      "An AI tutoring app for high school students preparing for SAT",
    ],
    features: ["Vision and mission statement", "Problem/solution analysis", "Target audience definition", "Value proposition", "90-day action plan"],
    about: "The AI analyzes your idea against real market conditions and generates a structured business plan with actionable next steps — not generic templates.",
    tips: ["Describe your target customer, not just the product", "Mention your revenue model if you have one in mind", "Include any unfair advantages you have"],
    faqs: [
      { q: "Is this business plan generator free?", a: "Yes, 100% free with up to 3 plans per day. No signup needed." },
      { q: "What's included in the AI business plan?", a: "You get a mission and vision statement, problem/solution analysis, target audience definition, value proposition, and a 90-day action plan tailored to your specific idea." },
      { q: "Is this better than a business plan template?", a: "Yes. Templates give you generic outlines. Our AI analyzes your specific idea against real market conditions and generates a plan with actionable next steps, not blank fields to fill in." },
      { q: "Can I use this business plan for investors?", a: "It's a strong starting point. The plan covers all key sections investors look for — problem, solution, market, and strategy. You may want to add financial projections and team details." },
    ],
  },
  {
    slug: "logo-maker",
    name: "AI Logo Maker",
    headline: "Free AI Logo — 4 Styles, Instant",
    description: "Enter your company name and get 4 professional logo variants in different styles.",
    icon: "palette",
    placeholder: "Your company name",
    cta: "Generate Logos",
    tier: 1,
    dailyLimit: 2,
    examples: ["NovaPay", "GreenLeaf Organics", "TechForge Studios"],
    features: ["4 unique style variants", "Professional quality designs", "Instant generation", "Download-ready images"],
    about: "Our AI generates 4 logo variants in different styles (minimal, modern, playful, corporate) using DALL-E 3. Each logo is production-ready.",
    tips: ["Use your actual company name for best results", "Add your industry in the optional field for more relevant designs", "Simple, short names produce cleaner logos"],
    faqs: [
      { q: "Is this AI logo maker really free?", a: "Yes, completely free. You get 4 professional logo variants per generation, up to 2 times per day. No watermarks, no signup required." },
      { q: "Can I use the generated logos commercially?", a: "Yes. The logos are generated for you and are free to use for your business, website, social media, and marketing materials." },
      { q: "What styles of logos can the AI create?", a: "Each generation produces 4 variants in different styles: minimal, modern, tech, and playful. This gives you options to match your brand personality." },
      { q: "How does AI logo generation work?", a: "Our AI uses DALL-E 3 to create unique logo designs based on your company name and industry. Each logo is generated from scratch — not pulled from a template library." },
    ],
  },
  {
    slug: "landing-page",
    name: "Landing Page Generator",
    headline: "AI Landing Page in 60 Seconds",
    description: "Describe your product and get a fully designed landing page with hero, features, and CTA — ready to deploy.",
    icon: "layout",
    placeholder: "Describe your product... e.g. A mobile app that connects pet owners with local pet sitters",
    cta: "Generate Page",
    tier: 1,
    dailyLimit: 3,
    examples: [
      "A mobile app that connects pet owners with local pet sitters",
      "A Chrome extension that summarizes any webpage with AI",
      "An online course platform for yoga instructors",
    ],
    features: ["Full HTML landing page", "Hero section with CTA", "Features and benefits", "Responsive design", "Download HTML source"],
    about: "The AI generates a complete, self-contained HTML landing page with hero, features, testimonials, and CTA sections. Preview it instantly or download the source.",
    tips: ["Describe your product's key benefit, not just what it does", "Mention your target audience for better copy", "Include 2-3 key features you want highlighted"],
    faqs: [
      { q: "Is this landing page generator free?", a: "Yes, completely free with up to 3 pages per day. No account or credit card required." },
      { q: "Can I download the generated landing page?", a: "Yes. You get the full HTML source code that you can download, customize, and deploy anywhere — your own hosting, Netlify, Vercel, or any web server." },
      { q: "Is the generated landing page responsive?", a: "Yes. Every generated page includes responsive CSS that works on desktop, tablet, and mobile devices. You can preview all three sizes before downloading." },
      { q: "What sections does the landing page include?", a: "Each page includes a hero section with headline and CTA, features and benefits, social proof, and a final call-to-action — everything you need for a high-converting page." },
    ],
  },
  {
    slug: "seo-audit",
    name: "SEO Audit",
    headline: "Free AI SEO Audit — Not Just Scores, Actual Fixes",
    description: "Enter any URL and get a detailed SEO analysis with title/meta review, keyword suggestions, and actionable recommendations.",
    icon: "bar-chart",
    placeholder: "Enter a website URL... e.g. https://example.com",
    cta: "Run Audit",
    tier: 1,
    dailyLimit: 3,
    examples: ["https://example.com", "https://stripe.com", "https://notion.so"],
    features: ["Title and meta tag analysis", "Keyword suggestions", "Content quality review", "Technical SEO checks", "Actionable fix recommendations"],
    about: "The AI crawls your URL, analyzes the page structure, content, and metadata, then provides specific recommendations — not just scores.",
    tips: ["Enter the full URL including https://", "Audit your homepage first, then key landing pages", "Use the recommendations to prioritize quick wins"],
    faqs: [
      { q: "Is this SEO audit tool free?", a: "Yes, free with up to 3 audits per day. No signup or payment needed." },
      { q: "What does the SEO audit check?", a: "It analyzes your page title, meta description, heading structure, content quality, keyword usage, and technical SEO factors — then gives you specific fixes, not just scores." },
      { q: "How is this different from other SEO checkers?", a: "Most tools give you a score and generic advice. Our AI reads your actual content and provides specific, actionable recommendations tailored to your page." },
      { q: "Can I audit any website?", a: "Yes, you can audit any publicly accessible URL. Enter the full URL including https:// and the AI will analyze the page in seconds." },
    ],
  },
  {
    slug: "competitor-analysis",
    name: "Competitor Analysis",
    headline: "Free AI Competitor Analysis — See How You Stack Up",
    description: "Enter your company and 1-2 competitors to get a detailed comparison matrix with strengths, weaknesses, and opportunities.",
    icon: "users",
    placeholder: "Your company and competitors... e.g. My company sells organic pet food. Competitors: The Farmer's Dog, Ollie",
    cta: "Analyze Competitors",
    tier: 1,
    dailyLimit: 3,
    examples: [
      "My company sells organic pet food. Competitors: The Farmer's Dog, Ollie",
      "We build AI writing tools. Competitors: Jasper, Copy.ai",
      "Our app is Uber for dog walkers. Competitors: Rover, Wag",
    ],
    features: ["Side-by-side comparison matrix", "Strength and weakness analysis", "Market positioning insights", "Opportunity identification"],
    about: "The AI researches your competitors online and generates a detailed comparison covering pricing, features, positioning, strengths, weaknesses, and opportunities.",
    tips: ["Name 1-2 specific competitors for best results", "Describe what your company does, not just the name", "Mention what you think differentiates you"],
    faqs: [
      { q: "Is the competitor analysis tool free?", a: "Yes, free with up to 3 analyses per day. No signup required." },
      { q: "What does the competitor analysis include?", a: "You get a side-by-side comparison matrix covering pricing, features, positioning, strengths, weaknesses, and market opportunities." },
      { q: "How does the AI research my competitors?", a: "The AI searches the web for real-time data about your competitors — their websites, pricing, features, reviews, and market positioning — then generates a structured comparison." },
      { q: "How many competitors can I compare at once?", a: "You can compare your company against 1-2 competitors in a single analysis. For best results, name specific companies." },
    ],
  },
  {
    slug: "privacy-policy-generator",
    name: "Privacy Policy Generator",
    headline: "Free AI Privacy Policy & Terms of Service",
    description: "Enter your company details and get a legally-structured privacy policy and terms of service, GDPR and CCPA aware.",
    icon: "shield",
    placeholder: "Company name and what your product does... e.g. Acme Analytics — a web analytics SaaS that collects page views and user events",
    cta: "Generate Policy",
    tier: 1,
    dailyLimit: 3,
    examples: [
      "Acme Analytics — a web analytics SaaS that collects page views and user events",
      "FitTrack — a mobile fitness app that tracks workouts and nutrition",
      "ShopEasy — an e-commerce platform that processes payments and stores shipping addresses",
    ],
    features: ["Privacy policy and terms of service", "GDPR and CCPA aware", "Covers data collection and usage", "Professional legal structure"],
    about: "The AI generates a legally-structured privacy policy and terms of service tailored to your product — covering data collection, usage, cookies, and compliance.",
    tips: ["List all types of data your product collects", "Mention third-party services you use (analytics, payments)", "Specify if you serve EU or California users"],
    faqs: [
      { q: "Is this privacy policy generator free?", a: "Yes, completely free with up to 3 generations per day. No signup or payment required." },
      { q: "Is the generated privacy policy legally valid?", a: "The AI generates a professionally structured policy covering data collection, usage, cookies, and compliance. While it follows standard legal frameworks, we recommend having a lawyer review it for your specific jurisdiction." },
      { q: "Does it cover GDPR and CCPA?", a: "Yes. The generated policy includes sections for GDPR (EU) and CCPA (California) compliance, covering user rights, data processing, and consent requirements." },
      { q: "Do I get both a privacy policy and terms of service?", a: "Yes. Each generation produces both a privacy policy and terms of service document, tailored to your specific product and the data you collect." },
    ],
  },
  {
    slug: "invoice-generator",
    name: "Invoice Generator",
    headline: "AI Invoice Generator — Professional Invoices Instantly",
    description: "Enter your business and client details to get a professional, ready-to-use invoice.",
    icon: "receipt",
    placeholder: "Your business name, client name, and line items... e.g. Acme Design LLC billing TechCorp: Logo design $2,500, Brand guidelines $1,500",
    cta: "Generate Invoice",
    tier: 1,
    dailyLimit: 3,
    examples: [
      "Acme Design LLC billing TechCorp: Logo design $2,500, Brand guidelines $1,500",
      "Freelance developer billing StartupXYZ: Website development $5,000, Hosting setup $500",
      "Marketing agency billing RetailCo: Social media management $3,000/month, Ad spend management $1,000",
    ],
    features: ["Professional invoice format", "Automatic calculations", "Line item breakdown", "Payment terms and details"],
    about: "The AI generates a professional, properly formatted invoice with line items, totals, tax calculations, and payment terms — ready to send to your client.",
    tips: ["Include all line items with prices", "Mention your payment terms (Net 30, Due on receipt, etc.)", "Add your business address for a complete invoice"],
    faqs: [
      { q: "Is this invoice generator free?", a: "Yes, free with up to 3 invoices per day. No signup required." },
      { q: "Can I customize the invoice?", a: "Yes. You provide your business details, client info, line items, and payment terms. The AI formats everything into a professional invoice." },
      { q: "What format is the generated invoice?", a: "You get a professionally formatted invoice that you can copy, download, or send directly to your client." },
      { q: "Does it calculate taxes automatically?", a: "Yes. If you mention tax rates or requirements, the AI will include tax calculations, subtotals, and grand totals in the invoice." },
    ],
  },
];
