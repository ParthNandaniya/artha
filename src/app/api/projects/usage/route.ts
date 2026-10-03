import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { FREE_STORAGE_BYTES, FREE_FILE_STORAGE_BYTES } from "@/lib/database/constants";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const projects = await db`
    SELECT website_db_storage_bytes, website_db_overage_credits,
           file_storage_bytes, file_storage_overage_credits
    FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
  `;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    storage_bytes: Number(projects[0].website_db_storage_bytes) || 0,
    storage_limit_bytes: FREE_STORAGE_BYTES,
    overage_credits: Number(projects[0].website_db_overage_credits) || 0,
    file_storage_bytes: Number(projects[0].file_storage_bytes) || 0,
    file_storage_limit_bytes: FREE_FILE_STORAGE_BYTES,
    file_storage_overage_credits: Number(projects[0].file_storage_overage_credits) || 0,
  });
}
