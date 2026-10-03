/**
 * Base website template system for Artha-generated landing pages.
 *
 * Instead of asking the AI to generate an entire HTML document from scratch
 * (including CDN boilerplate, React mount, Tailwind config, Navbar, Footer, etc.),
 * we provide a pre-built template with reusable components. The AI only needs to
 * produce the unique, customized content (hero copy, features, color palette, sections).
 *
 * This cuts token usage by ~60% per generation — a significant cost saving at scale.
 */

// ---------------------------------------------------------------------------
// Theme types
// ---------------------------------------------------------------------------

export interface ThemeColors {
  primary: string;       // e.g. "#6366f1" — main brand color
  primaryLight: string;  // lighter variant for backgrounds/accents
  primaryDark: string;   // darker variant for hover states
  accent: string;        // secondary accent color
  background: string;    // page background
  surface: string;       // card/section background
  text: string;          // primary text
  textMuted: string;     // secondary/muted text
  border: string;        // borders and dividers
}

export interface SiteTheme {
  mode: "light" | "dark";
  colors: ThemeColors;
  fontFamily: string;
  borderRadius: string;  // e.g. "0.75rem"
}

export type HeroLayout = "centered" | "split" | "minimal" | "left" | "bold-statement" | "diagonal" | "spotlight" | "editorial";

export interface HeroContent {
  layout?: HeroLayout;
  headline: string;
  subheadline: string;
  ctaText: string;
  ctaHref: string;
}

export type CtaLayout = "gradient" | "minimal" | "outline";

export interface CtaContent {
  layout?: CtaLayout;
  headline: string;
  subheadline: string;
  buttonText: string;
}

export interface Testimonial {
  quote: string;
  author: string;
  role?: string;
}

export interface PricingPlan {
  name: string;
  price: string;
  period: string;
  features: string[];
  ctaText: string;
  ctaHref?: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface Feature {
  icon: string;   // emoji or short SVG string
  title: string;
  description: string;
}

export type SectionLayout = "cards" | "alternating" | "list" | "numbered" | "bento" | "testimonials" | "pricing" | "faq";

export interface Section {
  id: string;
  type: "features" | "how-it-works" | "benefits" | "early-access" | "testimonials" | "pricing" | "faq" | "custom";
  layout?: SectionLayout;
  headline: string;
  subheadline?: string;
  items?: Feature[];
  testimonials?: Testimonial[];
  plans?: PricingPlan[];
  faqs?: FaqItem[];
  customJsx?: string;
}

export interface LandingPageContent {
  companyName: string;
  tagline: string;
  theme: SiteTheme;
  hero: HeroContent;
  cta: CtaContent;
  sections: Section[];
  companyEmail: string;
  domain: string;
  projectSlug?: string;
}

// ---------------------------------------------------------------------------
// Default themes by mode
// ---------------------------------------------------------------------------

export const DEFAULT_LIGHT_THEME: SiteTheme = {
  mode: "light",
  colors: {
    primary: "#6366f1",
    primaryLight: "#e0e7ff",
    primaryDark: "#4338ca",
    accent: "#f59e0b",
    background: "#ffffff",
    surface: "#f8fafc",
    text: "#0f172a",
    textMuted: "#64748b",
    border: "#e2e8f0",
  },
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  borderRadius: "0.75rem",
};

export const DEFAULT_DARK_THEME: SiteTheme = {
  mode: "dark",
  colors: {
    primary: "#818cf8",
    primaryLight: "#312e81",
    primaryDark: "#6366f1",
    accent: "#fbbf24",
    background: "#0f172a",
    surface: "#1e293b",
    text: "#f1f5f9",
    textMuted: "#94a3b8",
    border: "#334155",
  },
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  borderRadius: "0.75rem",
};

// ---------------------------------------------------------------------------
// Template builder
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Maps font family name to Google Fonts URL param (spaces → +) */
function getGoogleFontUrlParam(fontFamily: string): string {
  const base = fontFamily.split(",")[0].trim().replace(/'/g, "");
  return base.replace(/\s+/g, "+");
}

function buildTailwindConfig(theme: SiteTheme): string {
  const c = theme.colors;
  return `
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: '${c.primary}',
            'primary-light': '${c.primaryLight}',
            'primary-dark': '${c.primaryDark}',
            accent: '${c.accent}',
            surface: '${c.surface}',
            border: '${c.border}',
          },
          fontFamily: {
            sans: [${theme.fontFamily.split(",").map(f => `'${f.trim().replace(/'/g, "")}'`).join(", ")}],
          },
          borderRadius: {
            DEFAULT: '${theme.borderRadius}',
          },
        },
      },
    };`;
}

// ---------------------------------------------------------------------------
// Section heading helper — adds a small badge pill above section titles
// ---------------------------------------------------------------------------

function sectionBadgeLabel(type: string): string {
  const labels: Record<string, string> = {
    features: "Features",
    "how-it-works": "How It Works",
    benefits: "Benefits",
    "early-access": "Early Access",
    testimonials: "Testimonials",
    pricing: "Pricing",
    faq: "FAQ",
  };
  return labels[type] || "";
}

function renderSectionHeader(section: Section, theme: SiteTheme): string {
  const badge = sectionBadgeLabel(section.type);
  const badgeHtml = badge
    ? `<span className="inline-block px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase mb-4" style={{background: '${theme.colors.primary}15', color: '${theme.colors.primary}', border: '1px solid ${theme.colors.primary}30'}}>${badge}</span>`
    : "";
  return `
            <div className="text-center mb-16">
              ${badgeHtml}
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4" style={{color: '${theme.colors.text}'}}>${escapeHtml(section.headline)}</h2>
              ${section.subheadline ? `<p className="text-lg max-w-2xl mx-auto" style={{color: '${theme.colors.textMuted}'}}>${escapeHtml(section.subheadline)}</p>` : ""}
              <div className="mx-auto mt-6" style={{width: '3rem', height: '3px', borderRadius: '2px', background: 'linear-gradient(90deg, ${theme.colors.primary}, ${theme.colors.accent})'}}></div>
            </div>`;
}

// ---------------------------------------------------------------------------
// Component renderers — premium visual upgrade
// ---------------------------------------------------------------------------

function renderFeatureCard(feature: Feature, theme: SiteTheme, compact = false): string {
  const isEmoji = feature.icon.length <= 4 && !feature.icon.includes("<");
  const iconBlock = isEmoji
    ? `<div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 text-2xl" style={{background: '${theme.colors.primary}15', border: '1px solid ${theme.colors.primary}25'}}>${feature.icon}</div>`
    : `<div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5" style={{background: '${theme.colors.primary}15', border: '1px solid ${theme.colors.primary}25'}}><span dangerouslySetInnerHTML={{__html: \`${feature.icon}\`}} /></div>`;

  return `
            <div className="group relative ${compact ? "p-5" : "p-7"} rounded-2xl transition-all duration-500 hover:-translate-y-2 cursor-default"
                 style={{
                   background: '${theme.mode === "dark" ? `${theme.colors.surface}cc` : theme.colors.surface}',
                   border: '1px solid ${theme.colors.border}',
                   backdropFilter: 'blur(12px)',
                   boxShadow: '0 1px 3px ${theme.mode === "dark" ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.05)"}',
                 }}
                 onMouseOver={function(e){e.currentTarget.style.borderColor='${theme.colors.primary}60';e.currentTarget.style.boxShadow='0 20px 40px ${theme.colors.primary}15, 0 0 0 1px ${theme.colors.primary}20'}}
                 onMouseOut={function(e){e.currentTarget.style.borderColor='${theme.colors.border}';e.currentTarget.style.boxShadow='0 1px 3px ${theme.mode === "dark" ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.05)"}'}}
            >
              ${iconBlock}
              <h3 className="text-xl font-bold mb-2" style={{color: '${theme.colors.text}'}}>${escapeHtml(feature.title)}</h3>
              <p className="leading-relaxed" style={{color: '${theme.colors.textMuted}'}}>${escapeHtml(feature.description)}</p>
            </div>`;
}

function renderFeatureList(feature: Feature, theme: SiteTheme): string {
  const isEmoji = feature.icon.length <= 4 && !feature.icon.includes("<");
  const iconBlock = isEmoji
    ? `<div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-xl" style={{background: '${theme.colors.primary}15', border: '1px solid ${theme.colors.primary}25'}}>${feature.icon}</div>`
    : `<div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center" style={{background: '${theme.colors.primary}15', border: '1px solid ${theme.colors.primary}25'}}><span dangerouslySetInnerHTML={{__html: \`${feature.icon}\`}} /></div>`;

  return `
            <div className="flex items-start gap-5 p-5 rounded-2xl transition-all duration-300 hover:shadow-md"
                 style={{background: '${theme.colors.surface}', border: '1px solid ${theme.colors.border}'}}>
              ${iconBlock}
              <div>
                <h3 className="text-lg font-bold mb-1" style={{color: '${theme.colors.text}'}}>${escapeHtml(feature.title)}</h3>
                <p className="leading-relaxed" style={{color: '${theme.colors.textMuted}'}}>${escapeHtml(feature.description)}</p>
              </div>
            </div>`;
}

function renderNumberedStep(feature: Feature, theme: SiteTheme, index: number): string {
  const num = index + 1;
  return `
            <div className="flex gap-6 items-start group">
              <div className="flex-shrink-0 relative">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-xl transition-all duration-300"
                     style={{background: 'linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.primaryDark})', color: '${theme.mode === "dark" ? "#0f172a" : "#ffffff"}', boxShadow: '0 4px 12px ${theme.colors.primary}30'}}>
                  ${num}
                </div>
                ${index < 3 ? `<div className="absolute top-14 left-1/2 w-px h-8 -translate-x-1/2" style={{background: 'linear-gradient(to bottom, ${theme.colors.primary}40, transparent)'}}></div>` : ""}
              </div>
              <div className="pt-2">
                <h3 className="text-xl font-bold mb-2" style={{color: '${theme.colors.text}'}}>${escapeHtml(feature.title)}</h3>
                <p className="leading-relaxed" style={{color: '${theme.colors.textMuted}'}}>${escapeHtml(feature.description)}</p>
              </div>
            </div>`;
}

function renderTestimonial(t: { quote: string; author: string; role?: string }, theme: SiteTheme): string {
  const initials = t.author.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  return `
            <div className="relative p-8 rounded-2xl transition-all duration-300 hover:-translate-y-1"
                 style={{background: '${theme.colors.surface}', border: '1px solid ${theme.colors.border}', boxShadow: '0 2px 8px ${theme.mode === "dark" ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.04)"}'}}>
              <div className="absolute -top-0 left-8 text-6xl font-serif leading-none" style={{color: '${theme.colors.primary}25'}}>"</div>
              <div className="flex mb-4 gap-0.5">
                ${[1,2,3,4,5].map(() => `<svg width="16" height="16" viewBox="0 0 24 24" fill="${theme.colors.accent}" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`).join("")}
              </div>
              <p className="text-lg mb-6 leading-relaxed" style={{color: '${theme.colors.text}'}}>"${escapeHtml(t.quote)}"</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                     style={{background: 'linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.accent})', color: '${theme.mode === "dark" ? "#0f172a" : "#ffffff"}'}}>
                  ${initials}
                </div>
                <div>
                  <span className="font-semibold block" style={{color: '${theme.colors.text}'}}>${escapeHtml(t.author)}</span>
                  ${t.role ? `<span className="text-sm" style={{color: '${theme.colors.textMuted}'}}>${escapeHtml(t.role)}</span>` : ""}
                </div>
              </div>
            </div>`;
}

