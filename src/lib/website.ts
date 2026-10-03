import { getDb } from "@/lib/neon";
import { setupCloudflarePages, waitForDeployment } from "@/lib/cloudflare";
import { ensureCompanyRepo, pushWebsite } from "@/lib/github";
import { buildTrackingScript } from "@/lib/analytics-tracking-script";
import { buildSiteSDKScript } from "@/lib/site-sdk-script";
import { buildChatWidgetScript } from "@/lib/chat-widget-script";
import type { ProjectWebsite, WebsiteDeploymentStatus } from "@/lib/types";
import { buildArthaBadgeScript } from "@/lib/artha-badge";

const WEBSITE_PAGE_SLUG = "index";

interface WebsitePageMetadata {
  hasUnpublishedChanges?: boolean;
  deploymentStatus?: WebsiteDeploymentStatus;
  deploymentError?: string | null;
  lastDraftUpdatedAt?: string | null;
  lastDeployedAt?: string | null;
  stashedDraftHtml?: string | null;
}

type ProjectWebsiteRow = {
  id: string;
  name: string;
  slug: string;
  landing_page_html: string | null;
  landing_page_published: boolean;
  github_repo_full_name: string | null;
  github_repo_url: string | null;
  neon_connection_url: string | null;
  subscription_status: string | null;
};

type CompanyPageRow = {
  title: string | null;
  html: string | null;
  published: boolean;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
};

function companyDomain() {
  return process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
}

function liveUrlForSlug(slug: string) {
  return `https://${slug}.${companyDomain()}`;
}

function previewUrlForProject(projectId: string) {
  return `/api/projects/website/preview?projectId=${encodeURIComponent(projectId)}`;
}

function normalizeText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function normalizeMetadata(value: unknown): WebsitePageMetadata {
  return value && typeof value === "object" ? value as WebsitePageMetadata : {};
}

function deriveDeploymentStatus(args: {
  metadata: WebsitePageMetadata;
  published: boolean;
  previewHtml: string | null;
  deployedHtml: string | null;
}): WebsiteDeploymentStatus {
  const { metadata, published, previewHtml, deployedHtml } = args;
  if (metadata.deploymentStatus) return metadata.deploymentStatus;
  if (!previewHtml) return "not_deployed";
  if (!published) return "not_deployed";
  if (previewHtml !== deployedHtml) return "ready";
  return "deployed";
}

async function getProjectWebsiteRow(projectId: string): Promise<ProjectWebsiteRow> {
  const db = getDb();
  const rows = await db`
    SELECT id, name, slug, landing_page_html, landing_page_published, github_repo_full_name, github_repo_url, neon_connection_url, subscription_status
    FROM projects
    WHERE id = ${projectId}
    LIMIT 1
  `;

  if (rows.length === 0) {
    throw new Error("Project not found");
  }

  return rows[0] as ProjectWebsiteRow;
}

async function getCompanyPageRow(projectId: string): Promise<CompanyPageRow | null> {
  try {
    const db = getDb();
    const rows = await db`
      SELECT title, html, published, metadata, updated_at
      FROM pages
      WHERE project_id = ${projectId} AND slug = ${WEBSITE_PAGE_SLUG}
      LIMIT 1
    `;
    return (rows[0] as CompanyPageRow | undefined) || null;
  } catch {
    return null;
  }
}

async function upsertCompanyPage(args: {
  projectId: string;
  slug?: string;
  title: string;
  html: string;
  published: boolean;
  metadata: WebsitePageMetadata;
}): Promise<void> {
  const db = getDb();
  const pageSlug = args.slug || WEBSITE_PAGE_SLUG;
  await db`
    INSERT INTO pages (project_id, slug, title, html, published, metadata)
    VALUES (
      ${args.projectId},
      ${pageSlug},
      ${args.title},
      ${args.html},
      ${args.published},
      ${JSON.stringify(args.metadata)}::jsonb
    )
    ON CONFLICT (project_id, slug) DO UPDATE SET
      title = ${args.title},
      html = ${args.html},
      published = ${args.published},
      metadata = ${JSON.stringify(args.metadata)}::jsonb,
      updated_at = NOW()
  `;
}

