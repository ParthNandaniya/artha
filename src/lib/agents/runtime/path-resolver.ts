import { getDb } from "@/lib/neon";
import { getAllProjectPages, getProjectWebsite, saveWebsiteDraft } from "@/lib/website";
import { companyTag, getRelevantContext } from "@/lib/supermemory";
import { getProjectAnalyticsSummary } from "@/lib/analytics-context";

export type PathKind =
  | "site"
  | "docs"
  | "tasks"
  | "emails"
  | "leads"
  | "analytics"
  | "memory"
  | "contacts";

export interface ParsedPath {
  kind: PathKind;
  rest: string;
  raw: string;
}

export function parsePath(path: string): ParsedPath {
  const match = path.match(/^([a-z]+):(.*)$/i);
  if (!match) {
    throw new Error(`Invalid path '${path}'. Paths must be like 'site:index' or 'tasks:abc123'.`);
  }
  const kind = match[1].toLowerCase() as PathKind;
  const rest = match[2];
  const allowed: PathKind[] = ["site", "docs", "tasks", "emails", "leads", "analytics", "memory", "contacts"];
  if (!allowed.includes(kind)) {
    throw new Error(`Unknown resource kind '${kind}'. Allowed: ${allowed.join(", ")}.`);
  }
  return { kind, rest, raw: path };
}

export interface ResolverContext {
  projectId: string;
  userId: string;
}

export interface ResourceSnapshot {
  path: string;
  content: string;
  readonly: boolean;
}

export async function readResource(path: string, ctx: ResolverContext): Promise<ResourceSnapshot> {
  const p = parsePath(path);
  switch (p.kind) {
    case "site":
      return readSite(p.rest, ctx);
    case "docs":
      return readDoc(p.rest, ctx);
    case "tasks":
      return readTasks(p.rest, ctx);
    case "emails":
      return readEmails(p.rest, ctx);
    case "leads":
      return readLeads(p.rest, ctx);
    case "analytics":
      return readAnalytics(p.rest, ctx);
    case "memory":
      return readMemory(p.rest, ctx);
    case "contacts":
      return readContacts(p.rest, ctx);
  }
}

export async function listResources(pattern: string, ctx: ResolverContext): Promise<string[]> {
  const match = pattern.match(/^([a-z]+):(.*)$/i);
  if (!match) throw new Error(`Invalid pattern '${pattern}'. Use e.g. 'site:*' or 'tasks:*'.`);
  const kind = match[1].toLowerCase() as PathKind;
  const rest = match[2];
  switch (kind) {
    case "site": {
      const [main, extras] = await Promise.all([getProjectWebsite(ctx.projectId), getAllProjectPages(ctx.projectId)]);
      const paths: string[] = [];
      if (main.previewHtml) paths.push("site:index");
      for (const p of extras) paths.push(`site:${p.slug}`);
      return filterByGlob(paths, `site:${rest}`);
    }
    case "docs": {
      return filterByGlob(["docs:mission"], `docs:${rest}`);
    }
    case "tasks": {
      const db = getDb();
      const rows = await db`SELECT id FROM tasks WHERE project_id = ${ctx.projectId} ORDER BY created_at DESC LIMIT 100`;
      const paths = ["tasks:"].concat(rows.map((r) => `tasks:${r.id}`));
      return filterByGlob(paths, `tasks:${rest}`);
    }
    case "emails": {
      return filterByGlob(["emails:recent"], `emails:${rest}`);
    }
    case "leads": {
      return filterByGlob(["leads:"], `leads:${rest}`);
    }
    case "analytics":
      return filterByGlob(["analytics:summary"], `analytics:${rest}`);
    case "memory":
      return [];
    case "contacts":
      return filterByGlob(["contacts:"], `contacts:${rest}`);
  }
}

function filterByGlob(paths: string[], pattern: string): string[] {
  if (pattern === pattern.replace(/[*?]/g, "")) {
    return paths.filter((p) => p === pattern);
  }
  const re = new RegExp(
    "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
  );
  return paths.filter((p) => re.test(p));
}

