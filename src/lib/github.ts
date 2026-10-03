import { Octokit } from "@octokit/rest";

function getOctokit() {
  return new Octokit({ auth: process.env.GITHUB_TOKEN });
}

const ORG = () => process.env.GITHUB_ORG || "artha-companies";

function isRepoAlreadyExistsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = "status" in error ? error.status : undefined;
  const message = "message" in error ? String(error.message) : "";
  return status === 422 && /already exists|name has already been taken/i.test(message);
}

export async function createCompanyRepo(
  slug: string
): Promise<{ repoUrl: string; fullName: string }> {
  const octokit = getOctokit();
  const { data: repo } = await octokit.repos.createInOrg({
    org: ORG(),
    name: slug,
    description: `AI-powered company: ${slug} — built by Artha`,
    private: true,
    auto_init: true,
  });

  return {
    repoUrl: repo.html_url,
    fullName: repo.full_name,
  };
}

export async function ensureCompanyRepo(
  slug: string
): Promise<{ repoUrl: string; fullName: string; existed: boolean }> {
  try {
    const repo = await createCompanyRepo(slug);
    return { ...repo, existed: false };
  } catch (error) {
    if (!isRepoAlreadyExistsError(error)) throw error;

    const octokit = getOctokit();
    const { data: repo } = await octokit.repos.get({
      owner: ORG(),
      repo: slug,
    });

    return {
      repoUrl: repo.html_url,
      fullName: repo.full_name,
      existed: true,
    };
  }
}