export async function hasExistingWebsiteDraft(projectId: string): Promise<boolean> {
  const page = await getCompanyPageRow(projectId);
  return Boolean(normalizeText(page?.html));
}

export async function getAllProjectPages(
  projectId: string
): Promise<Array<{ slug: string; title: string; html: string }>> {
  try {
    const db = getDb();
    const rows = await db`
      SELECT slug, title, html
      FROM pages
      WHERE project_id = ${projectId}
        AND html IS NOT NULL
        AND slug != ${WEBSITE_PAGE_SLUG}
      ORDER BY created_at ASC
      LIMIT 20
    `;
    return rows
      .filter((r): r is { slug: string; title: string; html: string } =>
        typeof r.slug === "string" && typeof r.html === "string"
      )
      .map((r) => ({ slug: r.slug, title: (r.title as string) || r.slug, html: r.html }));
  } catch {
    return [];
  }
}

export async function getProjectWebsite(projectId: string): Promise<ProjectWebsite> {
  const [project, page] = await Promise.all([
    getProjectWebsiteRow(projectId),
    getCompanyPageRow(projectId),
  ]);

  const deployedHtml = normalizeText(project.landing_page_html);
  const previewHtml = normalizeText(page?.html) || deployedHtml;
  const metadata = normalizeMetadata(page?.metadata);
  const published = Boolean(project.landing_page_published);
  const hasUnpublishedChanges = typeof metadata.hasUnpublishedChanges === "boolean"
    ? metadata.hasUnpublishedChanges
    : Boolean(previewHtml && previewHtml !== deployedHtml);
  const deploymentError = normalizeText(metadata.deploymentError);
  const deploymentStatus = deriveDeploymentStatus({
    metadata,
    published,
    previewHtml,
    deployedHtml,
  });

  return {
    projectId,
    title: normalizeText(page?.title) || project.name,
    liveUrl: liveUrlForSlug(project.slug),
    previewUrl: previewHtml ? previewUrlForProject(projectId) : null,
    previewHtml,
    deployedHtml,
    published,
    hasDraft: Boolean(normalizeText(page?.html)),
    hasUnpublishedChanges,
    hasStashedDraft: Boolean(normalizeText(metadata.stashedDraftHtml)),
    deploymentStatus,
    deploymentError,
    lastDraftUpdatedAt: normalizeText(metadata.lastDraftUpdatedAt) || page?.updated_at || null,
    lastDeployedAt: normalizeText(metadata.lastDeployedAt),
  };
}

export async function saveWebsiteDraft(args: {
  projectId: string;
  title: string;
  html: string;
  slug?: string;
}): Promise<ProjectWebsite> {
  const pageSlug = args.slug || WEBSITE_PAGE_SLUG;

  // Extra pages (non-index) get a simpler save path
  if (pageSlug !== WEBSITE_PAGE_SLUG) {
    const now = new Date().toISOString();
    await upsertCompanyPage({
      projectId: args.projectId,
      slug: pageSlug,
      title: args.title,
      html: args.html,
      published: false,
      metadata: { hasUnpublishedChanges: true, lastDraftUpdatedAt: now },
    });
    return getProjectWebsite(args.projectId);
  }

  const [project, page] = await Promise.all([
    getProjectWebsiteRow(args.projectId),
    getCompanyPageRow(args.projectId),
  ]);

  const now = new Date().toISOString();
  const deployedHtml = normalizeText(project.landing_page_html);
  const hasUnpublishedChanges = !project.landing_page_published || deployedHtml !== args.html;
  const previousMetadata = normalizeMetadata(page?.metadata);
  const metadata: WebsitePageMetadata = {
    ...previousMetadata,
    hasUnpublishedChanges,
    deploymentStatus: project.landing_page_published
      ? (hasUnpublishedChanges ? "ready" : "deployed")
      : "not_deployed",
    deploymentError: null,
    lastDraftUpdatedAt: now,
    lastDeployedAt: previousMetadata.lastDeployedAt || null,
    stashedDraftHtml: null,
  };

  await upsertCompanyPage({
    projectId: args.projectId,
    title: args.title,
    html: args.html,
    published: Boolean(project.landing_page_published),
    metadata,
  });

  return getProjectWebsite(args.projectId);
}

