# Bulk Company Generator — Claude Code Prompt

Give this prompt to Claude Code to generate company data in batches. Run it 10 times, changing the BATCH NUMBER and INDUSTRIES each time.

---

## The Prompt

Copy everything below the line and give it to Claude Code:

---

Generate 10 fictional but realistic AI/tech startup companies and write them to `data/companies-batch-{BATCH_NUMBER}.json`.

**BATCH_NUMBER**: `01`
**INDUSTRIES**: SaaS productivity, developer tools

(Change these for each batch:
- Batch 01: SaaS productivity, developer tools
- Batch 02: Fintech, payments, banking
- Batch 03: Healthtech, wellness, biotech
- Batch 04: Edtech, learning platforms
- Batch 05: Sustainability, clean energy, climate
- Batch 06: Food & beverage, agriculture
- Batch 07: E-commerce, marketplace, retail
- Batch 08: Creative tools, design, media
- Batch 09: Logistics, supply chain, real estate
- Batch 10: Security, legal tech, HR tech)

Create the `data/` directory if it doesn't exist. Output a JSON array where each element matches this TypeScript interface:

```typescript
interface DemoCompany {
  name: string;        // e.g. "Lumina Health"
  slug: string;        // lowercase-hyphenated, unique, 2-3 words, e.g. "lumina-health"
  tagline: string;     // one-liner pitch
  description: string; // 2-3 sentences describing what the company does

  mission: string;       // 3-5 paragraph mission statement (markdown OK)
  marketResearch: string; // 3-5 paragraph market analysis (markdown OK)

  landingPage: LandingPageContent; // structured website content (see below)
}
```

The `landingPage` field must conform to these TypeScript types EXACTLY:

```typescript
interface ThemeColors {
  primary: string;       // hex color, e.g. "#6366f1"
  primaryLight: string;  // lighter variant
  primaryDark: string;   // darker variant
  accent: string;        // secondary accent
  background: string;    // page background
  surface: string;       // card background
  text: string;          // primary text color
  textMuted: string;     // muted text color
  border: string;        // border color
}

interface SiteTheme {
  mode: "light" | "dark";
  colors: ThemeColors;
  fontFamily: string;    // e.g. "'Inter', sans-serif"
  borderRadius: string;  // e.g. "0.75rem"
}

interface HeroContent {
  layout?: "centered" | "split" | "minimal" | "left";
  headline: string;
  subheadline: string;
  ctaText: string;
  ctaHref: string;   // use "#early-access" or "#contact" or "#pricing"
}

interface CtaContent {
  layout?: "gradient" | "minimal" | "outline";
  headline: string;
  subheadline: string;
  buttonText: string;
}

interface Feature {
  icon: string;       // single emoji
  title: string;
  description: string;
}

interface Testimonial {
  quote: string;
  author: string;
  role?: string;
}

interface PricingPlan {
  name: string;
  price: string;      // e.g. "$29", "Free"
  period: string;     // e.g. "/month", ""
  features: string[];
  ctaText: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

interface Section {
  id: string;         // kebab-case, e.g. "features", "how-it-works"
  type: "features" | "how-it-works" | "benefits" | "early-access" | "testimonials" | "pricing" | "faq" | "stats" | "timeline" | "comparison-table" | "newsletter-signup" | "contact-form";
  layout?: "cards" | "alternating" | "list" | "numbered" | "bento" | "testimonials" | "pricing" | "faq";
  headline: string;
  subheadline?: string;
  // Include the relevant data field based on type:
  items?: Feature[];                    // for features, how-it-works, benefits
  testimonials?: Testimonial[];         // for testimonials
  plans?: PricingPlan[];               // for pricing
  faqs?: FaqItem[];                    // for faq
  stats?: { value: string; label: string; suffix?: string }[];  // for stats
  timelineEvents?: { date: string; title: string; description: string; icon?: string }[];  // for timeline
  comparisonRows?: { feature: string; us: boolean | string; competitor: boolean | string }[];  // for comparison-table
  comparisonOurName?: string;
  comparisonCompetitorName?: string;
  contactFields?: { name: string; type: string; label: string; required?: boolean }[];  // for contact-form
  contactSubmitText?: string;
  newsletterButtonText?: string;        // for newsletter-signup
  newsletterPlaceholder?: string;
}

interface LandingPageContent {
  companyName: string;
  tagline: string;
  theme: SiteTheme;
  hero: HeroContent;
  cta: CtaContent;
  sections: Section[];   // 4-6 sections per company
  companyEmail: string;  // "{slug}@tryartha.com"
  domain: string;        // "{slug}.tryartha.com"
  projectSlug: string;   // same as slug
  animationPreset: "none" | "subtle" | "playful" | "dramatic";
  shadowStyle: "flat" | "elevated" | "glass";
}
```

