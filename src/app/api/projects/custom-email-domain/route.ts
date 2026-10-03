import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { addSenderDomain } from "@/lib/postmark";
import { CustomEmailDomainSchema, parseBody } from "@/lib/validation";

export async function POST(request: Request) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.json();
  const parsed = parseBody(CustomEmailDomainSchema, raw);
  if (!parsed.success) return parsed.response;
  const { projectId, domain } = parsed.data;

  const db = getDb();

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

  if (project.subscription_status !== "active") {
    return NextResponse.json(
      { error: "Custom email domains require a Pro subscription" },
      { status: 403 }
    );
  }

  try {
    // Register domain with Postmark and get DNS records
    const dnsRecords = await addSenderDomain(domain);

    // Save to project
    await db`
      UPDATE projects
      SET custom_email_domain = ${domain},
          email_domain_verified = FALSE
      WHERE id = ${projectId}
    `;

    return NextResponse.json({
      success: true,
      domain,
      dnsRecords,
      message: `Domain ${domain} added to Postmark. Configure the DNS records below, then verify.`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to add email domain";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