function renderPricingPlan(
  plan: { name: string; price: string; period: string; features: string[]; ctaText: string; ctaHref?: string },
  theme: SiteTheme,
  companyEmail: string,
  isFeatured = false
): string {
  const checkSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${theme.colors.primary}" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const featuresHtml = plan.features.map(f => `<li className="flex items-center gap-3 py-1" style={{color: '${theme.colors.textMuted}'}}><span className="flex-shrink-0" dangerouslySetInnerHTML={{__html: '${checkSvg}'}} />${escapeHtml(f)}</li>`).join("\n              ");
  const ctaHref = plan.ctaHref || `mailto:${companyEmail}`;

  const featuredBadge = isFeatured
    ? `<div className="absolute -top-3 left-1/2 -translate-x-1/2"><span className="px-4 py-1 rounded-full text-xs font-bold tracking-wide uppercase" style={{background: 'linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.accent})', color: '${theme.mode === "dark" ? "#0f172a" : "#ffffff"}'}}>Most Popular</span></div>`
    : "";

  return `
            <div className="relative p-8 rounded-2xl flex flex-col transition-all duration-300 hover:-translate-y-1"
                 style={{
                   background: '${theme.colors.surface}',
                   border: '${isFeatured ? `2px solid ${theme.colors.primary}` : `1px solid ${theme.colors.border}`}',
                   boxShadow: '${isFeatured ? `0 8px 32px ${theme.colors.primary}20, 0 0 0 1px ${theme.colors.primary}15` : `0 2px 8px ${theme.mode === "dark" ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.04)"}`}',
                 }}>
              ${featuredBadge}
              <h3 className="text-xl font-bold mb-1" style={{color: '${theme.colors.text}'}}>${escapeHtml(plan.name)}</h3>
              <div className="mb-6 mt-4">
                <span className="text-5xl font-extrabold" style={{color: '${theme.colors.primary}'}}>${escapeHtml(plan.price)}</span>
                <span className="text-base ml-1" style={{color: '${theme.colors.textMuted}'}}>/${escapeHtml(plan.period)}</span>
              </div>
              <ul className="space-y-3 mb-8 flex-grow">${featuresHtml}</ul>
              <a href="${escapeHtml(ctaHref)}" className="block text-center px-6 py-3.5 rounded-xl font-semibold transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
                 style={{
                   background: '${isFeatured ? `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.primaryDark})` : "transparent"}',
                   color: '${isFeatured ? (theme.mode === "dark" ? "#0f172a" : "#ffffff") : theme.colors.primary}',
                   border: '${isFeatured ? "none" : `2px solid ${theme.colors.primary}`}',
                 }}>
                ${escapeHtml(plan.ctaText)}
              </a>
            </div>`;
}

function renderFaqItem(faq: { question: string; answer: string }, theme: SiteTheme, index: number): string {
  // Must use the FaqAccordion JSX component since this is rendered inside
  // a <script type="text/babel"> block. Use JSON strings to safely handle quotes.
  const q = JSON.stringify(faq.question);
  const a = JSON.stringify(faq.answer);
  return `
            <FaqAccordion key={${index}} question={${q}} answer={${a}} index={${index}} />`;
}

// ---------------------------------------------------------------------------
// New section renderers — Phase 1A
// ---------------------------------------------------------------------------

function renderStatsSection(
  stats: { value: string; label: string; suffix?: string }[],
  headline: string | undefined,
  subheadline: string | undefined,
  theme: SiteTheme,
  sectionBg: string,
  ba: string,
  id: string
): string {
  const c = theme.colors;
  const cols = Math.min(stats.length, 4);
  const statsHtml = stats.map(s => `
            <div class="text-center p-6 group">
              <div class="text-5xl md:text-6xl font-extrabold mb-2 transition-colors duration-300 animated-counter" style="color: ${c.primary}" data-value="${escapeHtml(s.value)}" data-suffix="${escapeHtml(s.suffix || "")}">
                ${escapeHtml(s.value)}${escapeHtml(s.suffix || "")}
              </div>
              <div class="text-base font-medium mt-2" style="color: ${c.textMuted}">${escapeHtml(s.label)}</div>
            </div>`).join("\n");

  return `
        <section id="${id}" ${ba} class="py-24 px-6" style="background: ${sectionBg}">
          <div class="max-w-6xl mx-auto">
            ${headline ? `<div class="text-center mb-16">
              <h2 class="text-3xl md:text-4xl lg:text-5xl font-bold mb-4" style="color: ${c.text}">${escapeHtml(headline)}</h2>
              ${subheadline ? `<p class="text-lg max-w-2xl mx-auto" style="color: ${c.textMuted}">${escapeHtml(subheadline)}</p>` : ""}
            </div>` : ""}
            <div class="grid grid-cols-2 md:grid-cols-${cols} gap-8">
              ${statsHtml}
            </div>
          </div>
        </section>`;
}

function renderTeamSection(
  members: { name: string; role: string; avatarUrl?: string; bio?: string; linkedin?: string; twitter?: string }[],
  headline: string,
  subheadline: string | undefined,
  theme: SiteTheme,
  sectionBg: string,
  ba: string,
  id: string
): string {
  const c = theme.colors;
  const isDark = theme.mode === "dark";
  const cols = members.length <= 2 ? "md:grid-cols-2" : members.length <= 3 ? "md:grid-cols-3" : "md:grid-cols-4";
  const membersHtml = members.map(m => {
    const initials = m.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
    const socialLinks = [
      m.linkedin ? `<a href="${escapeHtml(m.linkedin)}" target="_blank" rel="noopener noreferrer" class="transition-colors duration-200" style="color: ${c.textMuted}" onmouseover="this.style.color='${c.primary}'" onmouseout="this.style.color='${c.textMuted}'"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg></a>` : "",
      m.twitter ? `<a href="${escapeHtml(m.twitter)}" target="_blank" rel="noopener noreferrer" class="transition-colors duration-200" style="color: ${c.textMuted}" onmouseover="this.style.color='${c.primary}'" onmouseout="this.style.color='${c.textMuted}'"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>` : "",
    ].filter(Boolean).join("\n                    ");

    return `
            <div class="text-center p-6 rounded-2xl transition-all duration-300 hover:-translate-y-1"
                 style="background: ${c.surface}; border: 1px solid ${c.border}">
              ${m.avatarUrl
                ? `<img src="${escapeHtml(m.avatarUrl)}" alt="${escapeHtml(m.name)}" class="w-24 h-24 rounded-full mx-auto mb-4 object-cover" loading="lazy" />`
                : `<div class="w-24 h-24 rounded-full mx-auto mb-4 flex items-center justify-center text-2xl font-bold"
                       style="background: linear-gradient(135deg, ${c.primary}, ${c.accent}); color: ${isDark ? "#0f172a" : "#ffffff"}">${initials}</div>`
              }
              <h3 class="text-xl font-bold" style="color: ${c.text}">${escapeHtml(m.name)}</h3>
              <p class="text-sm font-medium mt-1" style="color: ${c.primary}">${escapeHtml(m.role)}</p>
              ${m.bio ? `<p class="mt-3 text-sm leading-relaxed" style="color: ${c.textMuted}">${escapeHtml(m.bio)}</p>` : ""}
              ${socialLinks ? `<div class="flex items-center justify-center gap-3 mt-4">${socialLinks}</div>` : ""}
            </div>`;
  }).join("\n");

  return `
        <section id="${id}" ${ba} class="py-24 px-6" style="background: ${sectionBg}">
          <div class="max-w-6xl mx-auto">
            <div class="text-center mb-16">
              <h2 class="text-3xl md:text-4xl lg:text-5xl font-bold mb-4" style="color: ${c.text}">${escapeHtml(headline)}</h2>
              ${subheadline ? `<p class="text-lg max-w-2xl mx-auto" style="color: ${c.textMuted}">${escapeHtml(subheadline)}</p>` : ""}
            </div>
            <div class="grid ${cols} gap-8">
              ${membersHtml}
            </div>
          </div>
        </section>`;
}

function renderLogoCloud(
  logos: { name: string; url?: string; imageUrl?: string }[],
  headline: string | undefined,
  theme: SiteTheme,
  sectionBg: string,
  ba: string,
  id: string
): string {
  const c = theme.colors;
  const logosHtml = logos.map(l => {
    const inner = l.imageUrl
      ? `<img src="${escapeHtml(l.imageUrl)}" alt="${escapeHtml(l.name)}" class="h-8 object-contain transition-all duration-300" style="filter: grayscale(100%) opacity(0.5)" loading="lazy" />`
      : `<span class="text-lg font-semibold tracking-wide transition-all duration-300" style="color: ${c.textMuted}80" onmouseover="this.style.color='${c.text}'" onmouseout="this.style.color='${c.textMuted}80'">${escapeHtml(l.name)}</span>`;
    return l.url
      ? `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer" class="flex items-center">${inner}</a>`
      : `<div class="flex items-center">${inner}</div>`;
  }).join("\n              ");

  return `
        <section id="${id}" ${ba} class="py-16 px-6" style="background: ${sectionBg}">
          <div class="max-w-6xl mx-auto">
            ${headline ? `<p class="text-center text-sm font-semibold uppercase tracking-widest mb-10" style="color: ${c.textMuted}">${escapeHtml(headline)}</p>` : ""}
            <div class="flex flex-wrap items-center justify-center gap-x-12 gap-y-8">
              ${logosHtml}
            </div>
          </div>
        </section>`;
}

function renderContactFormSection(
  fields: { name: string; type: string; label: string; required?: boolean; options?: string[] }[],
  headline: string,
  subheadline: string | undefined,
  submitText: string,
  theme: SiteTheme,
  sectionBg: string,
  ba: string,
  id: string,
  formCaptureUrl?: string
): string {
  const c = theme.colors;
  const isDark = theme.mode === "dark";

  const fieldsHtml = fields.map(f => {
    const inputStyle = `style="width: 100%; padding: 0.875rem 1rem; border-radius: ${theme.borderRadius}; border: 1px solid ${c.border}; background: ${c.surface}; color: ${c.text}; font-size: 1rem; outline: none; transition: border-color 0.2s, box-shadow 0.2s"`;
    const focusHandler = `onfocus="this.style.borderColor='${c.primary}';this.style.boxShadow='0 0 0 3px ${c.primary}20'" onblur="this.style.borderColor='${c.border}';this.style.boxShadow='none'"`;

    if (f.type === "textarea") {
      return `
                <div>
                  <label class="block text-sm font-medium mb-2" style="color: ${c.text}">${escapeHtml(f.label)}${f.required ? ' *' : ''}</label>
                  <textarea name="${escapeHtml(f.name)}" rows="4" ${inputStyle} ${focusHandler} placeholder="${escapeHtml(f.label)}" ${f.required ? "required" : ""}></textarea>
                </div>`;
    }
    if (f.type === "select" && f.options?.length) {
      const optionsHtml = f.options.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("");
      return `
                <div>
                  <label class="block text-sm font-medium mb-2" style="color: ${c.text}">${escapeHtml(f.label)}${f.required ? ' *' : ''}</label>
                  <select name="${escapeHtml(f.name)}" ${inputStyle} ${focusHandler} ${f.required ? "required" : ""}>
                    <option value="">Select...</option>
                    ${optionsHtml}
                  </select>
                </div>`;
    }
    return `
                <div>
                  <label class="block text-sm font-medium mb-2" style="color: ${c.text}">${escapeHtml(f.label)}${f.required ? ' *' : ''}</label>
                  <input type="${f.type || "text"}" name="${escapeHtml(f.name)}" ${inputStyle} ${focusHandler} placeholder="${escapeHtml(f.label)}" ${f.required ? "required" : ""} />
                </div>`;
  }).join("\n");

  return `
        <section id="${id}" ${ba} class="py-24 px-6" style="background: ${sectionBg}">
          <div class="max-w-2xl mx-auto">
            <div class="text-center mb-12">
              <h2 class="text-3xl md:text-4xl lg:text-5xl font-bold mb-4" style="color: ${c.text}">${escapeHtml(headline)}</h2>
              ${subheadline ? `<p class="text-lg max-w-xl mx-auto" style="color: ${c.textMuted}">${escapeHtml(subheadline)}</p>` : ""}
            </div>
            <form class="contact-form space-y-5" data-action="${formCaptureUrl || ""}" data-slug="${id}">
              <div style="position: absolute; left: -9999px" aria-hidden="true">
                <input type="text" name="_honey" tabindex="-1" autocomplete="off" />
              </div>
              ${fieldsHtml}
              <button type="submit" class="w-full px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
                style="background: linear-gradient(135deg, ${c.primary}, ${c.primaryDark}); color: ${isDark ? "#0f172a" : "#ffffff"}; border: none">
                ${escapeHtml(submitText)}
              </button>
            </form>
          </div>
        </section>`;
}

function renderComparisonTable(
  rows: { feature: string; us: boolean | string; competitor: boolean | string }[],
  headline: string,
  subheadline: string | undefined,
  ourName: string,
  competitorName: string,
  theme: SiteTheme,
  sectionBg: string,
  ba: string,
  id: string
): string {
  const c = theme.colors;
  const isDark = theme.mode === "dark";
  const checkIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c.primary}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const xIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c.textMuted}60" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  const rowsHtml = rows.map(r => {
    const usCell = typeof r.us === "boolean"
      ? (r.us ? checkIcon : xIcon)
      : `<span style="color: ${c.text}">${escapeHtml(r.us as string)}</span>`;
    const compCell = typeof r.competitor === "boolean"
      ? (r.competitor ? checkIcon : xIcon)
      : `<span style="color: ${c.textMuted}">${escapeHtml(r.competitor as string)}</span>`;
    return `
                  <tr style="border-top: 1px solid ${c.border}">
                    <td class="p-4 font-medium" style="color: ${c.text}">${escapeHtml(r.feature)}</td>
                    <td class="p-4 text-center">${usCell}</td>
                    <td class="p-4 text-center">${compCell}</td>
                  </tr>`;
  }).join("\n");

  return `
        <section id="${id}" ${ba} class="py-24 px-6" style="background: ${sectionBg}">
          <div class="max-w-4xl mx-auto">
            <div class="text-center mb-16">
              <h2 class="text-3xl md:text-4xl lg:text-5xl font-bold mb-4" style="color: ${c.text}">${escapeHtml(headline)}</h2>
              ${subheadline ? `<p class="text-lg max-w-2xl mx-auto" style="color: ${c.textMuted}">${escapeHtml(subheadline)}</p>` : ""}
            </div>
            <div class="overflow-x-auto rounded-2xl" style="border: 1px solid ${c.border}">
              <table style="width: 100%; border-collapse: collapse">
                <thead>
                  <tr style="background: ${c.surface}">
                    <th class="text-left p-4 font-medium" style="color: ${c.textMuted}">Feature</th>
                    <th class="text-center p-4 font-bold" style="color: ${c.primary}">${escapeHtml(ourName)}</th>
                    <th class="text-center p-4 font-medium" style="color: ${c.textMuted}">${escapeHtml(competitorName)}</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}
                </tbody>
              </table>
            </div>
          </div>
        </section>`;
}

