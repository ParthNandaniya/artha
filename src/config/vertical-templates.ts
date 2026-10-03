/**
 * Vertical templates customize the onboarding pipeline output
 * based on business type. Each template provides sensible defaults
 * for pricing plans, tasks, and landing page structure.
 *
 * The "general" fallback preserves the current generic behavior
 * for businesses that don't fit a specific template.
 */

export interface VerticalPricingDefault {
  name: string;
  price: string;
  period: "mo" | "yr" | "once";
  features: string[];
  ctaText: string;
}

export interface VerticalTaskTemplate {
  title: string;
  description: string;
  type: "outreach" | "research" | "landing_page" | "custom" | "newsletter";
  tag: "research" | "marketing" | "cold-outreach" | "engineering" | "social" | "content" | "newsletter";
  agent: "research" | "website_builder" | "email_writer" | "task_generator" | "twitter";
  revenue_impact: "direct" | "pipeline" | "brand";
}

export interface VerticalTemplate {
  id: string;
  label: string;
  pricingDefaults: VerticalPricingDefault[];
  taskTemplates: VerticalTaskTemplate[];
  landingPageHints: {
    sections: string[];
    tone: string;
  };
  classificationKeywords: string[];
}

export const VERTICAL_TEMPLATES: Record<string, VerticalTemplate> = {
  "freelance-agency": {
    id: "freelance-agency",
    label: "Freelance / Agency",
    pricingDefaults: [
      {
        name: "Starter",
        price: "$49",
        period: "once",
        features: ["1 deliverable", "Email support", "2-day turnaround"],
        ctaText: "Get started",
      },
      {
        name: "Pro",
        price: "$149",
        period: "mo",
        features: ["Unlimited deliverables", "Priority support", "Weekly calls", "Dedicated slack channel"],
        ctaText: "Choose plan",
      },
    ],
    taskTemplates: [
      {
        title: "Find 15 potential clients who need your services",
        description: "Search LinkedIn, Twitter, and relevant forums for people or companies actively looking for the services this company offers. Focus on those with budget signals (funded startups, growing teams, recent job postings for related roles).",
        type: "research",
        tag: "cold-outreach",
        agent: "research",
        revenue_impact: "direct",
      },
      {
        title: "Send personalized cold emails to discovered leads",
        description: "Write and send personalized outreach emails to the leads found. Each email should reference something specific about their company and explain how your service solves a problem they likely have. Keep it under 150 words.",
        type: "outreach",
        tag: "cold-outreach",
        agent: "email_writer",
        revenue_impact: "direct",
      },
      {
        title: "Create a portfolio page showcasing your best work",
        description: "Add a portfolio or case studies section to the landing page showing 3 examples of work with results. Even if examples are hypothetical for now, make them concrete and results-oriented.",
        type: "landing_page",
        tag: "marketing",
        agent: "website_builder",
        revenue_impact: "pipeline",
      },
    ],
    landingPageHints: {
      sections: ["hero", "services", "portfolio", "pricing", "testimonials", "cta"],
      tone: "Professional, confident, results-focused",
    },
    classificationKeywords: ["freelance", "agency", "consulting firm", "design studio", "development shop", "marketing agency", "creative agency", "contractor", "service provider", "done-for-you"],
  },

  "digital-product": {
    id: "digital-product",
    label: "Digital Product / Course",
    pricingDefaults: [
      {
        name: "Basic",
        price: "$29",
        period: "once",
        features: ["Core content", "Email support", "Lifetime updates"],
        ctaText: "Buy now",
      },
      {
        name: "Premium",
        price: "$99",
        period: "once",
        features: ["All content", "Community access", "Bonus materials", "Updates for life"],
        ctaText: "Get premium",
      },
    ],
    taskTemplates: [
      {
        title: "Identify 5 communities where your target audience hangs out",
        description: "Research Reddit, Discord, Facebook Groups, Slack communities, and forums where people discuss problems your product solves. List each community with its size, activity level, and posting rules.",
        type: "research",
        tag: "research",
        agent: "research",
        revenue_impact: "direct",
      },
      {
        title: "Post value-first content in 3 relevant communities",
        description: "Create helpful, non-promotional posts in the discovered communities. Share genuine insights or tips related to your product's topic. Include a subtle mention of your product only if the community rules allow it.",
        type: "custom",
        tag: "content",
        agent: "email_writer",
        revenue_impact: "direct",
      },
      {
        title: "Create a lead magnet to capture emails",
        description: "Design a free sample, checklist, or mini-guide that gives prospects a taste of your product. Add it to your landing page with an email capture form. This builds your list for future launches.",
        type: "landing_page",
        tag: "marketing",
        agent: "website_builder",
        revenue_impact: "pipeline",
      },
    ],
    landingPageHints: {
      sections: ["hero", "problem", "solution", "features", "pricing", "faq", "cta"],
      tone: "Educational, trustworthy, value-packed",
    },
    classificationKeywords: ["course", "ebook", "template", "digital product", "download", "guide", "toolkit", "resource", "educational", "training", "workshop", "masterclass"],
  },

  "saas-mvp": {
    id: "saas-mvp",
    label: "SaaS / Software",
    pricingDefaults: [
      {
        name: "Starter",
        price: "$19",
        period: "mo",
        features: ["Core features", "1,000 requests/month", "Email support"],
        ctaText: "Start free trial",
      },
      {
        name: "Pro",
        price: "$49",
        period: "mo",
        features: ["All features", "Unlimited requests", "Priority support", "API access"],
        ctaText: "Choose plan",
      },
    ],
    taskTemplates: [
      {
        title: "Find 20 potential beta users from relevant forums and communities",
        description: "Search Product Hunt, Hacker News, Reddit, and niche forums for people complaining about the problem your software solves. Collect their profiles and contact info. Prioritize those who've tried competing tools.",
        type: "research",
        tag: "research",
        agent: "research",
        revenue_impact: "direct",
      },
      {
        title: "Invite beta users with personalized emails",
        description: "Send personalized invitation emails to potential beta users. Reference the specific problem they mentioned and explain how your tool addresses it. Offer early-adopter pricing or extended trial.",
        type: "outreach",
        tag: "cold-outreach",
        agent: "email_writer",
        revenue_impact: "direct",
      },
      {
        title: "Create a product demo or walkthrough on the landing page",
        description: "Add a how-it-works or demo section to the landing page showing the key workflow. Use screenshots, GIFs, or step-by-step descriptions. Make it clear what the user experience looks like.",
        type: "landing_page",
        tag: "marketing",
        agent: "website_builder",
        revenue_impact: "pipeline",
      },
    ],
    landingPageHints: {
      sections: ["hero", "demo", "features", "pricing", "integrations", "faq", "cta"],
      tone: "Technical but approachable, benefit-focused",
    },
    classificationKeywords: ["saas", "software", "app", "platform", "tool", "api", "automation", "dashboard", "analytics tool", "developer tool", "productivity tool", "b2b software"],
  },

  general: {
    id: "general",
    label: "General",
    pricingDefaults: [],
    taskTemplates: [],
    landingPageHints: {
      sections: [],
      tone: "",
    },
    classificationKeywords: [],
  },
};

/**
 * Classify a business idea into a vertical template.
 * Returns the template ID or "general" if no match.
 */
export function classifyVerticalByKeywords(prompt: string): string {
  const lower = prompt.toLowerCase();
  let bestMatch = "general";
  let bestScore = 0;

  for (const [id, template] of Object.entries(VERTICAL_TEMPLATES)) {
    if (id === "general") continue;
    const score = template.classificationKeywords.filter((kw) =>
      lower.includes(kw.toLowerCase())
    ).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = id;
    }
  }

  return bestMatch;
}
