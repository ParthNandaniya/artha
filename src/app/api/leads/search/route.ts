import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { searchLeads, type LeadSearchFilters } from "@/lib/lead-database";

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  // Verify project ownership
  const db = getDb();
  const projects = await db`
    SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id} LIMIT 1
  `;
  if (projects.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Parse filters from query params
  const filters: LeadSearchFilters = {};

  const q = searchParams.get("q");
  if (q) filters.q = q;

  const status = searchParams.get("status");
  if (status) filters.status = status;

  const minScore = searchParams.get("minScore");
  if (minScore) filters.minScore = parseInt(minScore, 10);

  const maxScore = searchParams.get("maxScore");
  if (maxScore) filters.maxScore = parseInt(maxScore, 10);

  const tags = searchParams.get("tags");
  if (tags) filters.tags = tags.split(",").map((t) => t.trim()).filter(Boolean);

  const contacted = searchParams.get("contacted");
  if (contacted !== null) filters.contacted = contacted === "true";

  const dateFrom = searchParams.get("dateFrom");
  if (dateFrom) filters.dateFrom = dateFrom;

  const dateTo = searchParams.get("dateTo");
  if (dateTo) filters.dateTo = dateTo;

  const page = searchParams.get("page");
  if (page) filters.page = parseInt(page, 10);

  const limit = searchParams.get("limit");
  if (limit) filters.limit = parseInt(limit, 10);

  try {
    const result = await searchLeads(projectId, filters);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Lead search failed:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