export async function pushFiles(
  repoFullName: string,
  files: Array<{ path: string; content: string }>,
  commitMessage: string = "Update from Artha"
): Promise<void> {
  const octokit = getOctokit();
  const [owner, repo] = repoFullName.split("/");

  // Retry getRef to handle GitHub's eventual consistency after repo creation
  // (auto_init may not be visible for a few seconds)
  let ref: { object: { sha: string } } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await octokit.git.getRef({ owner, repo, ref: "heads/main" });
      ref = result.data;
      break;
    } catch (err: unknown) {
      const status = err && typeof err === "object" && "status" in err ? (err as { status: number }).status : 0;
      if (status === 404 && attempt < 4) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  if (!ref) throw new Error(`Could not get ref heads/main for ${repoFullName} after retries`);
  const latestSha = ref.object.sha;

  const { data: baseTree } = await octokit.git.getTree({ owner, repo, tree_sha: latestSha });

  const blobs = await Promise.all(
    files.map(async (file) => {
      const { data: blob } = await octokit.git.createBlob({
        owner,
        repo,
        content: Buffer.from(file.content).toString("base64"),
        encoding: "base64",
      });
      return { path: file.path, sha: blob.sha, mode: "100644" as const, type: "blob" as const };
    })
  );

  const { data: newTree } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: baseTree.sha,
    tree: blobs,
  });

  const { data: newCommit } = await octokit.git.createCommit({
    owner,
    repo,
    message: commitMessage,
    tree: newTree.sha,
    parents: [latestSha],
  });

  await octokit.git.updateRef({
    owner,
    repo,
    ref: "heads/main",
    sha: newCommit.sha,
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function pushWebsite(
  repoFullName: string,
  websiteHtml: string,
  websiteCss: string,
  config: Record<string, unknown> & { extraPages?: Array<{ slug: string; html: string }> }
): Promise<void> {
  const { extraPages, ...configRest } = config;
  const slug = config.slug as string | undefined;
  const companyName = config.companyName as string | undefined;
  const tagline = config.tagline as string | undefined;
  const email = config.email as string | undefined;
  const missionSummary = config.missionSummary as string | undefined;
  const companyDomain = process.env.NEXT_PUBLIC_COMPANY_DOMAIN || "tryartha.com";
  const siteUrl = slug ? `https://${slug}.${companyDomain}` : undefined;

  // Truncate mission at the last sentence boundary within the limit so
  // llms.txt never ends mid-sentence or mid-word.
  function truncateAtSentence(text: string, limit: number): string {
    if (text.length <= limit) return text;
    const cut = text.slice(0, limit);
    const lastPeriod = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"));
    if (lastPeriod > limit * 0.5) return cut.slice(0, lastPeriod + 1).trim();
    const lastSpace = cut.lastIndexOf(" ");
    return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim() + "...";
  }

  const missionForLlms = missionSummary ? truncateAtSentence(missionSummary, 600) : undefined;

  const files = [
    { path: "website/index.html", content: websiteHtml },
    { path: "website/styles.css", content: websiteCss },
    { path: "config/artha.json", content: JSON.stringify(configRest, null, 2) },
    {
      path: ".artha/metadata.json",
      content: JSON.stringify({
        version: "1.0",
        updatedAt: new Date().toISOString(),
        platform: "artha",
      }, null, 2),
    },
    {
      path: "website/robots.txt",
      content: [
        "User-agent: *",
        "Allow: /",
        ...(siteUrl ? [`Sitemap: ${siteUrl}/sitemap.xml`] : []),
      ].join("\n"),
    },
    {
      path: "website/sitemap.xml",
      content: (() => {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://artha.run";
        const ogImageUrl = slug ? `${appUrl}/api/og/${slug}` : "";
        const imageTag = ogImageUrl ? `\n    <image:image>\n      <image:loc>${ogImageUrl}</image:loc>\n      <image:title>${escapeXml(companyName ?? slug ?? "")}</image:title>\n    </image:image>` : "";
        const today = new Date().toISOString().split("T")[0];
        return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${siteUrl ?? "/"}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <lastmod>${today}</lastmod>${imageTag}
  </url>${(extraPages ?? []).map(p => `
  <url>
    <loc>${siteUrl ?? "/"}/${p.slug}.html</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <lastmod>${today}</lastmod>
  </url>`).join("")}
</urlset>`;
      })(),
    },
    {
      path: "website/llms.txt",
      content: [
        `# ${companyName ?? slug}`,
        "",
        tagline ? `> ${tagline}` : "",
        "",
        missionForLlms ?? "",
        "",
        "## Key Information",
        `- Company: ${companyName ?? slug}`,
        tagline ? `- Tagline: ${tagline}` : "",
        ...(siteUrl ? [`- Website: ${siteUrl}`] : []),
        ...(email ? [`- Email: ${email}`] : []),
        "",
        "## Contact",
        ...(siteUrl ? [`- Website: ${siteUrl}`] : []),
        ...(email ? [`- Email: ${email}`] : []),
        "",
        "## Built With",
        "- Artha — AI company builder (https://artha.run)",
      ]
        .filter(Boolean)
        .join("\n")
        .trim(),
    },
    {
      path: "website/.well-known/ai-plugin.json",
      content: JSON.stringify({
        schema_version: "v1",
        name: companyName ?? slug,
        description: tagline || missionForLlms?.slice(0, 200) || "",
        url: siteUrl || "",
        contact_email: email || "",
        logo_url: siteUrl ? `${siteUrl}/icon.svg` : "",
      }, null, 2),
    },
    ...(extraPages ?? []).map((p) => ({
      path: `website/${p.slug}.html`,
      content: p.html,
    })),
    {
      path: "website/_headers",
      content: [
        "/*",
        "  Permissions-Policy: browsing-topics=(), interest-cohort=(), presentation=(), bluetooth=(), usb=(), serial=(), hid=(), window-management=()",
        "  X-Content-Type-Options: nosniff",
        "  Referrer-Policy: strict-origin-when-cross-origin",
        "  Cache-Control: public, max-age=3600, stale-while-revalidate=86400",
        "",
        "/*.html",
        "  Cache-Control: public, max-age=1800, stale-while-revalidate=86400",
        "",
        "/sitemap.xml",
        "  Cache-Control: public, max-age=86400",
        "  Content-Type: application/xml",
        "",
        "/robots.txt",
        "  Cache-Control: public, max-age=86400",
        "",
        "/llms.txt",
        "  Cache-Control: public, max-age=86400",
        "  Content-Type: text/plain; charset=utf-8",
      ].join("\n"),
    },
  ];

  await pushFiles(repoFullName, files, "Deploy website and config");
}
