const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const PAGES_BUILD_CONFIG = {
  build_command: "",
  destination_dir: "website",
};

function getConfig() {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!apiToken || !accountId) {
    throw new Error("Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID");
  }
  return { apiToken, accountId };
}

function headers(apiToken: string) {
  return {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  };
}

type CloudflareApiError = {
  code?: number;
  message?: string;
};

type CloudflareApiEnvelope<T> = {
  result?: T;
  success?: boolean;
  errors?: CloudflareApiError[];
  messages?: Array<{ code?: number; message?: string }>;
};

async function readBody(res: Response) {
  const text = await res.text();
  let json: CloudflareApiEnvelope<unknown> | null = null;
  try {
    json = JSON.parse(text) as CloudflareApiEnvelope<unknown>;
  } catch {
    json = null;
  }
  return { text, json };
}

function isAlreadyExistsError(body: string, json?: CloudflareApiEnvelope<unknown> | null) {
  return /already exists|already been taken|duplicate/i.test(body)
    || Boolean(json?.errors?.some((error) => error.code === 8000018));
}

async function hasCustomDomain(slug: string, domain: string): Promise<boolean> {
  const { apiToken, accountId } = getConfig();
  const res = await fetch(
    `${CLOUDFLARE_API}/accounts/${accountId}/pages/projects/${slug}/domains/${domain}`,
    {
      method: "GET",
      headers: headers(apiToken),
    }
  );

  if (res.ok) return true;
  if (res.status === 404) return false;

  const { text } = await readBody(res);
  throw new Error(`Cloudflare domain lookup failed: ${res.status} ${text}`);
}

async function syncPagesProjectBuildConfig(slug: string): Promise<void> {
  const { apiToken, accountId } = getConfig();
  const res = await fetch(
    `${CLOUDFLARE_API}/accounts/${accountId}/pages/projects/${slug}`,
    {
      method: "PATCH",
      headers: headers(apiToken),
      body: JSON.stringify({
        production_branch: "main",
        build_config: PAGES_BUILD_CONFIG,
        deployment_configs: {
          production: {
            // Disable Cloudflare's auto-injected Web Analytics beacon (beacon.min.js)
            // — it triggers browser "Access other apps and services" permission prompts
            // and we already have our own analytics tracking.
            web_analytics_tag: null,
            web_analytics_token: null,
          },
          preview: {
            web_analytics_tag: null,
            web_analytics_token: null,
          },
        },
      }),
    }
  );

  if (!res.ok) {
    const { text } = await readBody(res);
    throw new Error(`Cloudflare Pages project update failed: ${res.status} ${text}`);
  }
}

/**
 * Fetch the actual Pages subdomain for an existing project.
 * Cloudflare may append a suffix (e.g. `foo-1vi.pages.dev`) when `foo.pages.dev` is taken.
 */
export async function getPagesSubdomainForProject(slug: string): Promise<string> {
  const { apiToken, accountId } = getConfig();
  const res = await fetch(
    `${CLOUDFLARE_API}/accounts/${accountId}/pages/projects/${slug}`,
    { method: "GET", headers: headers(apiToken) }
  );
  if (res.ok) {
    const data = (await res.json()) as CloudflareApiEnvelope<{ subdomain?: string }>;
    if (data.result?.subdomain) return data.result.subdomain;
  }
  // Fallback — assume slug matches (works when no collision)
  return `${slug}.pages.dev`;
}