function renderTimeline(
  events: { date: string; title: string; description: string; icon?: string }[],
  headline: string,
  subheadline: string | undefined,
  theme: SiteTheme,
  sectionBg: string,
  ba: string,
  id: string
): string {
  const c = theme.colors;
  const isDark = theme.mode === "dark";
  const eventsHtml = events.map((ev, i) => {
    const isLast = i === events.length - 1;
    return `
            <div class="flex gap-6 items-start relative">
              <div class="flex-shrink-0 relative">
                <div class="w-12 h-12 rounded-full flex items-center justify-center text-lg z-10 relative"
                     style="background: linear-gradient(135deg, ${c.primary}, ${c.accent}); color: ${isDark ? "#0f172a" : "#ffffff"}; box-shadow: 0 4px 12px ${c.primary}25">
                  ${ev.icon || "📌"}
                </div>
                ${!isLast ? `<div class="absolute top-12 left-1/2 w-px -translate-x-1/2" style="height: calc(100% + 1rem); background: linear-gradient(to bottom, ${c.primary}40, ${c.primary}10)"></div>` : ""}
              </div>
              <div class="pb-10">
                <span class="text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full" style="background: ${c.primary}12; color: ${c.primary}">${escapeHtml(ev.date)}</span>
                <h3 class="text-xl font-bold mt-3" style="color: ${c.text}">${escapeHtml(ev.title)}</h3>
                <p class="mt-2 leading-relaxed" style="color: ${c.textMuted}">${escapeHtml(ev.description)}</p>
              </div>
            </div>`;
  }).join("\n");

  return `
        <section id="${id}" ${ba} class="py-24 px-6" style="background: ${sectionBg}">
          <div class="max-w-3xl mx-auto">
            <div class="text-center mb-16">
              <h2 class="text-3xl md:text-4xl lg:text-5xl font-bold mb-4" style="color: ${c.text}">${escapeHtml(headline)}</h2>
              ${subheadline ? `<p class="text-lg max-w-2xl mx-auto" style="color: ${c.textMuted}">${escapeHtml(subheadline)}</p>` : ""}
            </div>
            <div class="relative">
              ${eventsHtml}
            </div>
          </div>
        </section>`;
}

function renderNewsletterSignup(
  headline: string,
  subheadline: string | undefined,
  buttonText: string,
  placeholder: string,
  theme: SiteTheme,
  sectionBg: string,
  ba: string,
  id: string,
  formCaptureUrl?: string
): string {
  const c = theme.colors;
  const isDark = theme.mode === "dark";
  return `
        <section id="${id}" ${ba} class="py-24 px-6" style="background: ${sectionBg}">
          <div class="max-w-xl mx-auto text-center">
            <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-6" style="background: ${c.primary}12; border: 1px solid ${c.primary}20">✉️</div>
            <h2 class="text-3xl md:text-4xl font-bold mb-4" style="color: ${c.text}">${escapeHtml(headline)}</h2>
            ${subheadline ? `<p class="text-lg mb-8" style="color: ${c.textMuted}">${escapeHtml(subheadline)}</p>` : ""}
            <EmailCapture formCaptureUrl="${formCaptureUrl || ""}" buttonText="${escapeHtml(buttonText)}" primary="${c.primary}" isDark={${isDark}} layout="minimal" />
          </div>
        </section>`;
}

function renderBlogGrid(
  posts: { title: string; excerpt: string; imageUrl?: string; href: string; date?: string; tag?: string }[],
  headline: string,
  subheadline: string | undefined,
  theme: SiteTheme,
  sectionBg: string,
  ba: string,
  id: string
): string {
  const c = theme.colors;
  const cols = posts.length <= 2 ? "md:grid-cols-2" : "md:grid-cols-3";
  const postsHtml = posts.map(p => `
            <a href="${escapeHtml(p.href)}" class="group rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 block"
               style="background: ${c.surface}; border: 1px solid ${c.border}; text-decoration: none">
              ${p.imageUrl ? `<div class="aspect-video overflow-hidden"><img src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.title)}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async" /></div>` : `<div class="aspect-video flex items-center justify-center" style="background: linear-gradient(135deg, ${c.primary}10, ${c.accent}08)"><span class="text-4xl opacity-30">📝</span></div>`}
              <div class="p-6">
                <div class="flex items-center gap-3 mb-3">
                  ${p.tag ? `<span class="text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full" style="background: ${c.primary}12; color: ${c.primary}">${escapeHtml(p.tag)}</span>` : ""}
                  ${p.date ? `<span class="text-xs" style="color: ${c.textMuted}">${escapeHtml(p.date)}</span>` : ""}
                </div>
                <h3 class="text-lg font-bold mb-2 transition-colors duration-200" style="color: ${c.text}">${escapeHtml(p.title)}</h3>
                <p class="text-sm leading-relaxed" style="color: ${c.textMuted}">${escapeHtml(p.excerpt)}</p>
              </div>
            </a>`).join("\n");

  return `
        <section id="${id}" ${ba} class="py-24 px-6" style="background: ${sectionBg}">
          <div class="max-w-6xl mx-auto">
            <div class="text-center mb-16">
              <h2 class="text-3xl md:text-4xl lg:text-5xl font-bold mb-4" style="color: ${c.text}">${escapeHtml(headline)}</h2>
              ${subheadline ? `<p class="text-lg max-w-2xl mx-auto" style="color: ${c.textMuted}">${escapeHtml(subheadline)}</p>` : ""}
            </div>
            <div class="grid ${cols} gap-8">
              ${postsHtml}
            </div>
          </div>
        </section>`;
}

function renderImageGallery(
  images: { src: string; alt: string; caption?: string }[],
  headline: string | undefined,
  theme: SiteTheme,
  sectionBg: string,
  ba: string,
  id: string,
  columns: number = 3,
  layout: string = "grid"
): string {
  const c = theme.colors;
  const cols = layout === "masonry" ? `columns-2 md:columns-${columns} gap-4 space-y-4` : `grid grid-cols-2 md:grid-cols-${columns} gap-4`;
  const imagesHtml = images.map(img => `
            <div class="${layout === "masonry" ? "break-inside-avoid" : ""} group relative overflow-hidden rounded-2xl cursor-pointer"
                 style="border: 1px solid ${c.border}">
              <img src="${escapeHtml(img.src)}" alt="${escapeHtml(img.alt)}" class="w-full ${layout === "masonry" ? "" : "aspect-square"} object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" decoding="async" />
              ${img.caption ? `<div class="absolute inset-x-0 bottom-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style="background: linear-gradient(transparent, rgba(0,0,0,0.7))"><p class="text-sm text-white">${escapeHtml(img.caption)}</p></div>` : ""}
            </div>`).join("\n");

  return `
        <section id="${id}" ${ba} class="py-24 px-6" style="background: ${sectionBg}">
          <div class="max-w-6xl mx-auto">
            ${headline ? `<div class="text-center mb-16"><h2 class="text-3xl md:text-4xl lg:text-5xl font-bold" style="color: ${c.text}">${escapeHtml(headline)}</h2></div>` : ""}
            <div class="${cols}">
              ${imagesHtml}
            </div>
          </div>
        </section>`;
}

function renderVideoHero(
  hero: HeroContent & { videoUrl?: string; videoPoster?: string },
  c: ThemeColors,
  isDark: boolean,
  tagline: string,
  ba: string
): string {
  const videoUrl = hero.videoUrl || "";
  const isYoutube = videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be");
  const isVimeo = videoUrl.includes("vimeo.com");

  const headline = `<h1 class="font-extrabold leading-[1.1] mb-6 animate-fade-in-up" style="font-size: clamp(2.5rem, 6vw, 4.5rem); color: #ffffff">${escapeHtml(hero.headline)}</h1>`;
  const subheadline = `<p class="text-lg md:text-xl max-w-2xl mx-auto mb-10 animate-fade-in-up animate-delay-1 leading-relaxed" style="color: rgba(255,255,255,0.8)">${escapeHtml(hero.subheadline)}</p>`;
  const ctaBtn = `<div class="animate-fade-in-up animate-delay-2"><a href="${hero.ctaHref}" class="cta-button inline-flex items-center gap-2 px-8 py-4 rounded-full text-lg font-semibold transition-all duration-300" style="background: rgba(255,255,255,0.95); color: ${c.primary}; box-shadow: 0 4px 20px rgba(0,0,0,0.3)">${escapeHtml(hero.ctaText)}<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></a></div>`;

  let videoBg: string;
  if (isYoutube || isVimeo) {
    const embedUrl = isYoutube
      ? videoUrl.replace("watch?v=", "embed/").replace("youtu.be/", "youtube.com/embed/") + "?autoplay=1&mute=1&loop=1&controls=0&showinfo=0&rel=0&playlist=" + (videoUrl.split("v=")[1] || videoUrl.split("/").pop() || "")
      : videoUrl.replace("vimeo.com/", "player.vimeo.com/video/") + "?autoplay=1&muted=1&loop=1&background=1";
    videoBg = `<div class="absolute inset-0 overflow-hidden"><iframe src="${escapeHtml(embedUrl)}" class="absolute w-full h-full object-cover" style="border: none; transform: scale(1.2); pointer-events: none" allow="autoplay; fullscreen" loading="lazy"></iframe></div>`;
  } else if (videoUrl) {
    videoBg = `<div class="absolute inset-0 overflow-hidden"><video autoPlay muted loop playsInline class="absolute w-full h-full object-cover" ${hero.videoPoster ? `poster="${escapeHtml(hero.videoPoster)}"` : ""}><source src="${escapeHtml(videoUrl)}" type="video/mp4" /></video></div>`;
  } else {
    videoBg = `<div class="absolute inset-0" style="background: linear-gradient(135deg, ${c.primary}, ${c.primaryDark})"></div>`;
  }

  return `
        <section ${ba} class="relative min-h-screen flex items-center justify-center px-6 overflow-hidden">
          ${videoBg}
          <div class="absolute inset-0" style="background: rgba(0,0,0,0.5)"></div>
          <div class="relative max-w-4xl mx-auto text-center z-10">
            ${headline}
            ${subheadline}
            ${ctaBtn}
          </div>
        </section>`;
}

function renderProductCatalog(
  products: { name: string; description: string; price: string; imageUrl?: string; ctaText: string; ctaHref?: string; badge?: string }[],
  headline: string,
  subheadline: string | undefined,
  theme: SiteTheme,
  sectionBg: string,
  ba: string,
  id: string,
  companyEmail: string
): string {
  const c = theme.colors;
  const isDark = theme.mode === "dark";
  const cols = products.length <= 2 ? "md:grid-cols-2" : products.length <= 3 ? "md:grid-cols-3" : "md:grid-cols-4";
  const productsHtml = products.map(p => `
            <div class="relative rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-2 flex flex-col"
                 style="background: ${c.surface}; border: 1px solid ${c.border}">
              ${p.badge ? `<div class="absolute top-3 right-3 z-10"><span class="px-3 py-1 rounded-full text-xs font-bold uppercase" style="background: linear-gradient(135deg, ${c.primary}, ${c.accent}); color: ${isDark ? "#0f172a" : "#ffffff"}">${escapeHtml(p.badge)}</span></div>` : ""}
              ${p.imageUrl
                ? `<div class="aspect-square overflow-hidden"><img src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.name)}" class="w-full h-full object-cover transition-transform duration-500 hover:scale-110" loading="lazy" decoding="async" /></div>`
                : `<div class="aspect-square flex items-center justify-center" style="background: linear-gradient(135deg, ${c.primary}08, ${c.accent}05)"><span class="text-6xl opacity-20">🛍️</span></div>`
              }
              <div class="p-6 flex flex-col flex-grow">
                <h3 class="text-xl font-bold mb-2" style="color: ${c.text}">${escapeHtml(p.name)}</h3>
                <p class="text-sm mb-4 flex-grow" style="color: ${c.textMuted}">${escapeHtml(p.description)}</p>
                <div class="flex items-center justify-between mt-auto">
                  <span class="text-2xl font-extrabold" style="color: ${c.primary}">${escapeHtml(p.price)}</span>
                  <a href="${escapeHtml(p.ctaHref || `mailto:${companyEmail}`)}" class="px-5 py-2.5 rounded-full font-semibold text-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
                     style="background: linear-gradient(135deg, ${c.primary}, ${c.primaryDark}); color: ${isDark ? "#0f172a" : "#ffffff"}">
                    ${escapeHtml(p.ctaText)}
                  </a>
                </div>
              </div>
            </div>`).join("\n");

  return `
        <section id="${id}" ${ba} class="py-24 px-6" style="background: ${sectionBg}">
          <div class="max-w-6xl mx-auto">
            <div class="text-center mb-16">
              <h2 class="text-3xl md:text-4xl lg:text-5xl font-bold mb-4" style="color: ${c.text}">${escapeHtml(headline)}</h2>
              ${subheadline ? `<p class="text-lg max-w-2xl mx-auto" style="color: ${c.textMuted}">${escapeHtml(subheadline)}</p>` : ""}
            </div>
            <div class="grid ${cols} gap-8">
              ${productsHtml}
            </div>
          </div>
        </section>`;
}

/** Build data-block-* attributes for the visual editor to parse */
function blockAttrs(type: string, id: string): string {
  return `data-block-type="${type}" data-block-id="${id}"`;
}

function renderSection(section: Section, theme: SiteTheme, companyEmail: string, sectionIndex: number): string {
  if (section.type === "custom" && section.customJsx) {
    return section.customJsx;
  }

  const layout = section.layout || "cards";
  const items = section.items || [];
  const useAltBg = sectionIndex % 2 === 1;
  const sectionBg = useAltBg ? theme.colors.surface : theme.colors.background;
  const ba = blockAttrs(section.type, section.id);

  // Testimonials section
  if (section.type === "testimonials" && section.testimonials?.length) {
    const gridCols = section.testimonials.length <= 2 ? "md:grid-cols-2" : "md:grid-cols-3";
    return `
        <section id="${section.id}" ${ba} className="py-24 px-6" style={{background: '${sectionBg}'}}>
          <div className="max-w-6xl mx-auto">
            ${renderSectionHeader(section, theme)}
            <div className="grid ${gridCols} gap-8">${section.testimonials.map(t => renderTestimonial(t, theme)).join("\n")}
            </div>
          </div>
        </section>`;
  }

  // Pricing section
  if (section.type === "pricing" && section.plans?.length) {
    const gridClass = section.plans.length === 1 ? "grid gap-8 max-w-md mx-auto" : section.plans.length === 2 ? "grid gap-8 md:grid-cols-2 max-w-4xl mx-auto" : "grid gap-8 md:grid-cols-3";
    const featuredIndex = section.plans.length === 3 ? 1 : section.plans.length === 2 ? 1 : 0;
    return `
        <section id="${section.id}" ${ba} className="py-24 px-6" style={{background: '${sectionBg}'}}>
          <div className="max-w-6xl mx-auto">
            ${renderSectionHeader(section, theme)}
            <div className="${gridClass}">${section.plans.map((p, i) => renderPricingPlan(p, theme, companyEmail, i === featuredIndex)).join("\n")}
            </div>
          </div>
        </section>`;
  }

  // FAQ section
  if (section.type === "faq" && section.faqs?.length) {
    return `
        <section id="${section.id}" ${ba} className="py-24 px-6" style={{background: '${sectionBg}'}}>
          <div className="max-w-3xl mx-auto">
            ${renderSectionHeader(section, theme)}
            <div className="space-y-3">${section.faqs.map((f, i) => renderFaqItem(f, theme, i)).join("\n")}
            </div>
          </div>
        </section>`;
  }

  // Feature-based sections with layout variants
  if (layout === "list") {
    return `
        <section id="${section.id}" ${ba} className="py-24 px-6" style={{background: '${sectionBg}'}}>
          <div className="max-w-4xl mx-auto">
            ${renderSectionHeader(section, theme)}
            <div className="space-y-4">${items.map((f) => renderFeatureList(f, theme)).join("\n")}
            </div>
          </div>
        </section>`;
  }

  if (layout === "numbered") {
    return `
        <section id="${section.id}" ${ba} className="py-24 px-6" style={{background: '${sectionBg}'}}>
          <div className="max-w-3xl mx-auto">
            ${renderSectionHeader(section, theme)}
            <div className="space-y-10">${items.map((f, i) => renderNumberedStep(f, theme, i)).join("\n")}
            </div>
          </div>
        </section>`;
  }

  if (layout === "alternating") {
    const alternatingItems = items.map((f, i) => {
      const align = i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse";
      const isEmoji = f.icon.length <= 4 && !f.icon.includes("<");
      const iconBlock = isEmoji
        ? `<div className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl" style={{background: '${theme.colors.primary}12', border: '1px solid ${theme.colors.primary}20'}}>${f.icon}</div>`
        : `<span dangerouslySetInnerHTML={{__html: \`${f.icon}\`}} />`;
      return `
            <div className="flex flex-col ${align} gap-10 items-center py-12" style={{borderBottom: '1px solid ${theme.colors.border}20'}}>
              <div className="flex-1 flex justify-center">${iconBlock}</div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold mb-3" style={{color: '${theme.colors.text}'}}>${escapeHtml(f.title)}</h3>
                <p className="text-lg leading-relaxed" style={{color: '${theme.colors.textMuted}'}}>${escapeHtml(f.description)}</p>
              </div>
            </div>`;
    }).join("\n");
    return `
        <section id="${section.id}" ${ba} className="py-24 px-6" style={{background: '${sectionBg}'}}>
          <div className="max-w-5xl mx-auto">
            ${renderSectionHeader(section, theme)}
            <div>${alternatingItems}
            </div>
          </div>
        </section>`;
  }

  // Default: cards or bento
  const gridCols = items.length <= 2 ? "md:grid-cols-2" : items.length === 4 ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3";
  return `
        <section id="${section.id}" ${ba} className="py-24 px-6" style={{background: '${sectionBg}'}}>
          <div className="max-w-6xl mx-auto">
            ${renderSectionHeader(section, theme)}
            <div className="grid ${gridCols} gap-6">${items.map(f => renderFeatureCard(f, theme)).join("\n")}
            </div>
          </div>
        </section>`;
}