async function readSite(slug: string, ctx: ResolverContext): Promise<ResourceSnapshot> {
  if (!slug || slug === "" || slug === "index") {
    const w = await getProjectWebsite(ctx.projectId);
    const html = w.previewHtml || "";
    if (!html) {
      return { path: "site:index", content: "", readonly: false };
    }
    return { path: "site:index", content: html, readonly: false };
  }
  const pages = await getAllProjectPages(ctx.projectId);
  const page = pages.find((p) => p.slug === slug);
  if (!page) throw new Error(`Page 'site:${slug}' not found. Use Glob 'site:*' to list available pages.`);
  return { path: `site:${slug}`, content: page.html, readonly: false };
}

async function readDoc(rest: string, ctx: ResolverContext): Promise<ResourceSnapshot> {
  if (rest === "mission" || rest === "") {
    const db = getDb();
    const rows = await db`SELECT value FROM memory WHERE project_id = ${ctx.projectId} AND key = 'missionDoc' LIMIT 1`;
    if (rows.length > 0 && rows[0].value) {
      const v = rows[0].value;
      const content = typeof v === "string" ? v : JSON.stringify(v, null, 2);
      return { path: "docs:mission", content, readonly: true };
    }
    return { path: "docs:mission", content: "(no mission doc yet)", readonly: true };
  }
  throw new Error(`Unknown doc '${rest}'. Supported: docs:mission`);
}

async function readTasks(rest: string, ctx: ResolverContext): Promise<ResourceSnapshot> {
  const db = getDb();
  if (rest === "" || rest === "*") {
    const rows = await db`
      SELECT id, title, status, tag, type, created_at
      FROM tasks
      WHERE project_id = ${ctx.projectId}
      ORDER BY created_at DESC
      LIMIT 50
    `;
    const lines = rows.map((r) => `${r.id}\t${r.status}\t${r.tag || "-"}\t${r.title}`).join("\n");
    return { path: "tasks:", content: lines || "(no tasks)", readonly: true };
  }
  const rows = await db`
    SELECT id, title, description, status, tag, type, created_at, updated_at
    FROM tasks
    WHERE project_id = ${ctx.projectId} AND id = ${rest}
    LIMIT 1
  `;
  if (rows.length === 0) throw new Error(`Task '${rest}' not found`);
  return { path: `tasks:${rest}`, content: JSON.stringify(rows[0], null, 2), readonly: true };
}

async function readEmails(rest: string, ctx: ResolverContext): Promise<ResourceSnapshot> {
  const db = getDb();
  if (rest === "recent" || rest === "") {
    try {
      const rows = await db`
        SELECT id, to_email, status, sent_at
        FROM email_sends
        WHERE project_id = ${ctx.projectId}
        ORDER BY sent_at DESC NULLS LAST
        LIMIT 20
      `;
      if (rows.length === 0) return { path: "emails:recent", content: "(no emails sent)", readonly: true };
      const lines = rows.map((r) => `${r.id}\t${r.sent_at || "-"}\t${r.status}\t${r.to_email}`).join("\n");
      return { path: "emails:recent", content: lines, readonly: true };
    } catch {
      return { path: "emails:recent", content: "(email_sends table not available)", readonly: true };
    }
  }
  try {
    const rows = await db`
      SELECT * FROM email_sends
      WHERE project_id = ${ctx.projectId} AND id = ${rest}
      LIMIT 1
    `;
    if (rows.length === 0) throw new Error(`Email '${rest}' not found`);
    return { path: `emails:${rest}`, content: JSON.stringify(rows[0], null, 2), readonly: true };
  } catch {
    return { path: `emails:${rest}`, content: "(email_sends table not available)", readonly: true };
  }
}

