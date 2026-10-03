import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { generateLogos, generateSingleLogo, type LogoStyle } from "@/lib/ai/logo/generate-logo";

async function assertProjectOwnership(projectId: string, userId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db`
    SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${userId} LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * GET /api/projects/logo?projectId=xxx
 * Returns current logo data for the project.
 */
export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  if (!await assertProjectOwnership(projectId, user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const db = getDb();
  const rows = await db`
    SELECT logo_url, brand_kit FROM projects WHERE id = ${projectId} LIMIT 1
  `;

  return NextResponse.json({
    logoUrl: rows[0]?.logo_url || null,
    brandKit: rows[0]?.brand_kit || {},
  });
}

/**
 * POST /api/projects/logo
 * Actions: "generate" | "select" | "regenerate-single"
 */
export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const action = body.action as string;

  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  if (!await assertProjectOwnership(projectId, user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const db = getDb();

  try {
    if (action === "generate") {
      // Fetch project data for context
      const rows = await db`
        SELECT name, slug, brand_kit FROM projects WHERE id = ${projectId} LIMIT 1
      `;
      if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const project = rows[0];
      const brandKit = (project.brand_kit as Record<string, unknown>) || {};

      const result = await generateLogos({
        companyName: (project.name as string) || (project.slug as string),
        tagline: body.tagline || (brandKit.tagline as string),
        industry: body.industry || (brandKit.industry as string),
        primaryColor: body.primaryColor || (brandKit.primaryColor as string) || "#6366f1",
        accentColor: body.accentColor || (brandKit.accentColor as string) || "#f59e0b",
        styles: body.styles,
      });

      // Store variants in brand_kit
      await db`
        UPDATE projects
        SET brand_kit = COALESCE(brand_kit, '{}'::jsonb) || ${JSON.stringify({ logoVariants: result.variants })}::jsonb
        WHERE id = ${projectId}
      `;

      return NextResponse.json(result);
    }

    if (action === "select") {
      // Select a logo variant as the active logo
      const logoUrl = typeof body.logoUrl === "string" ? body.logoUrl : "";
      if (!logoUrl) return NextResponse.json({ error: "Missing logoUrl" }, { status: 400 });

      await db`
        UPDATE projects
        SET logo_url = ${logoUrl},
            brand_kit = COALESCE(brand_kit, '{}'::jsonb) || ${JSON.stringify({ selectedLogoUrl: logoUrl })}::jsonb
        WHERE id = ${projectId}
      `;

      return NextResponse.json({ ok: true, logoUrl });
    }

    if (action === "regenerate-single") {
      const style = body.style as LogoStyle;
      if (!style) return NextResponse.json({ error: "Missing style" }, { status: 400 });

      const rows = await db`
        SELECT name, slug, brand_kit FROM projects WHERE id = ${projectId} LIMIT 1
      `;
      const project = rows[0];
      const brandKit = (project.brand_kit as Record<string, unknown>) || {};

      const variant = await generateSingleLogo(
        {
          companyName: (project.name as string) || (project.slug as string),
          tagline: brandKit.tagline as string,
          industry: brandKit.industry as string,
          primaryColor: (brandKit.primaryColor as string) || "#6366f1",
          accentColor: (brandKit.accentColor as string) || "#f59e0b",
        },
        style
      );

      return NextResponse.json({ variant });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Logo generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