export async function savePublishedWebsite(args: {
  projectId: string;
  title: string;
  html: string;
}): Promise<ProjectWebsite> {
  const db = getDb();
  const now = new Date().toISOString();

  await db`
    UPDATE projects
    SET landing_page_html = ${args.html},
        landing_page_published = TRUE
    WHERE id = ${args.projectId}
  `;

  await upsertCompanyPage({
    projectId: args.projectId,
    title: args.title,
    html: args.html,
    published: true,
    metadata: {
      hasUnpublishedChanges: false,
      deploymentStatus: "deployed",
      deploymentError: null,
      lastDraftUpdatedAt: now,
      lastDeployedAt: now,
      stashedDraftHtml: null,
    },
  });

  return getProjectWebsite(args.projectId);
}

export async function markWebsiteDeploymentState(args: {
  projectId: string;
  status: WebsiteDeploymentStatus;
  error?: string | null;
}): Promise<void> {
  const [project, page] = await Promise.all([
    getProjectWebsiteRow(args.projectId),
    getCompanyPageRow(args.projectId),
  ]);

  const html = normalizeText(page?.html) || normalizeText(project.landing_page_html);
  if (!html) return;

  const previousMetadata = normalizeMetadata(page?.metadata);
  const draftUpdatedAt = previousMetadata.lastDraftUpdatedAt || page?.updated_at || new Date().toISOString();
  const metadata: WebsitePageMetadata = {
    ...previousMetadata,
    hasUnpublishedChanges: args.status === "deployed"
      ? false
      : Boolean(html && (!project.landing_page_published || html !== normalizeText(project.landing_page_html))),
    deploymentStatus: args.status,
    deploymentError: args.status === "failed" ? normalizeText(args.error) : null,
    lastDraftUpdatedAt: draftUpdatedAt,
    lastDeployedAt: args.status === "deployed"
      ? new Date().toISOString()
      : previousMetadata.lastDeployedAt || null,
  };

  await upsertCompanyPage({
    projectId: args.projectId,
    title: normalizeText(page?.title) || project.name,
    html,
    published: args.status === "deployed" ? true : Boolean(project.landing_page_published),
    metadata,
  });
}

export async function revertWebsiteDraft(projectId: string): Promise<ProjectWebsite> {
  const [project, page] = await Promise.all([
    getProjectWebsiteRow(projectId),
    getCompanyPageRow(projectId),
  ]);

  const deployedHtml = normalizeText(project.landing_page_html);
  if (!deployedHtml) {
    throw new Error("No deployed website to revert to.");
  }

  const currentDraftHtml = normalizeText(page?.html);
  if (!currentDraftHtml || currentDraftHtml === deployedHtml) {
    throw new Error("No draft changes to revert.");
  }

  const now = new Date().toISOString();
  const previousMetadata = normalizeMetadata(page?.metadata);

  await upsertCompanyPage({
    projectId,
    title: normalizeText(page?.title) || project.name,
    html: deployedHtml,
    published: Boolean(project.landing_page_published),
    metadata: {
      ...previousMetadata,
      hasUnpublishedChanges: false,
      deploymentStatus: "deployed",
      deploymentError: null,
      lastDraftUpdatedAt: now,
      stashedDraftHtml: currentDraftHtml,
    },
  });

  return getProjectWebsite(projectId);
}