## Requirements

1. **Diversity**: Each company should feel distinct — different color palettes, hero layouts, section combinations, animation presets, shadow styles, light vs dark themes.

2. **Realism**: Names should sound like real startups. Taglines should be punchy. Descriptions should clearly convey the value prop. Mission and market research should read like real startup content.

3. **Color palettes**: Use professional, distinct color schemes. Mix light and dark modes (roughly 60/40 light/dark). Don't reuse the same palette.

4. **Section variety**: Each company should have 4-6 sections. Vary the section types across companies. Use at least 3 different section types per company. Spread these across the batch:
   - features (cards, alternating, bento layouts)
   - how-it-works (numbered, list)
   - benefits (cards, alternating)
   - testimonials
   - pricing (2-3 tier plans)
   - faq (4-6 items)
   - stats (3-5 stats)
   - timeline
   - comparison-table
   - newsletter-signup
   - contact-form
   - early-access

5. **Hero layouts**: Mix "centered", "split", "minimal", "left" across the batch.

6. **CTA layouts**: Mix "gradient", "minimal", "outline" across the batch.

7. **Slugs**: Must be unique, lowercase, hyphenated, 2-3 words. No numbers.

8. **Emails/domains**: Set `companyEmail` to `"{slug}@tryartha.com"` and `domain` to `"{slug}.tryartha.com"`.

9. **Font families**: Vary fonts. Good options: `"'Inter', sans-serif"`, `"'DM Sans', sans-serif"`, `"'Plus Jakarta Sans', sans-serif"`, `"'Outfit', sans-serif"`, `"'Space Grotesk', sans-serif"`, `"'Manrope', sans-serif"`.

10. **ctaHref values**: Use section anchors like `"#features"`, `"#early-access"`, `"#pricing"`, `"#contact"`, `"#newsletter"`.

Write the file to `data/companies-batch-{BATCH_NUMBER}.json`. The output must be valid JSON — no comments, no trailing commas.

---

## After All 10 Batches

Once all batch files are generated, merge them:

```bash
# Run this in Claude Code or manually
node -e "
const fs = require('fs');
const all = [];
for (let i = 1; i <= 10; i++) {
  const batch = JSON.parse(fs.readFileSync('data/companies-batch-' + String(i).padStart(2,'0') + '.json', 'utf-8'));
  all.push(...batch);
}
// Verify unique slugs
const slugs = all.map(c => c.slug);
const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
if (dupes.length > 0) { console.error('DUPLICATE SLUGS:', dupes); process.exit(1); }
fs.writeFileSync('data/companies.json', JSON.stringify(all, null, 2));
console.log('Merged', all.length, 'companies into data/companies.json');
"
```

## Running the Script

```bash
# Dry run (validate JSON + test HTML generation)
npx tsx scripts/bulk-publish.ts data/companies.json --dry-run

# Publish first 2 as a test
npx tsx scripts/bulk-publish.ts data/companies.json --count=2

# Publish all
npx tsx scripts/bulk-publish.ts data/companies.json

# Resume from company #50 if it failed midway
npx tsx scripts/bulk-publish.ts data/companies.json --start=50
```

Required env vars (already in `.env.local`):
- `DATABASE_URL`
- `GITHUB_TOKEN`
- `GITHUB_ORG`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ZONE_ID`
- `DEMO_USER_ID` — UUID of the user who owns all demo companies
- `NEXT_PUBLIC_APP_URL` (defaults to `https://artha.run`)
