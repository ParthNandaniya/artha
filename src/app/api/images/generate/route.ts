import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { generateHeroImage, generateFeatureImage } from "@/lib/image-generator";

/**
 * POST /api/images/generate
 * Generate images for landing pages.
 *
 * Body: { projectId, type: "hero" | "feature", options: {...} }
 */
export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId, type, options } = body;

  if (!projectId || !type) {
    return NextResponse.json({ error: "Missing projectId or type" }, { status: 400 });
  }

  const db = getDb();
  const projects = await db`SELECT id, name FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    let imageBuffer: Buffer;

    if (type === "hero") {
      imageBuffer = await generateHeroImage({
        companyName: options?.companyName || (projects[0].name as string),
        tagline: options?.tagline || "Build something amazing",
        primaryColor: options?.primaryColor,
        style: options?.style,
      });
    } else if (type === "feature") {
      imageBuffer = await generateFeatureImage({
        title: options?.title || "Feature",
        description: options?.description || "",
        icon: options?.icon,
        primaryColor: options?.primaryColor,
      });
    } else {
      return NextResponse.json({ error: "Invalid type. Use 'hero' or 'feature'" }, { status: 400 });
    }

    // Return image as base64 data URL
    const base64 = imageBuffer.toString("base64");
    const mimeType = imageBuffer[0] === 0x89 ? "image/png" : "image/svg+xml";
    const dataUrl = `data:${mimeType};base64,${base64}`;

    return NextResponse.json({ success: true, dataUrl, size: imageBuffer.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image generation failed" },
      { status: 500 },
    );
  }
}