/**
 * Builds a unique decorative visual for the split hero layout.
 * Uses a simple hash of the company name to deterministically pick
 * one of several distinct visual styles so no two sites look the same.
 */
function buildSplitHeroVisual(c: ThemeColors, companyName?: string): string {
  const seed = (companyName || "artha").split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const variant = seed % 5;

  switch (variant) {
    // Isometric 3D blocks
    case 0:
      return `<div className="relative w-80 h-80">
        <div className="absolute top-12 left-12 w-40 h-40 animate-fade-in-up" style={{background: 'linear-gradient(145deg, ${c.primary}30, ${c.primary}10)', border: '1px solid ${c.primary}20', borderRadius: '24px', transform: 'perspective(800px) rotateY(-15deg) rotateX(10deg)', boxShadow: '20px 20px 60px ${c.primary}10, -5px -5px 20px ${c.accent}05'}}></div>
        <div className="absolute top-24 left-28 w-36 h-36 animate-fade-in-up animate-delay-1" style={{background: 'linear-gradient(145deg, ${c.accent}25, ${c.accent}08)', border: '1px solid ${c.accent}15', borderRadius: '20px', transform: 'perspective(800px) rotateY(-15deg) rotateX(10deg)'}}></div>
        <div className="absolute bottom-16 right-12 w-16 h-16 rounded-2xl animate-float-slow" style={{background: 'linear-gradient(135deg, ${c.primary}, ${c.accent})', boxShadow: '0 12px 40px ${c.primary}30', transform: 'rotate(12deg)'}}></div>
      </div>`;

    // Gradient mesh / aurora
    case 1:
      return `<div className="relative w-80 h-72 rounded-3xl overflow-hidden" style={{background: '${c.surface}', border: '1px solid ${c.border}'}}>
        <div className="absolute -top-20 -left-20 w-60 h-60 rounded-full animate-float-slow" style={{background: 'radial-gradient(circle, ${c.primary}40, transparent 70%)', filter: 'blur(40px)'}}></div>
        <div className="absolute -bottom-16 -right-16 w-56 h-56 rounded-full animate-float-slow-reverse" style={{background: 'radial-gradient(circle, ${c.accent}35, transparent 70%)', filter: 'blur(40px)'}}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full animate-pulse-subtle" style={{background: 'radial-gradient(circle, ${c.primaryLight}50, transparent 70%)', filter: 'blur(30px)'}}></div>
        <div className="absolute inset-0" style={{backdropFilter: 'blur(1px)'}}></div>
      </div>`;

    // Organic blob shapes
    case 2:
      return `<div className="relative w-80 h-80">
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-44 h-44 animate-float-slow" style={{background: 'linear-gradient(135deg, ${c.primary}20, ${c.primary}05)', borderRadius: '30% 70% 70% 30% / 30% 30% 70% 70%'}}></div>
        <div className="absolute bottom-12 left-8 w-36 h-36 animate-float-slow-reverse" style={{background: 'linear-gradient(135deg, ${c.accent}20, ${c.accent}05)', borderRadius: '70% 30% 30% 70% / 70% 70% 30% 30%'}}></div>
        <div className="absolute bottom-8 right-8 w-40 h-40 animate-pulse-subtle" style={{background: 'linear-gradient(135deg, ${c.primary}15, ${c.accent}10)', borderRadius: '40% 60% 60% 40% / 60% 40% 60% 40%'}}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-2xl animate-pulse-subtle" style={{background: 'linear-gradient(135deg, ${c.primary}, ${c.accent})', boxShadow: '0 8px 32px ${c.primary}30', transform: 'translate(-50%, -50%) rotate(45deg)'}}></div>
      </div>`;

    // Vertical bar chart / equalizer
    case 3:
      return `<div className="relative w-72 h-72 flex items-end justify-center gap-3 pb-4">
        <div className="w-10 rounded-t-xl animate-fade-in-up" style={{height: '45%', background: 'linear-gradient(180deg, ${c.primary}, ${c.primary}60)'}}></div>
        <div className="w-10 rounded-t-xl animate-fade-in-up animate-delay-1" style={{height: '70%', background: 'linear-gradient(180deg, ${c.accent}, ${c.accent}60)'}}></div>
        <div className="w-10 rounded-t-xl animate-fade-in-up animate-delay-2" style={{height: '55%', background: 'linear-gradient(180deg, ${c.primary}, ${c.primaryDark})'}}></div>
        <div className="w-10 rounded-t-xl animate-fade-in-up animate-delay-3" style={{height: '85%', background: 'linear-gradient(180deg, ${c.primary}, ${c.accent})'}}></div>
        <div className="w-10 rounded-t-xl animate-fade-in-up" style={{height: '40%', background: 'linear-gradient(180deg, ${c.accent}, ${c.primary}60)'}}></div>
        <div className="w-10 rounded-t-xl animate-fade-in-up animate-delay-1" style={{height: '65%', background: 'linear-gradient(180deg, ${c.primaryDark}, ${c.primary})'}}></div>
      </div>`;

    // Overlapping circles
    case 4:
    default:
      return `<div className="relative w-80 h-80">
        <div className="absolute top-8 left-8 w-44 h-44 rounded-full animate-fade-in-up" style={{background: 'linear-gradient(135deg, ${c.primary}25, ${c.primary}08)', border: '1px solid ${c.primary}15'}}></div>
        <div className="absolute top-20 left-24 w-44 h-44 rounded-full animate-fade-in-up animate-delay-1" style={{background: 'linear-gradient(135deg, ${c.accent}20, ${c.accent}05)', border: '1px solid ${c.accent}12'}}></div>
        <div className="absolute bottom-12 left-20 w-36 h-36 rounded-full animate-fade-in-up animate-delay-2" style={{background: 'linear-gradient(135deg, ${c.primaryLight}30, ${c.primaryLight}08)', border: '1px solid ${c.primary}10'}}></div>
        <div className="absolute top-1/2 left-1/3 w-16 h-16 rounded-full animate-pulse-subtle" style={{background: 'linear-gradient(135deg, ${c.primary}, ${c.accent})', boxShadow: '0 0 40px ${c.primary}30'}}></div>
      </div>`;
  }
}