export async function createPagesProject(
  slug: string,
  githubOrg: string
): Promise<{ projectName: string; url: string; pagesSubdomain: string }> {
  const { apiToken, accountId } = getConfig();

  const res = await fetch(
    `${CLOUDFLARE_API}/accounts/${accountId}/pages/projects`,
    {
      method: "POST",
      headers: headers(apiToken),
      body: JSON.stringify({
        name: slug,
        production_branch: "main",
        build_config: PAGES_BUILD_CONFIG,
        source: {
          type: "github",
          config: {
            owner: githubOrg,
            repo_name: slug,
            production_branch: "main",
            deployments_enabled: true,
          },
        },
      }),
    }
  );

  if (!res.ok) {
    const { text, json } = await readBody(res);
    if (isAlreadyExistsError(text, json)) {
      const subdomain = await getPagesSubdomainForProject(slug);
      return {
        projectName: slug,
        url: `https://${slug}.${process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com"}`,
        pagesSubdomain: subdomain,
      };
    }
    throw new Error(`Cloudflare Pages project creation failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as CloudflareApiEnvelope<{ name: string; subdomain?: string }>;
  const subdomain = data.result?.subdomain || `${slug}.pages.dev`;
  return {
    projectName: data.result?.name || slug,
    url: `https://${slug}.${process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com"}`,
    pagesSubdomain: subdomain,
  };
}

export async function addCustomDomain(
  slug: string,
  domain: string,
  pagesSubdomain: string
): Promise<void> {
  const { apiToken, accountId } = getConfig();

  // 1. Create the CNAME DNS record pointing to the actual Pages subdomain
  await ensureDnsCname(slug, domain, pagesSubdomain);

  // 2. Register the custom domain with the Pages project
  const res = await fetch(
    `${CLOUDFLARE_API}/accounts/${accountId}/pages/projects/${slug}/domains`,
    {
      method: "POST",
      headers: headers(apiToken),
      body: JSON.stringify({ name: domain }),
    }
  );

  if (!res.ok) {
    const { text, json } = await readBody(res);
    if (isAlreadyExistsError(text, json)) {
      if (await hasCustomDomain(slug, domain)) return;
      throw new Error(
        `Cloudflare custom domain ${domain} already exists on a different Pages project. Remove it from the old project or use a different slug.`
      );
    }
    throw new Error(`Cloudflare custom domain failed: ${res.status} ${text}`);
  }
}

/**
 * Ensure a CNAME DNS record exists for `{slug}.tryartha.com` → the actual Pages subdomain.
 * Uses the Cloudflare DNS API. Requires CLOUDFLARE_ZONE_ID env var for the parent domain.
 */
async function ensureDnsCname(slug: string, domain: string, pagesSubdomain: string): Promise<void> {
  const { apiToken } = getConfig();
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!zoneId) {
    throw new Error("CLOUDFLARE_ZONE_ID not set — cannot create DNS record for custom domain.");
  }

  // Use the real Pages subdomain (e.g. "foo-1vi.pages.dev") not the assumed "{slug}.pages.dev"
  const target = pagesSubdomain;

  // Check if ANY record already exists for this name (not just CNAME — could be Workers-managed AAAA, etc.)
  const listRes = await fetch(
    `${CLOUDFLARE_API}/zones/${zoneId}/dns_records?name=${encodeURIComponent(domain)}`,
    { method: "GET", headers: headers(apiToken) }
  );

  if (listRes.ok) {
    const listData = (await listRes.json()) as CloudflareApiEnvelope<Array<{ id: string; type: string; content: string }>>;
    const records = listData.result ?? [];

    // If a CNAME already exists, just ensure it points to the right target
    const existingCname = records.find((r) => r.type === "CNAME");
    if (existingCname) {
      if (existingCname.content !== target) {
        await fetch(`${CLOUDFLARE_API}/zones/${zoneId}/dns_records/${existingCname.id}`, {
          method: "PATCH",
          headers: headers(apiToken),
          body: JSON.stringify({ content: target }),
        });
      }
      return;
    }

    // Delete any conflicting records (e.g. Workers-managed AAAA records) before creating the CNAME
    for (const record of records) {
      await fetch(`${CLOUDFLARE_API}/zones/${zoneId}/dns_records/${record.id}`, {
        method: "DELETE",
        headers: headers(apiToken),
      });
    }
  }

  // Create CNAME record (proxied through Cloudflare)
  const createRes = await fetch(
    `${CLOUDFLARE_API}/zones/${zoneId}/dns_records`,
    {
      method: "POST",
      headers: headers(apiToken),
      body: JSON.stringify({
        type: "CNAME",
        name: slug,
        content: target,
        proxied: true,
        ttl: 1, // auto
      }),
    }
  );

  if (!createRes.ok) {
    const { text } = await readBody(createRes);
    throw new Error(`Failed to create DNS CNAME for ${domain}: ${createRes.status} ${text}`);
  }
}

export async function setupCloudflarePages(
  slug: string,
  githubOrg: string
): Promise<{ projectName: string; siteUrl: string }> {
  const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
  const customDomain = `${slug}.${companyDomain}`;

  const { projectName, url, pagesSubdomain } = await createPagesProject(slug, githubOrg);
  await syncPagesProjectBuildConfig(slug);
  await addCustomDomain(slug, customDomain, pagesSubdomain);

  return { projectName, siteUrl: url };
}

/**
 * Wait for the latest Cloudflare Pages deployment to finish.
 * Polls the deployments list for up to ~90s, checking if the most recent
 * deployment reaches "success".
 * Returns: "success" | "failure" | "timeout"
 */
