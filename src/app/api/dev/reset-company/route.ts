import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { deleteNeonProject } from "@/lib/website-db";
import { deletePagesProject } from "@/lib/cloudflare";
import { Octokit } from "@octokit/rest";

export async function POST(request: Request) {
  // Extra safety: never allow this in production deployments.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = (body as { projectId?: string }).projectId;
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const db = getDb();
  const rows = await db`
    SELECT id, slug, neon_project_id, github_repo_full_name
    FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const project = rows[0] as {
    id: string;
    slug: string;
    neon_project_id: string | null;
    github_repo_full_name: string | null;
  };

  const errors: string[] = [];
  let neonDeleted = false;
  let pagesDeleted = false;
  let githubDeleted = false;

  // Best-effort: delete isolated Neon project (company DB)
  if (project.neon_project_id) {
    try {
      await deleteNeonProject(project.neon_project_id);
      neonDeleted = true;
    } catch (err) {
      errors.push(`Neon delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Best-effort: delete Cloudflare Pages project + custom domain
  try {
    await deletePagesProject(project.slug);
    pagesDeleted = true;
  } catch (err) {
    errors.push(`Cloudflare delete failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Best-effort: delete GitHub repo if it was created
  if (project.github_repo_full_name) {
    try {
      const token = process.env.GITHUB_TOKEN;
      if (token) {
        const [owner, repo] = project.github_repo_full_name.split("/");
        if (owner && repo) {
          const octokit = new Octokit({ auth: token });
          await octokit.repos.delete({ owner, repo });
          githubDeleted = true;
        }
      }
    } catch (err) {
      errors.push(`GitHub delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Finally, delete the project row itself (cascades to related platform data)
  await db`
    DELETE FROM projects
    WHERE id = ${project.id} AND user_id = ${user.id}
  `;

  return NextResponse.json({
    success: true,
    projectId: project.id,
    slug: project.slug,
    neonDeleted,
    pagesDeleted,
    githubDeleted,
    errors: errors.length > 0 ? errors : undefined,
  });
}