function buildHeroJsx(hero: HeroContent, c: ThemeColors, isDark: boolean, tagline: string, companyName?: string): string {
  const layout = hero.layout || "centered";
  const heroBlockAttrs = blockAttrs("hero", "hero");

  const decorativeOrbs = `
              <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full animate-float-slow" style={{background: 'radial-gradient(circle, ${c.primary}18 0%, transparent 70%)'}}></div>
                <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full animate-float-slow-reverse" style={{background: 'radial-gradient(circle, ${c.accent}15 0%, transparent 70%)'}}></div>
                <div className="absolute top-1/3 right-1/4 w-48 h-48 rounded-full animate-pulse-subtle" style={{background: 'radial-gradient(circle, ${c.primary}10 0%, transparent 70%)'}}></div>
              </div>`;

  const gridPattern = isDark
    ? `<div className="absolute inset-0 pointer-events-none" aria-hidden="true" style={{backgroundImage: 'radial-gradient(${c.border}40 1px, transparent 1px)', backgroundSize: '32px 32px', opacity: 0.4}}></div>`
    : `<div className="absolute inset-0 pointer-events-none" aria-hidden="true" style={{backgroundImage: 'radial-gradient(${c.border} 1px, transparent 1px)', backgroundSize: '32px 32px', opacity: 0.5}}></div>`;

  const headlineBase = escapeHtml(hero.headline);
  const subheadlineText = escapeHtml(hero.subheadline);
  const ctaText = escapeHtml(hero.ctaText);
  const ctaBtnColor = isDark ? "#0f172a" : "#ffffff";

  // --- Standard building blocks (used by multiple layouts) ---
  const headline = `
              <h1 className="font-extrabold leading-[1.1] mb-6 animate-fade-in-up gradient-text" style={{fontSize: 'clamp(2.5rem, 6vw, 4.5rem)'}}>
                ${headlineBase}
              </h1>`;
  const subheadline = `
              <p className="text-lg md:text-xl max-w-2xl mb-10 animate-fade-in-up animate-delay-1 leading-relaxed" style={{color: '${c.textMuted}'${layout === "centered" || layout === "minimal" || layout === "bold-statement" ? `, margin: '0 auto 2.5rem'` : ""}}}>
                ${subheadlineText}
              </p>`;
  const ctaBtn = `
              <div className="animate-fade-in-up animate-delay-2">
                <a href="${hero.ctaHref}" className="cta-button inline-flex items-center gap-2 px-8 py-4 rounded-full text-lg font-semibold transition-all duration-300"
                   style={{background: 'linear-gradient(135deg, ${c.primary}, ${c.primaryDark})', color: '${ctaBtnColor}', boxShadow: '0 4px 20px ${c.primary}40'}}>
                  ${ctaText}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </a>
              </div>`;

  // ===== BOLD STATEMENT: Full-screen gradient background, oversized text, centered =====
  if (layout === "bold-statement") {
    return `
        <section ${heroBlockAttrs} className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden" style={{background: 'linear-gradient(135deg, ${c.primary}, ${c.primaryDark} 50%, ${c.accent})'}}>
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true" style={{background: 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.1), transparent 60%)'}}></div>
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true" style={{background: 'radial-gradient(ellipse at 70% 80%, rgba(0,0,0,0.15), transparent 60%)'}}></div>
          <div className="relative max-w-5xl mx-auto text-center">
            <h1 className="font-extrabold leading-[1.05] mb-8 animate-fade-in-up" style={{fontSize: 'clamp(3rem, 8vw, 6rem)', color: '${isDark ? "#0f172a" : "#ffffff"}'}}>
              ${headlineBase}
            </h1>
            <p className="text-xl md:text-2xl max-w-2xl mx-auto mb-12 animate-fade-in-up animate-delay-1 leading-relaxed" style={{color: '${isDark ? "rgba(15,23,42,0.75)" : "rgba(255,255,255,0.85)"}'}}>
              ${subheadlineText}
            </p>
            <div className="animate-fade-in-up animate-delay-2">
              <a href="${hero.ctaHref}" className="cta-button inline-flex items-center gap-2 px-10 py-5 rounded-full text-lg font-semibold transition-all duration-300"
                 style={{background: '${c.background}', color: '${c.primary}', boxShadow: '0 8px 32px rgba(0,0,0,0.2)'}}>
                ${ctaText}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </a>
            </div>
          </div>
        </section>`;
  }

  // ===== DIAGONAL: Angled split with gradient slice =====
  if (layout === "diagonal") {
    return `
        <section ${heroBlockAttrs} className="relative min-h-screen flex items-center px-6 pt-20 overflow-hidden" style={{background: '${c.background}'}}>
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div className="absolute top-0 right-0 w-[55%] h-full" style={{background: 'linear-gradient(135deg, ${c.primary}12, ${c.accent}08)', clipPath: 'polygon(20% 0, 100% 0, 100% 100%, 0% 100%)'}}></div>
            <div className="absolute top-0 right-0 w-[55%] h-full" style={{background: 'linear-gradient(180deg, ${c.primary}08, transparent)', clipPath: 'polygon(25% 0, 100% 0, 100% 100%, 5% 100%)'}}></div>
          </div>
          <div className="absolute top-[15%] right-[8%] w-32 h-32 rounded-full animate-float-slow" style={{background: 'radial-gradient(circle, ${c.primary}15, transparent 70%)'}} aria-hidden="true"></div>
          <div className="absolute bottom-[20%] right-[15%] w-20 h-20 rounded-full animate-pulse-subtle" style={{background: 'radial-gradient(circle, ${c.accent}20, transparent 70%)'}} aria-hidden="true"></div>
          <div className="relative max-w-3xl ml-auto mr-auto md:ml-[6%]">
            ${headline}
            ${subheadline}
            ${ctaBtn}
          </div>
        </section>`;
  }

  // ===== SPOTLIGHT: Centered with dramatic radial spotlight effect =====
  if (layout === "spotlight") {
    return `
        <section ${heroBlockAttrs} className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden" style={{background: '${isDark ? "#0a0a0a" : c.background}'}}>
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full" style={{background: 'radial-gradient(circle, ${c.primary}12 0%, transparent 55%)'}}></div>
            <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full animate-pulse-subtle" style={{background: 'radial-gradient(circle, ${c.accent}08 0%, transparent 50%)'}}></div>
          </div>
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-px h-24 animate-fade-in-up" style={{background: 'linear-gradient(180deg, transparent, ${c.primary}40, transparent)'}} aria-hidden="true"></div>
          <div className="relative max-w-4xl mx-auto text-center">
            <div className="inline-block mb-8 px-4 py-1.5 rounded-full text-sm font-medium animate-fade-in-up" style={{background: '${c.primary}12', color: '${c.primary}', border: '1px solid ${c.primary}20'}}>
              ${escapeHtml(tagline)}
            </div>
            <h1 className="font-extrabold leading-[1.08] mb-8 animate-fade-in-up gradient-text" style={{fontSize: 'clamp(2.8rem, 7vw, 5rem)'}}>
              ${headlineBase}
            </h1>
            <p className="text-lg md:text-xl max-w-2xl mx-auto mb-12 animate-fade-in-up animate-delay-1 leading-relaxed" style={{color: '${c.textMuted}'}}>
              ${subheadlineText}
            </p>
            ${ctaBtn}
          </div>
        </section>`;
  }

  // ===== EDITORIAL: Magazine-style with large typography and asymmetric layout =====
  if (layout === "editorial") {
    return `
        <section ${heroBlockAttrs} className="relative min-h-screen px-6 pt-32 pb-20 overflow-hidden" style={{background: '${c.background}'}}>
          <div className="absolute top-0 left-0 w-full h-1" style={{background: 'linear-gradient(90deg, ${c.primary}, ${c.accent}, ${c.primary})'}} aria-hidden="true"></div>
          <div className="absolute top-0 right-0 w-1/3 h-full pointer-events-none" style={{background: 'linear-gradient(180deg, ${c.primary}06, transparent 40%)'}} aria-hidden="true"></div>
          <div className="relative max-w-6xl mx-auto">
            <div className="mb-6 animate-fade-in-up">
              <span className="text-sm font-mono tracking-widest uppercase" style={{color: '${c.primary}'}}>${escapeHtml(tagline)}</span>
            </div>
            <h1 className="font-extrabold leading-[1.0] mb-10 animate-fade-in-up max-w-4xl gradient-text" style={{fontSize: 'clamp(3rem, 7vw, 5.5rem)'}}>
              ${headlineBase}
            </h1>
            <div className="flex flex-col md:flex-row md:items-end gap-8 md:gap-16">
              <p className="text-lg md:text-xl max-w-xl animate-fade-in-up animate-delay-1 leading-relaxed" style={{color: '${c.textMuted}'}}>
                ${subheadlineText}
              </p>
              ${ctaBtn}
            </div>
            <div className="mt-16 w-full h-px animate-fade-in-up animate-delay-3" style={{background: 'linear-gradient(90deg, ${c.border}, transparent)'}}></div>
          </div>
        </section>`;
  }

  // ===== MINIMAL: Clean, no decorative elements =====
  if (layout === "minimal") {
    return `
        <section ${heroBlockAttrs} className="relative py-36 px-6 overflow-hidden" style={{background: '${c.background}'}}>
          ${gridPattern}
          <div className="relative max-w-3xl mx-auto text-center">
            ${headline}
            ${subheadline}
            ${ctaBtn}
          </div>
        </section>`;
  }

  // ===== LEFT: Left-aligned with decorative orbs =====
  if (layout === "left") {
    return `
        <section ${heroBlockAttrs} className="relative min-h-screen flex items-center px-6 pt-20 overflow-hidden" style={{background: '${c.background}'}}>
          ${decorativeOrbs}
          ${gridPattern}
          <div className="relative max-w-2xl ml-auto mr-auto md:ml-[8%]">
            ${headline}
            ${subheadline}
            ${ctaBtn}
          </div>
        </section>`;
  }

  // ===== SPLIT: Two-column with generative visual =====
  if (layout === "split") {
    const splitVisual = buildSplitHeroVisual(c, companyName);
    return `
        <section ${heroBlockAttrs} className="relative min-h-screen flex items-center px-6 pt-20 overflow-hidden" style={{background: '${c.background}'}}>
          ${decorativeOrbs}
          ${gridPattern}
          <div className="relative max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-12">
            <div className="flex-1">
              ${headline}
              ${subheadline}
              ${ctaBtn}
            </div>
            <div className="flex-1 flex items-center justify-center">
              ${splitVisual}
            </div>
          </div>
        </section>`;
  }

  // ===== CENTERED (default): Classic centered hero =====
  return `
        <section ${heroBlockAttrs} className="relative min-h-screen flex items-center justify-center px-6 pt-20 overflow-hidden" style={{background: '${c.background}'}}>
          ${decorativeOrbs}
          ${gridPattern}
          <div className="relative max-w-4xl mx-auto text-center">
            ${headline}
            ${subheadline}
            ${ctaBtn}
          </div>
        </section>`;
}

function buildCtaInnerJsx(cta: CtaContent, c: ThemeColors, isDark: boolean, companyEmail: string, formCaptureUrl?: string): string {
  const layout = cta.layout || "gradient";
  const textColor = layout === "gradient" ? (isDark ? "#0f172a" : "#ffffff") : c.text;
  const mutedColor = layout === "gradient" ? (isDark ? "rgba(15,23,42,0.7)" : "rgba(255,255,255,0.8)") : c.textMuted;

  const headline = `<h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4" style={{color: '${textColor}'}}>${escapeHtml(cta.headline)}</h2>`;
  const subheadline = `<p className="text-lg mb-8 max-w-xl mx-auto" style={{color: '${mutedColor}'}}>${escapeHtml(cta.subheadline)}</p>`;

  const button = formCaptureUrl
    ? `<EmailCapture formCaptureUrl="${formCaptureUrl}" buttonText="${escapeHtml(cta.buttonText)}" primary="${c.primary}" isDark={${isDark}} layout="${layout}" />`
    : `<a href="mailto:${companyEmail}" className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-lg font-semibold transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5" style={{background: '${layout === "gradient" ? c.background : layout === "outline" ? "transparent" : c.primary}', color: '${layout === "gradient" ? c.primary : layout === "outline" ? c.primary : isDark ? "#0f172a" : "#ffffff"}', border: '${layout === "outline" ? `2px solid ${c.primary}` : "none"}'}}>${escapeHtml(cta.buttonText)}<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></a>`;

  if (layout === "minimal") {
    return `<div className="max-w-2xl mx-auto text-center">${headline}${subheadline}${button}</div>`;
  }

  if (layout === "outline") {
    return `<div className="max-w-3xl mx-auto text-center p-14 rounded-3xl relative overflow-hidden" style={{border: '2px solid ${c.primary}30', background: '${c.surface}'}}><div className="absolute inset-0 pointer-events-none" style={{background: 'radial-gradient(ellipse at center, ${c.primary}08, transparent 70%)'}}></div><div className="relative">${headline}${subheadline}${button}</div></div>`;
  }

  // gradient
  return `<div className="max-w-3xl mx-auto text-center p-14 rounded-3xl relative overflow-hidden" style={{background: 'linear-gradient(135deg, ${c.primary}, ${c.primaryDark})'}}><div className="absolute inset-0 pointer-events-none" style={{background: 'radial-gradient(ellipse at top right, rgba(255,255,255,0.15), transparent 60%)'}}></div><div className="relative">${headline}${subheadline}${button}</div></div>`;
}

