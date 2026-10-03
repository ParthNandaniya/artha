import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb, getCompanyMemoryMap } from "@/lib/neon";
import { generateLandingPage } from "@/lib/ai/website-builder/landing-page-builder";
import { decrementProjectCredits, getProjectCredits } from "@/lib/project-credits";
import { getCreditCost } from "@/config/credit-costs";
import { deployProjectWebsite, getProjectWebsite, hasExistingWebsiteDraft, saveWebsiteDraft } from "@/lib/website";
import type { ProjectMemory } from "@/lib/memory";

type WebsiteAction = "deploy" | "setup" | "recreate" | "save-blocks";

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return items.length > 0 ? items : undefined;
}

async function assertProjectOwnership(projectId: string, userId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db`
    SELECT id
    FROM projects
    WHERE id = ${projectId} AND user_id = ${userId}
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  if (!await assertProjectOwnership(projectId, user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const website = await getProjectWebsite(projectId);
    return NextResponse.json(website);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load website";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const action: WebsiteAction = body.action === "setup" ? "setup" : body.action === "recreate" ? "recreate" : body.action === "save-blocks" ? "save-blocks" : "deploy";
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  if (!await assertProjectOwnership(projectId, user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    if (action === "recreate") {
      if (process.env.NODE_ENV !== "development") {
        return NextResponse.json({ error: "Not available" }, { status: 403 });
      }

      const db = getDb();
      const rows = await db`
        SELECT *
        FROM projects
        WHERE id = ${projectId} AND user_id = ${user.id}
        LIMIT 1
      `;
      if (rows.length === 0) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const project = rows[0] as Record<string, unknown>;
      const companyMemory = await getCompanyMemoryMap(projectId, [
        "companyDescription",
        "tagline",
        "mission",
        "competitors",
      ]);
      const projectMemory = (project.memory as Record<string, unknown> | null) || {};
      const companyPrompt =
        asString(companyMemory.companyDescription)
        || asString(projectMemory.companyDescription)
        || asString(project.name)
        || "Build the company website";
      const tagline = asString(companyMemory.tagline);
      const memory: ProjectMemory = {
        companyDescription: companyPrompt,
        mission: asString(companyMemory.mission),
        competitors: asStringArray(companyMemory.competitors),
      };

      // Skip marketplace/Stripe provisioning during recreate — pricing checkout
      // URLs get wired up at deploy time, not during draft regeneration.
      const html = await generateLandingPage(
        companyPrompt,
        memory,
        project.slug as string,
        project.name as string,
        tagline,
      );

      await saveWebsiteDraft({
        projectId,
        title: project.name as string,
        html,
      });

      return NextResponse.json(await getProjectWebsite(projectId));
    }

    if (action === "setup") {
      const db = getDb();
      const rows = await db`
        SELECT *
        FROM projects
        WHERE id = ${projectId} AND user_id = ${user.id}
        LIMIT 1
      `;
      if (rows.length === 0) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const project = rows[0] as Record<string, unknown>;
      const hasLandingPageHtml = typeof project.landing_page_html === "string"
        && project.landing_page_html.trim().length > 0;
      const hasWebsiteDraft = await hasExistingWebsiteDraft(projectId);
      if (hasLandingPageHtml || hasWebsiteDraft) {
        return NextResponse.json(await getProjectWebsite(projectId));
      }

      const freeWebsiteBuildAvailable = !project.landing_page_published && !hasLandingPageHtml && !hasWebsiteDraft;
      const creditsAvailable = getProjectCredits(project);
      const websiteCost = getCreditCost("website_builder");
      if (!freeWebsiteBuildAvailable && creditsAvailable < websiteCost) {
        return NextResponse.json({
          error: "No task credits remaining",
          message: "You're out of task credits. Buy a credit pack or subscribe to build the website.",
        }, { status: 402 });
      }

      const companyMemory = await getCompanyMemoryMap(projectId, [
        "companyDescription",
        "tagline",
        "mission",
        "competitors",
      ]);
      const projectMemory = (project.memory as Record<string, unknown> | null) || {};
      const companyPrompt =
        asString(companyMemory.companyDescription)
        || asString(projectMemory.companyDescription)
        || asString(project.name)
        || "Build the company website";
      const tagline = asString(companyMemory.tagline);
      const memory: ProjectMemory = {
        companyDescription: companyPrompt,
        mission: asString(companyMemory.mission),
        competitors: asStringArray(companyMemory.competitors),
      };

      const html = await generateLandingPage(
        companyPrompt,
        memory,
        project.slug as string,
        project.name as string,
        tagline,
        {
          marketplace: {
            projectId,
            userId: user.id,
            prompt: companyPrompt,
          },
        }
      );

      await saveWebsiteDraft({
        projectId,
        title: project.name as string,
        html,
      });

      if (!freeWebsiteBuildAvailable) {
        await decrementProjectCredits(db, projectId, getCreditCost("website_builder"));
      }

      return NextResponse.json(await getProjectWebsite(projectId));
    }

    const website = await deployProjectWebsite(projectId);
    return NextResponse.json(website);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Website deploy failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
