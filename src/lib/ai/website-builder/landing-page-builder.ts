import { ProjectMemory } from "@/lib/memory";
import { generateLandingPageContent } from "./theme-generator";
import { buildLandingPageHtml, type LandingPageContent } from "./website-template";
import { validateLandingPage, ensureFooter } from "./validation";
import {
  normalizeGeneratedPricingPlans,
  shouldProvisionPricingCheckout,
  syncProjectPricingPlans,
} from "@/lib/marketplace";

export { validateLandingPage } from "./validation";

/**
 * Template-based landing page generation.
 *
 * Flow:
 *   1. AI generates a small JSON payload (~2k tokens): theme colors, hero copy,
 *      section content, feature items.
 *   2. The template engine assembles the full HTML from pre-built components
 *      (Navbar, Hero, Features, CTA, Footer) using that JSON.
 *   3. Validation + footer safety net.
 *
 * Cost savings: the AI call drops from ~8k tokens (full HTML) to ~2k tokens
 * (JSON content only). The boilerplate, CDN scripts, React mount, animations,
 * responsive nav, and footer are all baked into the template — never regenerated.
 */
export async function generateLandingPage(
  companyPrompt: string,
  memory: ProjectMemory,
  projectSlug: string,
  companyName?: string,
  tagline?: string,
  options?: {
    marketplace?: {
      projectId: string;
      userId: string;
      prompt?: string;
      /** Skip keyword check — provision pricing if AI generated pricing sections */
      autoProvision?: boolean;
    };
  }
): Promise<string> {
  const companyEmail = `${projectSlug}@${process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com"}`;

  const content: LandingPageContent = await generateLandingPageContent({
    companyName: companyName || projectSlug,
    companyPrompt,
    projectSlug,
    memory,
    tagline,
    includePricing: options?.marketplace?.autoProvision,
  });

  const pricingPlans = content.sections
    .filter((section) => section.type === "pricing" && section.plans?.length)
    .flatMap((section) => section.plans || []);
  const shouldProvision =
    pricingPlans.length > 0 &&
    Boolean(options?.marketplace?.projectId) &&
    Boolean(options?.marketplace?.userId) &&
    (options?.marketplace?.autoProvision || shouldProvisionPricingCheckout(options?.marketplace?.prompt || companyPrompt));

  if (shouldProvision && options?.marketplace) {
    const syncedPlans = await syncProjectPricingPlans({
      projectId: options.marketplace.projectId,
      userId: options.marketplace.userId,
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
          const normalized = normalizeGeneratedPricingPlans([plan])[0];
          if (!normalized) return plan;

          const checkoutUrl = checkoutUrls.get(normalized.slug);
          if (!checkoutUrl) return plan;

          return {
            ...plan,
            ctaHref: checkoutUrl,
          };
        }),
      };
    });
  }

  content.projectSlug = projectSlug;
  const html = buildLandingPageHtml(content);

  const validation = validateLandingPage(html);
  if (!validation.valid) {
    throw new Error(`Template-built page failed validation: ${validation.errors.join("; ")}`);
  }

  return ensureFooter(html, companyEmail);
}