export function buildLandingPageHtml(content: LandingPageContent): string {
  const { companyName, tagline, theme, hero, cta, sections, companyEmail, projectSlug } = content;
  const c = theme.colors;
  const isDark = theme.mode === "dark";

  const appBase = process.env.NEXT_PUBLIC_APP_URL
    ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")
    : "https://artha.run";
  const formCaptureUrl = projectSlug
    ? `${appBase}/api/site/${projectSlug}/form`
    : undefined;

  const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
  const canonicalUrl = projectSlug
    ? `https://${projectSlug}.${companyDomain}/`
    : undefined;
  const metaDescription = escapeHtml(
    hero.subheadline
      ? hero.subheadline.substring(0, 160)
      : tagline
  );
  const ogTitle = escapeHtml(`${companyName} — ${tagline}`);

  const sectionsJsx = sections.map((s, i) => {
    const sectionHtml = renderSection(s, theme, companyEmail, i);
    return `<RevealSection>${sectionHtml}</RevealSection>`;
  }).join("\n");
  const heroJsx = buildHeroJsx(hero, c, isDark, tagline, companyName);
  const ctaInnerJsx = buildCtaInnerJsx(cta, c, isDark, companyEmail, formCaptureUrl);

  const navLinks = sections
    .filter(s => s.type !== "custom")
    .slice(0, 4)
    .map(s => `<a href="#${s.id}" className="relative py-1 transition-colors duration-200 hover-nav-link whitespace-nowrap" style={{color: '${c.textMuted}'}}>${escapeHtml(s.headline)}</a>`)
    .join("\n              ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Permissions-Policy" content="browsing-topics=(), interest-cohort=(), presentation=(), bluetooth=(), usb=(), serial=(), hid=(), window-management=()" />
  <meta name="description" content="${metaDescription}" />
  <title>${escapeHtml(companyName)} — ${escapeHtml(tagline)}</title>
  ${canonicalUrl ? `<link rel="canonical" href="${canonicalUrl}" />` : ""}
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${ogTitle}" />
  <meta property="og:description" content="${metaDescription}" />
  ${canonicalUrl ? `<meta property="og:url" content="${canonicalUrl}" />` : ""}
  <meta property="og:site_name" content="${escapeHtml(companyName)}" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${ogTitle}" />
  <meta name="twitter:description" content="${metaDescription}" />
  <link rel="icon" href="${appBase}/icon.svg" type="image/svg+xml" />
  <script type="application/ld+json">
  ${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: companyName,
    description: hero.subheadline || tagline,
    url: canonicalUrl || "",
    ...(companyEmail ? { email: companyEmail } : {}),
    ...(sections.find(s => s.type === "faq")?.faqs?.length ? {
      mainEntity: sections.find(s => s.type === "faq")!.faqs!.map(f => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer }
      }))
    } : {}),
  })}
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=${getGoogleFontUrlParam(theme.fontFamily)}:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>${buildTailwindConfig(theme)}</script>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { font-family: ${theme.fontFamily}; background: ${c.background}; color: ${c.text}; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }

    /* Animations */
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(28px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes floatSlow {
      0%, 100% { transform: translate(0, 0) scale(1); }
      33% { transform: translate(10px, -15px) scale(1.02); }
      66% { transform: translate(-8px, 8px) scale(0.98); }
    }
    @keyframes floatSlowReverse {
      0%, 100% { transform: translate(0, 0) scale(1); }
      33% { transform: translate(-12px, 10px) scale(0.98); }
      66% { transform: translate(8px, -12px) scale(1.02); }
    }
    @keyframes pulseSubtle {
      0%, 100% { opacity: 0.6; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.05); }
    }
    @keyframes shimmer {
      0% { background-position: -200% center; }
      100% { background-position: 200% center; }
    }

    .animate-fade-in-up { animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
    .animate-delay-1 { animation-delay: 0.15s; opacity: 0; }
    .animate-delay-2 { animation-delay: 0.3s; opacity: 0; }
    .animate-delay-3 { animation-delay: 0.45s; opacity: 0; }
    .animate-float-slow { animation: floatSlow 8s ease-in-out infinite; }
    .animate-float-slow-reverse { animation: floatSlowReverse 10s ease-in-out infinite; }
    .animate-pulse-subtle { animation: pulseSubtle 4s ease-in-out infinite; }

    /* Gradient text */
    .gradient-text {
      background: linear-gradient(135deg, ${c.text} 0%, ${c.primary} 50%, ${c.accent} 100%);
      background-size: 200% auto;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    /* CTA button hover glow */
    .cta-button:hover {
      box-shadow: 0 8px 32px ${c.primary}50, 0 0 0 1px ${c.primary}30 !important;
      transform: translateY(-2px);
    }

    /* Nav link hover underline */
    .hover-nav-link::after {
      content: '';
      position: absolute;
      bottom: -2px;
      left: 0;
      width: 0;
      height: 2px;
      background: ${c.primary};
      transition: width 0.3s ease;
      border-radius: 1px;
    }
    .hover-nav-link:hover::after { width: 100%; }
    .hover-nav-link:hover { color: ${c.text} !important; }

    /* FAQ accordion */
    .faq-answer {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1), padding 0.3s ease;
    }
    .faq-answer.open { max-height: 500px; }
    .faq-chevron { transition: transform 0.3s ease; }
    .faq-chevron.open { transform: rotate(180deg); }

    /* Scrollbar styling */
    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: ${c.background}; }
    ::-webkit-scrollbar-thumb { background: ${c.border}; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: ${c.textMuted}; }

    /* Input placeholder visibility */
    input::placeholder {
      color: ${theme.mode === "dark" ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)"} !important;
      opacity: 1 !important;
    }
    .cta-gradient-input::placeholder {
      color: ${theme.mode === "dark" ? "rgba(15,23,42,0.55)" : "rgba(255,255,255,0.65)"} !important;
      opacity: 1 !important;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect, useRef, useCallback } = React;

    function EmailCapture({ formCaptureUrl, buttonText, primary, isDark, layout }) {
      const [email, setEmail] = useState('');
      const [status, setStatus] = useState('idle');
      async function handleSubmit(e) {
        e.preventDefault();
        if (!email.trim()) return;
        setStatus('loading');
        try {
          await fetch(formCaptureUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, formSlug: 'cta' }),
          });
          setStatus('success');
        } catch {
          setStatus('error');
        }
      }
      if (status === 'success') {
        return <p style={{color: layout === 'gradient' ? (isDark ? '#0f172a' : '#ffffff') : primary, fontWeight: 600, fontSize: '1.1rem'}}>You're on the list! We'll be in touch.</p>;
      }
      return (
        <form onSubmit={handleSubmit} style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '28rem', margin: '0 auto'}}>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Enter your email"
            className={layout === 'gradient' ? 'cta-gradient-input' : ''}
            style={{flex: 1, minWidth: '12rem', padding: '0.875rem 1.25rem', borderRadius: '9999px', border: '1px solid transparent', fontSize: '1rem', outline: 'none', background: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)', color: layout === 'gradient' ? (isDark ? '#0f172a' : '#ffffff') : 'inherit', transition: 'border-color 0.2s, box-shadow 0.2s'}}
            onFocus={function(e){e.target.style.borderColor=primary;e.target.style.boxShadow='0 0 0 3px ' + primary + '20'}}
            onBlur={function(e){e.target.style.borderColor='transparent';e.target.style.boxShadow='none'}}
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            style={{padding: '0.875rem 2rem', borderRadius: '9999px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '1rem', background: layout === 'gradient' ? (isDark ? primary : '#ffffff') : primary, color: layout === 'gradient' ? (isDark ? '#0f172a' : primary) : (isDark ? '#0f172a' : '#ffffff'), transition: 'all 0.2s', opacity: status === 'loading' ? 0.7 : 1}}
          >
            {status === 'loading' ? '...' : buttonText}
          </button>
          {status === 'error' && <p style={{width: '100%', textAlign: 'center', color: '#f87171', fontSize: '0.875rem', marginTop: '0.5rem'}}>Something went wrong. Try again.</p>}
        </form>
      );
    }

    function FaqAccordion({ question, answer, index }) {
      const [open, setOpen] = useState(false);
      const contentRef = useRef(null);

      return (
        <div className="rounded-2xl overflow-hidden transition-all duration-300"
             style={{
               background: '${c.surface}',
               border: open ? '1px solid ${c.primary}30' : '1px solid ${c.border}',
               boxShadow: open ? '0 4px 12px ${c.primary}08' : 'none',
             }}>
          <button
            onClick={() => setOpen(!open)}
            className="w-full flex items-center justify-between p-6 text-left cursor-pointer"
            style={{background: 'transparent', border: 'none', outline: 'none'}}
          >
            <h4 className="text-lg font-semibold pr-4" style={{color: '${c.text}'}}>{question}</h4>
            <svg className={\`faq-chevron flex-shrink-0 \${open ? 'open' : ''}\`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c.textMuted}" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <div ref={contentRef} className={\`faq-answer \${open ? 'open' : ''}\`}
               style={{maxHeight: open ? (contentRef.current ? contentRef.current.scrollHeight + 'px' : '500px') : '0'}}>
            <p className="px-6 pb-6 leading-relaxed" style={{color: '${c.textMuted}'}}>{answer}</p>
          </div>
        </div>
      );
    }

    function useScrollReveal() {
      const ref = useRef(null);
      const [visible, setVisible] = useState(false);
      useEffect(() => {
        const observer = new IntersectionObserver(
          ([entry]) => { if (entry.isIntersecting) setVisible(true); },
          { threshold: 0.1 }
        );
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
      }, []);
      return { ref, visible };
    }

    function Navbar() {
      const [scrolled, setScrolled] = useState(false);
      const [mobileOpen, setMobileOpen] = useState(false);
      useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
      }, []);

      return (
        <nav data-block-type="navbar" data-block-id="navbar" className={\`fixed top-0 left-0 right-0 z-50 transition-all duration-500\`}
             style={{
               background: scrolled ? '${isDark ? "rgba(15,23,42,0.85)" : "rgba(255,255,255,0.85)"}' : 'transparent',
               backdropFilter: scrolled ? 'blur(20px) saturate(180%)' : 'none',
               WebkitBackdropFilter: scrolled ? 'blur(20px) saturate(180%)' : 'none',
               borderBottom: scrolled ? '1px solid ${c.border}40' : '1px solid transparent',
               boxShadow: scrolled ? '0 1px 3px ${isDark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.05)"}' : 'none',
             }}>
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <a href="#" className="text-xl font-bold transition-colors duration-200" style={{color: '${c.primary}'}}>
              ${escapeHtml(companyName)}
            </a>
            <div className="hidden lg:flex items-center gap-6">
              ${navLinks}
              <a href="mailto:${companyEmail}"
                 className="px-5 py-2.5 rounded-full font-medium transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
                 style={{background: 'linear-gradient(135deg, ${c.primary}, ${c.primaryDark})', color: '${isDark ? "#0f172a" : "#ffffff"}'}}>
                Contact Us
              </a>
            </div>
            <button className="lg:hidden p-2 rounded-lg transition-colors" onClick={() => setMobileOpen(!mobileOpen)}
                    style={{color: '${c.text}', background: mobileOpen ? '${c.surface}' : 'transparent'}}>
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {mobileOpen
                  ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
                  : <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>
                }
              </svg>
            </button>
          </div>
          {mobileOpen && (
            <div className="md:hidden px-6 pb-6 flex flex-col gap-1 animate-fade-in-up"
                 style={{background: '${isDark ? "rgba(15,23,42,0.98)" : "rgba(255,255,255,0.98)"}', backdropFilter: 'blur(20px)'}}>
              ${sections.filter(s => s.type !== "custom").slice(0, 4).map(s =>
                `<a href="#${s.id}" onClick={() => setMobileOpen(false)} className="py-3 px-4 rounded-xl transition-colors" style={{color: '${c.textMuted}'}}
                   onMouseOver={function(e){e.currentTarget.style.background='${c.surface}'}}
                   onMouseOut={function(e){e.currentTarget.style.background='transparent'}}>${escapeHtml(s.headline)}</a>`
              ).join("\n              ")}
              <a href="mailto:${companyEmail}"
                 className="px-5 py-3 rounded-xl font-medium text-center mt-2"
                 style={{background: 'linear-gradient(135deg, ${c.primary}, ${c.primaryDark})', color: '${isDark ? "#0f172a" : "#ffffff"}'}}>
                Contact Us
              </a>
            </div>
          )}
        </nav>
      );
    }

    function Hero() {
      return (${heroJsx});
    }

    function RevealSection({ children }) {
      const reveal = useScrollReveal();
      return (
        <div ref={reveal.ref}
             style={{
               opacity: reveal.visible ? 1 : 0,
               transform: reveal.visible ? 'translateY(0)' : 'translateY(32px)',
               transition: 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
             }}>
          {children}
        </div>
      );
    }

    function Sections() {
      return (
        <div>
          ${sectionsJsx}
        </div>
      );
    }

    function CTA() {
      const reveal = useScrollReveal();
      return (
        <section ref={reveal.ref} data-block-type="cta" data-block-id="cta" className="py-24 px-6"
                 style={{
                   opacity: reveal.visible ? 1 : 0,
                   transform: reveal.visible ? 'translateY(0)' : 'translateY(32px)',
                   transition: 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
                 }}>
          ${ctaInnerJsx}
        </section>
      );
    }

    function Footer() {
      return (
        <footer data-block-type="footer" data-block-id="footer" className="py-16 px-6 relative" style={{background: '${c.surface}'}}>
          <div className="absolute top-0 left-0 right-0 h-px" style={{background: 'linear-gradient(90deg, transparent, ${c.primary}40, ${c.accent}40, transparent)'}}></div>
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <span className="text-lg font-bold" style={{color: '${c.primary}'}}>${escapeHtml(companyName)}</span>
                <span className="hidden sm:inline" style={{color: '${c.border}'}}>|</span>
                <a href="mailto:${companyEmail}" className="transition-colors duration-200" style={{color: '${c.textMuted}'}}
                   onMouseOver={function(e){e.currentTarget.style.color='${c.primary}'}}
                   onMouseOut={function(e){e.currentTarget.style.color='${c.textMuted}'}}>
                  ${companyEmail}
                </a>
              </div>
              <a href="https://artha.run${projectSlug ? `?ref=${projectSlug}` : ''}" target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                  padding: '0.5rem 1rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 500,
                  color: '${c.textMuted}',
                  background: '${theme.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"}',
                  border: '1px solid ${c.border}', textDecoration: 'none', transition: 'all 0.2s',
                }}
                onMouseOver={function(e){e.currentTarget.style.borderColor='${c.primary}50';e.currentTarget.style.color='${c.primary}'}}
                onMouseOut={function(e){e.currentTarget.style.borderColor='${c.border}';e.currentTarget.style.color='${c.textMuted}'}}
              >
                {"Built with  \u2764\uFE0F  on artha.run"}
              </a>
            </div>
          </div>
        </footer>
      );
    }

    class ErrorBoundary extends React.Component {
      constructor(props) { super(props); this.state = { error: null }; }
      static getDerivedStateFromError(error) { return { error }; }
      render() {
        if (this.state.error) {
          return <div style={{padding: '2rem', textAlign: 'center', color: '${c.textMuted}'}}>
            <p style={{fontSize: '1rem'}}>Something went wrong loading this section.</p>
          </div>;
        }
        return this.props.children;
      }
    }

    function App() {
      return (
        <ErrorBoundary>
          <div style={{background: '${c.background}', minHeight: '100vh'}}>
            <Navbar />
            <Hero />
            <Sections />
            <CTA />
            <Footer />
          </div>
        </ErrorBoundary>
      );
    }

    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Shared layout system for multi-page sites
// ---------------------------------------------------------------------------

export interface PageMeta {
  title: string;
  description: string;
  slug: string;
}

export interface MultiPageConfig {
  /** Base landing page content (provides theme, company info, etc.) */
  baseContent: LandingPageContent;
  /** Navigation pages */
  pages: { slug: string; title: string }[];
  /** Current page slug for active nav highlighting */
  currentSlug: string;
}

/**
 * Builds a full HTML page using the shared layout from the landing page.
 * Used for additional pages (about, pricing, contact, blog, etc.)
 */
export function buildPageHtml(
  config: MultiPageConfig,
  pageMeta: PageMeta,
  bodyJsx: string,
): string {
  const { baseContent, pages, currentSlug } = config;
  const { companyName, theme, companyEmail, projectSlug } = baseContent;
  const c = theme.colors;
  const isDark = theme.mode === "dark";

  const appBase = process.env.NEXT_PUBLIC_APP_URL
    ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")
    : "https://artha.run";
  const formCaptureUrl = projectSlug
    ? `${appBase}/api/site/${projectSlug}/form`
    : undefined;

  const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
  const canonicalUrl = projectSlug
    ? `https://${projectSlug}.${companyDomain}/${pageMeta.slug === "index" ? "" : pageMeta.slug + ".html"}`
    : undefined;

  // Build navigation links — page links instead of anchor links
  const navLinksHtml = pages
    .map(p => {
      const href = p.slug === "index" ? "/" : `/${p.slug}.html`;
      const isActive = p.slug === currentSlug;
      return `<a href="${href}" class="relative py-1 transition-colors duration-200 hover-nav-link whitespace-nowrap${isActive ? " font-semibold" : ""}" style="color: ${isActive ? c.text : c.textMuted}">${escapeHtml(p.title)}</a>`;
    })
    .join("\n              ");

  // Mobile nav links
  const mobileNavHtml = pages
    .map(p => {
      const href = p.slug === "index" ? "/" : `/${p.slug}.html`;
      return `<a href="${href}" class="py-3 px-4 rounded-xl transition-colors" style="color: ${c.textMuted}"
                   onmouseover="this.style.background='${c.surface}'" onmouseout="this.style.background='transparent'">${escapeHtml(p.title)}</a>`;
    })
    .join("\n              ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Permissions-Policy" content="browsing-topics=(), interest-cohort=(), presentation=(), bluetooth=(), usb=(), serial=(), hid=(), window-management=()" />
  <meta name="description" content="${escapeHtml(pageMeta.description.substring(0, 160))}" />
  <title>${escapeHtml(pageMeta.title)} — ${escapeHtml(companyName)}</title>
  ${canonicalUrl ? `<link rel="canonical" href="${canonicalUrl}" />` : ""}
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(pageMeta.title)} — ${escapeHtml(companyName)}" />
  <meta property="og:description" content="${escapeHtml(pageMeta.description.substring(0, 160))}" />
  ${canonicalUrl ? `<meta property="og:url" content="${canonicalUrl}" />` : ""}
  <meta property="og:site_name" content="${escapeHtml(companyName)}" />
  ${projectSlug ? `<meta property="og:image" content="${appBase}/api/og/${projectSlug}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/png" />` : ""}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(pageMeta.title)} — ${escapeHtml(companyName)}" />
  <meta name="twitter:description" content="${escapeHtml(pageMeta.description.substring(0, 160))}" />
  ${projectSlug ? `<meta name="twitter:image" content="${appBase}/api/og/${projectSlug}" />` : ""}
  <link rel="icon" href="${appBase}/icon.svg" type="image/svg+xml" />
  <script type="application/ld+json">
  ${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: pageMeta.title,
    description: pageMeta.description,
    url: canonicalUrl || "",
    isPartOf: {
      "@type": "WebSite",
      name: companyName,
      url: projectSlug ? `https://${projectSlug}.${companyDomain}/` : "",
    },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: projectSlug ? `https://${projectSlug}.${companyDomain}/` : "" },
        ...(currentSlug !== "index" ? [{ "@type": "ListItem", position: 2, name: pageMeta.title, item: canonicalUrl || "" }] : []),
      ],
    },
  })}
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=${getGoogleFontUrlParam(theme.fontFamily)}:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { font-family: ${theme.fontFamily}; background: ${c.background}; color: ${c.text}; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }

    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(28px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in-up { animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
    .animate-delay-1 { animation-delay: 0.15s; opacity: 0; }
    .animate-delay-2 { animation-delay: 0.3s; opacity: 0; }

    .hover-nav-link::after {
      content: '';
      position: absolute;
      bottom: -2px;
      left: 0;
      width: 0;
      height: 2px;
      background: ${c.primary};
      transition: width 0.3s ease;
      border-radius: 1px;
    }
    .hover-nav-link:hover::after { width: 100%; }
    .hover-nav-link:hover { color: ${c.text} !important; }

    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: ${c.background}; }
    ::-webkit-scrollbar-thumb { background: ${c.border}; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: ${c.textMuted}; }
    .site-navbar { background: transparent; border-bottom: 1px solid transparent; }
    .site-navbar.scrolled { background: ${isDark ? "rgba(15,23,42,0.85)" : "rgba(255,255,255,0.85)"}; backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%); border-bottom: 1px solid ${c.border}40; box-shadow: 0 1px 3px ${isDark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.05)"}; }
    .mobile-nav-menu { display: none; }
    .mobile-nav-menu.open { display: flex; }
  </style>
</head>
<body style="background: ${c.background}; color: ${c.text}; min-height: 100vh">
  <!-- Navbar -->
  <nav class="site-navbar fixed top-0 left-0 right-0 z-50 transition-all duration-500">
    <div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
      <a href="/" class="text-xl font-bold" style="color: ${c.primary}">${escapeHtml(companyName)}</a>
      <div class="hidden lg:flex items-center gap-6">
        ${navLinksHtml}
        <a href="mailto:${companyEmail}" class="px-5 py-2 rounded-full font-medium transition-all" style="background: linear-gradient(135deg, ${c.primary}, ${c.primaryDark}); color: ${isDark ? "#0f172a" : "#ffffff"}">Contact Us</a>
      </div>
      <button class="lg:hidden mobile-nav-toggle p-2 rounded-lg transition-colors" style="color: ${c.text}; background: transparent">
        <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
    </div>
    <div class="mobile-nav-menu md:hidden px-6 pb-6 flex-col gap-1" style="background: ${isDark ? "rgba(15,23,42,0.98)" : "rgba(255,255,255,0.98)"}; backdrop-filter: blur(20px)">
      ${mobileNavHtml}
      <a href="mailto:${companyEmail}" class="px-5 py-3 rounded-xl font-medium text-center mt-2" style="background: linear-gradient(135deg, ${c.primary}, ${c.primaryDark}); color: ${isDark ? "#0f172a" : "#ffffff"}">Contact Us</a>
    </div>
  </nav>

  <!-- Page Content -->
  <div style="padding-top: 5rem">
    ${bodyJsx}
  </div>

  <!-- Footer -->
  <footer class="py-16 px-6 relative" style="background: ${c.surface}">
    <div class="absolute top-0 left-0 right-0" style="height: 1px; background: linear-gradient(90deg, transparent, ${c.primary}40, ${c.accent}40, transparent)"></div>
    <div class="max-w-6xl mx-auto">
      <div class="flex flex-col md:flex-row items-center justify-between gap-6">
        <div class="flex flex-col sm:flex-row items-center gap-3">
          <span class="text-lg font-bold" style="color: ${c.primary}">${escapeHtml(companyName)}</span>
          <span class="hidden sm:inline" style="color: ${c.border}">|</span>
          <a href="mailto:${companyEmail}" class="transition-colors" style="color: ${c.textMuted}">${companyEmail}</a>
        </div>
        <a href="https://artha.run${projectSlug ? `?ref=${projectSlug}` : ''}" target="_blank" rel="noopener noreferrer"
          style="display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.5rem 1rem; border-radius: 9999px; font-size: 0.8rem; color: ${c.textMuted}; background: ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"}; border: 1px solid ${c.border}; text-decoration: none; transition: all 0.2s">
          Built with ❤️ on artha.run
        </a>
      </div>
    </div>
  </footer>

  <script>
  (function() {
    var nav = document.querySelector('.site-navbar');
    if (nav) window.addEventListener('scroll', function() { nav.classList.toggle('scrolled', window.scrollY > 20); }, { passive: true });
    var mobileBtn = document.querySelector('.mobile-nav-toggle');
    var mobileMenu = document.querySelector('.mobile-nav-menu');
    if (mobileBtn && mobileMenu) mobileBtn.addEventListener('click', function() { mobileMenu.classList.toggle('open'); });

    // ── FAQ Accordion ──
    document.querySelectorAll('.faq-toggle').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var item = btn.closest('.faq-item');
        var answer = item.querySelector('.faq-answer');
        var chevron = item.querySelector('.faq-chevron');
        var isOpen = answer.classList.contains('open');
        answer.classList.toggle('open');
        chevron.classList.toggle('open');
        answer.style.maxHeight = isOpen ? '0' : answer.scrollHeight + 'px';
      });
    });

    // ── Animated Counters ──
    var counterObs = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        var val = el.dataset.value || '0';
        var suffix = el.dataset.suffix || '';
        var match = val.match(/([\\d.]+)/);
        if (!match) { el.textContent = val + suffix; counterObs.unobserve(el); return; }
        var target = parseFloat(match[1]);
        var prefix = val.slice(0, val.indexOf(match[1]));
        var postfix = val.slice(val.indexOf(match[1]) + match[1].length);
        var isDecimal = match[1].includes('.');
        var start = Date.now();
        (function animate() {
          var p = Math.min((Date.now() - start) / 1500, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          var cur = target * eased;
          el.textContent = prefix + (isDecimal ? cur.toFixed(1) : Math.round(cur).toLocaleString()) + postfix + suffix;
          if (p < 1) requestAnimationFrame(animate);
        })();
        counterObs.unobserve(el);
      });
    }, { threshold: 0.3 });
    document.querySelectorAll('.animated-counter').forEach(function(el) { counterObs.observe(el); });

    // ── Contact Forms ──
    document.querySelectorAll('.contact-form').forEach(function(form) {
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        var data = {};
        form.querySelectorAll('input, textarea, select').forEach(function(f) { if (f.name && f.name !== '_honey') data[f.name] = f.value; });
        var btn = form.querySelector('button[type="submit"]');
        var origText = btn.textContent;
        btn.textContent = 'Sending...'; btn.disabled = true;
        data.formSlug = form.dataset.slug || 'contact';
        fetch(form.dataset.action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
          .then(function() { form.innerHTML = '<div style="text-align:center;padding:3rem 0"><div style="font-size:3rem;margin-bottom:1rem">✅</div><h3 style="font-size:1.5rem;font-weight:700;margin-bottom:0.5rem">Message Sent!</h3><p>We\\'ll get back to you soon.</p></div>'; })
          .catch(function() { btn.textContent = origText; btn.disabled = false; });
      });
    });
  })();
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Page body JSX builders for common page types
// ---------------------------------------------------------------------------