export async function waitForDeployment(slug: string, maxWaitMs = 90_000): Promise<"success" | "failure" | "timeout"> {
  const { apiToken, accountId } = getConfig();
  const pollInterval = 5_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < maxWaitMs) {
    try {
      const res = await fetch(
        `${CLOUDFLARE_API}/accounts/${accountId}/pages/projects/${slug}/deployments?sort_by=created_on&sort_order=desc&per_page=1`,
        { method: "GET", headers: headers(apiToken) }
      );

      if (res.ok) {
        const data = (await res.json()) as CloudflareApiEnvelope<Array<{ latest_stage?: { name?: string; status?: string } }>>;
        const latest = data.result?.[0];
        const stage = latest?.latest_stage;
        if (stage?.name === "deploy" && stage?.status === "success") {
          return "success";
        }
        if (stage?.status === "failure") {
          return "failure";
        }
      }
    } catch {
      // Transient network error — keep polling
    }

    await new Promise((r) => setTimeout(r, pollInterval));
  }

  // Timed out — deployment might still be in progress, but we don't block forever
  return "timeout";
}

/**
 * Create a Cloudflare redirect rule for tryartha.com/sitemap.xml → artha.run/sitemap-companies.xml.
 * Idempotent — skips if a rule with the same description already exists.
 * Uses the Single Redirects API (http_request_dynamic_redirect phase).
 */
export async function ensureSitemapRedirect(): Promise<void> {
  const { apiToken } = getConfig();
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!zoneId) {
    throw new Error("CLOUDFLARE_ZONE_ID not set");
  }

  const phase = "http_request_dynamic_redirect";
  const ruleDescription = "Redirect tryartha.com/sitemap.xml to artha.run";
  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || "artha.run";
  const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";

  // Get existing ruleset for this phase
  const getRes = await fetch(
    `${CLOUDFLARE_API}/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`,
    { method: "GET", headers: headers(apiToken) }
  );

  type Rule = { description?: string; expression?: string; action?: string; action_parameters?: unknown };
  type Ruleset = { id?: string; rules?: Rule[] };

  let ruleset: Ruleset = {};
  if (getRes.ok) {
    const data = (await getRes.json()) as CloudflareApiEnvelope<Ruleset>;
    ruleset = data.result ?? {};
    // Check if rule already exists
    if (ruleset.rules?.some((r) => r.description === ruleDescription)) {
      return; // already set up
    }
  }

  const newRule: Rule = {
    description: ruleDescription,
    expression: `(http.host eq "${companyDomain}" and http.request.uri.path eq "/sitemap.xml")`,
    action: "redirect",
    action_parameters: {
      from_value: {
        status_code: 301,
        target_url: {
          value: `https://${appDomain}/sitemap-companies.xml`,
        },
        preserve_query_string: false,
      },
    },
  };

  const existingRules = ruleset.rules ?? [];

  // Create or update the ruleset
  const method = ruleset.id ? "PUT" : "POST";
  const url = ruleset.id
    ? `${CLOUDFLARE_API}/zones/${zoneId}/rulesets/${ruleset.id}`
    : `${CLOUDFLARE_API}/zones/${zoneId}/rulesets`;

  const body = ruleset.id
    ? { rules: [...existingRules, newRule] }
    : { name: "default", kind: "zone", phase, rules: [newRule] };

  const res = await fetch(url, {
    method,
    headers: headers(apiToken),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const { text } = await readBody(res);
    throw new Error(`Failed to create sitemap redirect rule: ${res.status} ${text}`);
  }
}

export async function deletePagesProject(slug: string): Promise<void> {
  const { apiToken, accountId } = getConfig();

  const res = await fetch(
    `${CLOUDFLARE_API}/accounts/${accountId}/pages/projects/${slug}`,
    {
      method: "DELETE",
      headers: headers(apiToken),
    }
  );

  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Cloudflare Pages project deletion failed: ${res.status} ${body}`);
  }
}

/**
 * Delete all DNS records for a given domain (e.g. `{slug}.tryartha.com`).
 * Silently succeeds if no records exist.
 */
export async function deleteDnsRecords(domain: string): Promise<number> {
  const { apiToken } = getConfig();
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!zoneId) {
    throw new Error("CLOUDFLARE_ZONE_ID not set — cannot delete DNS records.");
  }

  const listRes = await fetch(
    `${CLOUDFLARE_API}/zones/${zoneId}/dns_records?name=${encodeURIComponent(domain)}`,
    { method: "GET", headers: headers(apiToken) }
  );

  if (!listRes.ok) return 0;

  const listData = (await listRes.json()) as CloudflareApiEnvelope<Array<{ id: string }>>;
  const records = listData.result ?? [];

  for (const record of records) {
    await fetch(`${CLOUDFLARE_API}/zones/${zoneId}/dns_records/${record.id}`, {
      method: "DELETE",
      headers: headers(apiToken),
    });
  }

  return records.length;
}
