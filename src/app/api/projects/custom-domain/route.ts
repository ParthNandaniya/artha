import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { addCustomDomain, getPagesSubdomainForProject } from "@/lib/cloudflare";
import { CustomDomainSchema, parseBody } from "@/lib/validation";

export async function POST(request: Request) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.json();
  const parsed = parseBody(CustomDomainSchema, raw);
  if (!parsed.success) return parsed.response;
  const { projectId, domain } = parsed.data;

  const db = getDb();

  // Verify the user owns this project
  const projects = await db`
    SELECT id, slug, subscription_status
    FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
    LIMIT 1
  `;

  const project = projects[0] as
    | { id: string; slug: string; subscription_status: string }
    | undefined;

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Custom domains are now available to all users (free CNAME setup)

  try {
    const pagesSubdomain = await getPagesSubdomainForProject(project.slug);
    await addCustomDomain(project.slug, domain, pagesSubdomain);

    // Save the custom domain to the project
    await db`
      UPDATE projects
      SET custom_domain = ${domain}
      WHERE id = ${projectId}
    `;

    return NextResponse.json({
      success: true,
      domain,
      message: `Custom domain ${domain} configured. DNS CNAME points to ${pagesSubdomain}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to add custom domain";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