export function buildAboutPageBody(
  content: {
    companyName: string;
    mission: string;
    story?: string;
    values?: { title: string; description: string; icon: string }[];
    teamMembers?: { name: string; role: string; bio?: string }[];
  },
  theme: SiteTheme
): string {
  const c = theme.colors;
  const isDark = theme.mode === "dark";

  const valuesHtml = content.values?.map(v => `
    <div class="p-6 rounded-2xl transition-all duration-300 hover:-translate-y-1" style="background: ${c.surface}; border: 1px solid ${c.border}">
      <div class="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4" style="background: ${c.primary}12; border: 1px solid ${c.primary}20">${v.icon}</div>
      <h3 class="text-lg font-bold mb-2" style="color: ${c.text}">${escapeHtml(v.title)}</h3>
      <p class="leading-relaxed" style="color: ${c.textMuted}">${escapeHtml(v.description)}</p>
    </div>
  `).join("\n") || "";

  const teamHtml = content.teamMembers?.map(m => {
    const initials = m.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
    return `
    <div class="text-center p-6">
      <div class="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center text-xl font-bold"
           style="background: linear-gradient(135deg, ${c.primary}, ${c.accent}); color: ${isDark ? "#0f172a" : "#ffffff"}">${initials}</div>
      <h3 class="text-lg font-bold" style="color: ${c.text}">${escapeHtml(m.name)}</h3>
      <p class="text-sm" style="color: ${c.primary}">${escapeHtml(m.role)}</p>
      ${m.bio ? `<p class="mt-2 text-sm leading-relaxed" style="color: ${c.textMuted}">${escapeHtml(m.bio)}</p>` : ""}
    </div>`;
  }).join("\n") || "";

  return `
    <div>
      <section class="py-24 px-6" style="background: ${c.background}">
        <div class="max-w-3xl mx-auto text-center">
          <h1 class="text-4xl md:text-5xl font-bold mb-6 animate-fade-in-up" style="color: ${c.text}">About ${escapeHtml(content.companyName)}</h1>
          <p class="text-xl leading-relaxed animate-fade-in-up animate-delay-1" style="color: ${c.textMuted}">${escapeHtml(content.mission)}</p>
        </div>
      </section>
      ${content.story ? `
      <section class="py-20 px-6" style="background: ${c.surface}">
        <div class="max-w-3xl mx-auto">
          <h2 class="text-3xl font-bold mb-6" style="color: ${c.text}">Our Story</h2>
          <p class="text-lg leading-relaxed" style="color: ${c.textMuted}">${escapeHtml(content.story)}</p>
        </div>
      </section>` : ""}
      ${content.values?.length ? `
      <section class="py-20 px-6" style="background: ${c.background}">
        <div class="max-w-6xl mx-auto">
          <h2 class="text-3xl font-bold text-center mb-12" style="color: ${c.text}">Our Values</h2>
          <div class="grid md:grid-cols-3 gap-6">${valuesHtml}</div>
        </div>
      </section>` : ""}
      ${content.teamMembers?.length ? `
      <section class="py-20 px-6" style="background: ${c.surface}">
        <div class="max-w-6xl mx-auto">
          <h2 class="text-3xl font-bold text-center mb-12" style="color: ${c.text}">Our Team</h2>
          <div class="grid md:grid-cols-3 gap-8">${teamHtml}</div>
        </div>
      </section>` : ""}
    </div>
  `;
}