async function readLeads(rest: string, ctx: ResolverContext): Promise<ResourceSnapshot> {
  const db = getDb();
  if (rest === "" || rest === "*") {
    try {
      const rows = await db`
        SELECT id, name, company, email, role, score, created_at
        FROM leads
        WHERE project_id = ${ctx.projectId}
        ORDER BY created_at DESC
        LIMIT 50
      `;
      if (rows.length === 0) return { path: "leads:", content: "(no leads saved)", readonly: true };
      const lines = rows.map((r) => `${r.id}\t${r.company}\t${r.name}\t${r.email || "-"}\t${r.role || "-"}\tscore=${r.score ?? "-"}`).join("\n");
      return { path: "leads:", content: lines, readonly: true };
    } catch {
      return { path: "leads:", content: "(leads table not available)", readonly: true };
    }
  }
  try {
    const rows = await db`
      SELECT * FROM leads WHERE project_id = ${ctx.projectId} AND id = ${rest} LIMIT 1
    `;
    if (rows.length === 0) throw new Error(`Lead '${rest}' not found`);
    return { path: `leads:${rest}`, content: JSON.stringify(rows[0], null, 2), readonly: true };
  } catch {
    return { path: `leads:${rest}`, content: "(leads table not available)", readonly: true };
  }
}

async function readAnalytics(rest: string, ctx: ResolverContext): Promise<ResourceSnapshot> {
  if (rest === "summary" || rest === "") {
    try {
      const summary = await getProjectAnalyticsSummary(ctx.projectId);
      const content = typeof summary === "string" ? summary : JSON.stringify(summary, null, 2);
      return { path: "analytics:summary", content, readonly: true };
    } catch {
      return { path: "analytics:summary", content: "(analytics not available)", readonly: true };
    }
  }
  throw new Error(`Unknown analytics path '${rest}'. Supported: analytics:summary`);
}

async function readMemory(rest: string, ctx: ResolverContext): Promise<ResourceSnapshot> {
  const query = rest || "";
  if (!query) {
    return { path: "memory:", content: "Use MemorySearch to query memory, or memory:{query} to search.", readonly: true };
  }
  const relevant = await getRelevantContext({
    query,
    containerTag: companyTag(ctx.projectId),
    limit: 6,
    threshold: 0.45,
  });
  return { path: `memory:${query}`, content: relevant || "(no relevant memories)", readonly: true };
}

async function readContacts(rest: string, ctx: ResolverContext): Promise<ResourceSnapshot> {
  const db = getDb();
  if (rest === "" || rest === "*") {
    try {
      const rows = await db`
        SELECT id, email, created_at
        FROM contacts
        WHERE project_id = ${ctx.projectId}
        ORDER BY created_at DESC
        LIMIT 50
      `;
      if (rows.length === 0) return { path: "contacts:", content: "(no contacts)", readonly: true };
      const lines = rows.map((r) => `${r.id}\t${r.email}\t${r.created_at}`).join("\n");
      return { path: "contacts:", content: lines, readonly: true };
    } catch {
      return { path: "contacts:", content: "(contacts table not available)", readonly: true };
    }
  }
  throw new Error(`Unknown contacts path '${rest}'`);
}

export async function writeSiteDraft(slug: string, html: string, ctx: ResolverContext & { title?: string }): Promise<void> {
  const effectiveSlug = !slug || slug === "" ? "index" : slug;
  const title = ctx.title || (await deriveTitleFromHtml(html)) || `Page — ${effectiveSlug}`;
  await saveWebsiteDraft({
    projectId: ctx.projectId,
    title,
    html,
    slug: effectiveSlug,
  });
}

export async function writeResource(path: string, content: string, ctx: ResolverContext): Promise<void> {
  const p = parsePath(path);
  if (p.kind !== "site") {
    throw new Error(
      `Write/Edit is only supported for 'site:*' resources in this version. Path '${path}' is read-only.`,
    );
  }
  await writeSiteDraft(p.rest, content, ctx);
}

async function deriveTitleFromHtml(html: string): Promise<string | null> {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (match) return match[1].trim();
  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1) return h1[1].trim().slice(0, 80);
  return null;
}

export function isWritable(path: string): boolean {
  try {
    const p = parsePath(path);
    return p.kind === "site";
  } catch {
    return false;
  }
}