export async function restoreWebsiteDraft(projectId: string): Promise<ProjectWebsite> {
  const [project, page] = await Promise.all([
    getProjectWebsiteRow(projectId),
    getCompanyPageRow(projectId),
  ]);

  const metadata = normalizeMetadata(page?.metadata);
  const stashedHtml = normalizeText(metadata.stashedDraftHtml);
  if (!stashedHtml) {
    throw new Error("No stashed draft to restore.");
  }

  const now = new Date().toISOString();
  const deployedHtml = normalizeText(project.landing_page_html);
  const hasUnpublishedChanges = !project.landing_page_published || deployedHtml !== stashedHtml;

  await upsertCompanyPage({
    projectId,
    title: normalizeText(page?.title) || project.name,
    html: stashedHtml,
    published: Boolean(project.landing_page_published),
    metadata: {
      ...metadata,
      hasUnpublishedChanges,
      deploymentStatus: project.landing_page_published
        ? (hasUnpublishedChanges ? "ready" : "deployed")
        : "not_deployed",
      deploymentError: null,
      lastDraftUpdatedAt: now,
      stashedDraftHtml: null,
    },
  });

  return getProjectWebsite(projectId);
}

export async function deployProjectWebsite(projectId: string): Promise<ProjectWebsite> {
  const project = await getProjectWebsiteRow(projectId);
  const website = await getProjectWebsite(projectId);

  if (!website.previewHtml) {
    throw new Error("No website draft available to deploy.");
  }

  await markWebsiteDeploymentState({ projectId, status: "deploying" });

  try {
    let repoFullName = normalizeText(project.github_repo_full_name);
    if (!repoFullName) {
      const repo = await ensureCompanyRepo(project.slug);
      repoFullName = repo.fullName;
      const db = getDb();
      await db`
        UPDATE projects
        SET github_repo_url = ${repo.repoUrl},
            github_repo_full_name = ${repo.fullName}
        WHERE id = ${projectId}
      `;
    }

    if (!repoFullName) {
      throw new Error("Unable to create or load the GitHub repository for this project.");
    }

    // Gather all drafted pages for multi-page deploy
    let extraPages: Array<{ slug: string; html: string }> = [];
    try {
      const db = getDb();
      const allPages = await db`
        SELECT slug, html FROM pages WHERE project_id = ${projectId} AND html IS NOT NULL AND slug != ${WEBSITE_PAGE_SLUG}
      `;
      extraPages = allPages
        .filter((p): p is { slug: string; html: string } => typeof p.slug === "string" && typeof p.html === "string")
        .slice(0, 20);
    } catch {
      // Non-fatal — extra pages are best-effort
    }

    // Inject analytics tracking + SDK scripts into all pages before pushing
    const apiBase = process.env.NEXT_PUBLIC_APP_URL || "https://artha.run";
    const trackingTag = `<script>${buildTrackingScript(project.slug, apiBase)}</script>`;

    // Inject site SDK if project has an isolated DB (subscription-gated features)
    const hasIsolatedDb = Boolean(project.neon_connection_url);
    const sdkTag = hasIsolatedDb
      ? `<script>${buildSiteSDKScript(project.slug, apiBase)}</script>`
      : "";
    const chatWidgetTag = `<script>${buildChatWidgetScript(project.slug, apiBase)}</script>`;
    // Inject floating "Powered by Artha" badge on free-tier sites
    const isSubscribed = project.subscription_status === "active";
    const badgeTag = isSubscribed ? "" : `<script>${buildArthaBadgeScript(project.slug)}</script>`;
    const injectionTags = trackingTag + sdkTag + chatWidgetTag + badgeTag;

    // If the AI generated React code without CDN deps, inject them (+ Babel for JSX)
    const reactCdnForHtml = (h: string) => {
      if (!/\bReact\b/.test(h) || /unpkg\.com\/react|cdnjs.*react|esm\.sh\/react/.test(h)) return "";
      const needsBabel = /JSX|<\w+\s|createElement/.test(h) && !/babel/.test(h);
      return `<script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>${needsBabel ? `\n<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>` : ""}`;
    };

    const mainHtmlWithTracking = injectIntoHead(website.previewHtml, reactCdnForHtml(website.previewHtml) + injectionTags);
    const extraPagesWithTracking = extraPages.map((p) => ({
      slug: p.slug,
      html: injectIntoHead(p.html, reactCdnForHtml(p.html) + injectionTags),
    }));

    await pushWebsite(repoFullName, mainHtmlWithTracking, "", {
      name: project.name,
      slug: project.slug,
      generatedAt: new Date().toISOString(),
      extraPages: extraPagesWithTracking,
    });

    const githubOrg = process.env.GITHUB_ORG || "artha-companies";
    await setupCloudflarePages(project.slug, githubOrg);

    // Wait for Cloudflare to actually finish deploying before marking as deployed
    const deployed = await waitForDeployment(project.slug);
    if (!deployed) {
      throw new Error("Cloudflare deployment failed. Try redeploying.");
    }

    const db = getDb();
    await db`UPDATE projects SET cloudflare_setup_status = 'configured', cloudflare_setup_error = NULL WHERE id = ${projectId}`;

    return savePublishedWebsite({
      projectId,
      title: website.title || project.name,
      html: website.previewHtml,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Website deploy failed";
    await markWebsiteDeploymentState({
      projectId,
      status: "failed",
      error: message,
    });
    const db = getDb();
    await db`UPDATE projects SET cloudflare_setup_status = 'failed', cloudflare_setup_error = ${message} WHERE id = ${projectId}`;
    throw error;
  }
}

export function injectIntoHead(html: string, injection: string): string {
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>\n${injection}`);
  }
  return `<!DOCTYPE html><html><head>${injection}</head><body>${html}</body></html>`;
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export function buildWebsitePreviewHtml(html: string, liveUrl: string): string {
  const baseHref = liveUrl.endsWith("/") ? liveUrl : `${liveUrl}/`;

  // If the HTML references React but doesn't include the CDN, inject it (+ Babel for JSX).
  const needsReact = /\bReact\b/.test(html) && !/unpkg\.com\/react|cdnjs.*react|esm\.sh\/react/.test(html);
  const needsBabel = needsReact && /JSX|<\w+\s|createElement/.test(html) && !/babel/.test(html);
  const reactCdn = needsReact
    ? `<script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>${needsBabel ? `\n<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>` : ""}`
    : "";

  const injection = [
    reactCdn,
    `<base href="${escapeHtmlAttribute(baseHref)}" target="_self" />`,
    `<meta name="robots" content="noindex,nofollow" />`,
    `<script>
      document.addEventListener("click", function(event) {
        var target = event.target;
        if (!(target instanceof Element)) return;
        var link = target.closest('a[href]');
        if (!link) return;
        var href = link.getAttribute("href");
        if (!href) return;
        // Block all non-hash navigation
        if (href.charAt(0) !== "#") {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        // Handle hash scrolling
        event.preventDefault();
        if (href === "#") {
          window.scrollTo({ top: 0, behavior: "smooth" });
          history.replaceState(null, "", "#");
          return;
        }
        var section = document.querySelector(href);
        if (section instanceof HTMLElement) {
          section.scrollIntoView({ behavior: "smooth", block: "start" });
          history.replaceState(null, "", href);
        }
      }, true);
      // Block form submissions
      document.addEventListener("submit", function(e) { e.preventDefault(); }, true);
      // Block window.open
      window.open = function() { return null; };
    </script>`,
  ].join("\n");

  return injectIntoHead(html, injection);
}