export function buildContactPageBody(
  content: {
    companyName: string;
    companyEmail: string;
    headline?: string;
    subheadline?: string;
  },
  theme: SiteTheme,
  formCaptureUrl?: string
): string {
  const c = theme.colors;

  return `
    <div>
      <section class="py-24 px-6" style="background: ${c.background}">
        <div class="max-w-2xl mx-auto text-center">
          <h1 class="text-4xl md:text-5xl font-bold mb-6 animate-fade-in-up" style="color: ${c.text}">${escapeHtml(content.headline || "Get in Touch")}</h1>
          <p class="text-xl leading-relaxed animate-fade-in-up animate-delay-1 mb-12" style="color: ${c.textMuted}">${escapeHtml(content.subheadline || `We'd love to hear from you. Reach out at ${content.companyEmail}`)}</p>
          <form class="contact-form space-y-5 text-left" data-action="${formCaptureUrl || ""}" data-slug="contact">
              <div style="position: absolute; left: -9999px" aria-hidden="true">
                <input type="text" name="_honey" tabindex="-1" autocomplete="off" />
              </div>
              <div>
                <label class="block text-sm font-medium mb-2" style="color: ${c.text}">Your Name *</label>
                <input type="text" name="name" style="width: 100%; padding: 0.875rem 1rem; border-radius: 0.75rem; border: 1px solid ${c.border}; background: ${c.surface}; color: ${c.text}; font-size: 1rem; outline: none; transition: border-color 0.2s, box-shadow 0.2s" onfocus="this.style.borderColor='${c.primary}';this.style.boxShadow='0 0 0 3px ${c.primary}20'" onblur="this.style.borderColor='${c.border}';this.style.boxShadow='none'" placeholder="Your Name" required />
              </div>
              <div>
                <label class="block text-sm font-medium mb-2" style="color: ${c.text}">Email Address *</label>
                <input type="email" name="email" style="width: 100%; padding: 0.875rem 1rem; border-radius: 0.75rem; border: 1px solid ${c.border}; background: ${c.surface}; color: ${c.text}; font-size: 1rem; outline: none; transition: border-color 0.2s, box-shadow 0.2s" onfocus="this.style.borderColor='${c.primary}';this.style.boxShadow='0 0 0 3px ${c.primary}20'" onblur="this.style.borderColor='${c.border}';this.style.boxShadow='none'" placeholder="Email Address" required />
              </div>
              <div>
                <label class="block text-sm font-medium mb-2" style="color: ${c.text}">Subject</label>
                <input type="text" name="subject" style="width: 100%; padding: 0.875rem 1rem; border-radius: 0.75rem; border: 1px solid ${c.border}; background: ${c.surface}; color: ${c.text}; font-size: 1rem; outline: none; transition: border-color 0.2s, box-shadow 0.2s" onfocus="this.style.borderColor='${c.primary}';this.style.boxShadow='0 0 0 3px ${c.primary}20'" onblur="this.style.borderColor='${c.border}';this.style.boxShadow='none'" placeholder="Subject" />
              </div>
              <div>
                <label class="block text-sm font-medium mb-2" style="color: ${c.text}">Message *</label>
                <textarea name="message" rows="4" style="width: 100%; padding: 0.875rem 1rem; border-radius: 0.75rem; border: 1px solid ${c.border}; background: ${c.surface}; color: ${c.text}; font-size: 1rem; outline: none; transition: border-color 0.2s, box-shadow 0.2s" onfocus="this.style.borderColor='${c.primary}';this.style.boxShadow='0 0 0 3px ${c.primary}20'" onblur="this.style.borderColor='${c.border}';this.style.boxShadow='none'" placeholder="Message" required></textarea>
              </div>
              <button type="submit" class="w-full px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
                style="background: linear-gradient(135deg, ${c.primary}, ${c.primaryDark}); color: ${theme.mode === "dark" ? "#0f172a" : "#ffffff"}; border: none">
                Send Message
              </button>
            </form>
        </div>
      </section>
    </div>
  `;
}

export function buildPricingPageBody(
  content: {
    headline?: string;
    subheadline?: string;
    plans: { name: string; price: string; period: string; features: string[]; ctaText: string; ctaHref?: string }[];
    faqs?: { question: string; answer: string }[];
  },
  theme: SiteTheme,
  companyEmail: string
): string {
  const c = theme.colors;
  const isDark = theme.mode === "dark";
  const featuredIndex = content.plans.length === 3 ? 1 : content.plans.length === 2 ? 1 : 0;
  const gridClass = content.plans.length === 1 ? "grid gap-8 max-w-md mx-auto" : content.plans.length === 2 ? "grid gap-8 md:grid-cols-2 max-w-4xl mx-auto" : "grid gap-8 md:grid-cols-3";

  const plansHtml = content.plans.map((p, i) => renderPricingPlan(p, theme, companyEmail, i === featuredIndex)).join("\n");

  const faqsHtml = content.faqs?.map((f) => `
    <div class="faq-item rounded-2xl overflow-hidden transition-all duration-300" style="background: ${c.surface}; border: 1px solid ${c.border}">
      <button class="faq-toggle w-full flex items-center justify-between p-6 text-left cursor-pointer" style="background: transparent; border: none; outline: none">
        <h4 class="text-lg font-semibold pr-4" style="color: ${c.text}">${escapeHtml(f.question)}</h4>
        <svg class="faq-chevron flex-shrink-0 transition-transform duration-300" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c.textMuted}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      <div class="faq-answer overflow-hidden transition-all duration-300" style="max-height: 0">
        <p class="px-6 pb-6 leading-relaxed" style="color: ${c.textMuted}">${escapeHtml(f.answer)}</p>
      </div>
    </div>
  `).join("\n") || "";

  return `
    <div>
      <section class="py-24 px-6" style="background: ${c.background}">
        <div class="max-w-6xl mx-auto">
          <div class="text-center mb-16">
            <h1 class="text-4xl md:text-5xl font-bold mb-6 animate-fade-in-up" style="color: ${c.text}">${escapeHtml(content.headline || "Simple, Transparent Pricing")}</h1>
            <p class="text-xl max-w-2xl mx-auto animate-fade-in-up animate-delay-1" style="color: ${c.textMuted}">${escapeHtml(content.subheadline || "Choose the plan that's right for you")}</p>
          </div>
          <div class="${gridClass}">
            ${plansHtml}
          </div>
        </div>
      </section>
      ${content.faqs?.length ? `
      <section class="py-20 px-6" style="background: ${c.surface}">
        <div class="max-w-3xl mx-auto">
          <h2 class="text-3xl font-bold text-center mb-12" style="color: ${c.text}">Frequently Asked Questions</h2>
          <div class="space-y-3">${faqsHtml}</div>
        </div>
      </section>` : ""}
    </div>
  `;
}

export function buildBlogIndexPageBody(
  posts: { title: string; excerpt: string; slug: string; date?: string; tag?: string; coverImageUrl?: string }[],
  companyName: string,
  theme: SiteTheme
): string {
  const c = theme.colors;

  const postsHtml = posts.length > 0
    ? posts.map(p => `
      <a href="/blog/${escapeHtml(p.slug)}.html" class="group rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 block" style="background: ${c.surface}; border: 1px solid ${c.border}; text-decoration: none">
        ${p.coverImageUrl ? `<div class="aspect-video overflow-hidden"><img src="${escapeHtml(p.coverImageUrl)}" alt="${escapeHtml(p.title)}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async" /></div>` : `<div class="aspect-video flex items-center justify-center" style="background: linear-gradient(135deg, ${c.primary}10, ${c.accent}08)"><span class="text-4xl opacity-30">📝</span></div>`}
        <div class="p-6">
          <div class="flex items-center gap-3 mb-3">
            ${p.tag ? `<span class="text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full" style="background: ${c.primary}12; color: ${c.primary}">${escapeHtml(p.tag)}</span>` : ""}
            ${p.date ? `<span class="text-xs" style="color: ${c.textMuted}">${escapeHtml(p.date)}</span>` : ""}
          </div>
          <h2 class="text-xl font-bold mb-2 transition-colors duration-200" style="color: ${c.text}">${escapeHtml(p.title)}</h2>
          <p class="text-sm leading-relaxed" style="color: ${c.textMuted}">${escapeHtml(p.excerpt)}</p>
        </div>
      </a>
    `).join("\n")
    : `<div class="col-span-full text-center py-12"><p style="color: ${c.textMuted}">No posts yet. Check back soon!</p></div>`;

  return `
    <div>
      <section class="py-24 px-6" style="background: ${c.background}">
        <div class="max-w-6xl mx-auto">
          <div class="text-center mb-16">
            <h1 class="text-4xl md:text-5xl font-bold mb-6 animate-fade-in-up" style="color: ${c.text}">Blog</h1>
            <p class="text-xl max-w-2xl mx-auto animate-fade-in-up animate-delay-1" style="color: ${c.textMuted}">Latest updates from ${escapeHtml(companyName)}</p>
          </div>
          <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            ${postsHtml}
          </div>
        </div>
      </section>
    </div>
  `;
}

export function buildBlogPostPageBody(
  post: { title: string; content: string; date?: string; tag?: string; coverImageUrl?: string },
  companyName: string,
  theme: SiteTheme
): string {
  const c = theme.colors;

  return `
    <div>
      <article class="py-24 px-6" style="background: ${c.background}">
        <div class="max-w-3xl mx-auto">
          <div class="mb-8">
            <a href="/blog.html" class="text-sm font-medium transition-colors duration-200" style="color: ${c.primary}; text-decoration: none">← Back to Blog</a>
          </div>
          ${post.coverImageUrl ? `<div class="aspect-video rounded-2xl overflow-hidden mb-8"><img src="${escapeHtml(post.coverImageUrl)}" alt="${escapeHtml(post.title)}" class="w-full h-full object-cover" loading="lazy" /></div>` : ""}
          <div class="flex items-center gap-3 mb-6">
            ${post.tag ? `<span class="text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full" style="background: ${c.primary}12; color: ${c.primary}">${escapeHtml(post.tag)}</span>` : ""}
            ${post.date ? `<span class="text-sm" style="color: ${c.textMuted}">${escapeHtml(post.date)}</span>` : ""}
          </div>
          <h1 class="text-4xl md:text-5xl font-bold mb-8 animate-fade-in-up" style="color: ${c.text}">${escapeHtml(post.title)}</h1>
          <div class="prose-custom" style="color: ${c.textMuted}; line-height: 1.8; font-size: 1.125rem">
            ${post.content}
          </div>
        </div>
      </article>
    </div>
  `;
}
