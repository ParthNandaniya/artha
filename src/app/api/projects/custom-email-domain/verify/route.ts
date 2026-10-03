import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { verifySenderDomain } from "@/lib/postmark";

export async function POST(request: Request) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = (await request.json()) as { projectId: string };

  if (!projectId) {
    return NextResponse.json(
      { error: "Missing projectId" },
      { status: 400 }
    );
  }

  const db = getDb();

  const projects = await db`
    SELECT id, slug, custom_email_domain
    FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
    LIMIT 1
  `;

  const project = projects[0] as
    | { id: string; slug: string; custom_email_domain: string | null }
    | undefined;

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!project.custom_email_domain) {
    return NextResponse.json(
      { error: "No custom email domain configured" },
      { status: 400 }
    );
  }

  try {
    const status = await verifySenderDomain(project.custom_email_domain);

    if (status.allVerified) {
      await db`
        UPDATE projects
        SET email_domain_verified = TRUE
        WHERE id = ${projectId}
      `;
    }

    return NextResponse.json({
      verified: status.allVerified,
      status,
      message: status.allVerified
        ? "All DNS records verified! Emails will now send from your custom domain."
        : "Some DNS records are not yet verified. It can take up to 48 hours for DNS changes to propagate.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
