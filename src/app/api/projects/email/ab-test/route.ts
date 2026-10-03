import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { createAbTest, listAbTests, type AbTestType } from "@/lib/email-ab-testing";

const VALID_TEST_TYPES: AbTestType[] = ["subject", "body", "send_time", "from_name"];

export async function GET(request: Request) {
  const user = await getSession();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId)
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const db = getDb();

  // Verify project ownership
  const projectRows = await db`
    SELECT id FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
    LIMIT 1
  `;
  if (projectRows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tests = await listAbTests(projectId);
  return NextResponse.json({ tests });
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId, testType, variantA, variantB } = body as {
    projectId?: string;
    testType?: string;
    variantA?: string;
    variantB?: string;
  };

  if (!projectId || !testType || !variantA || !variantB) {
    return NextResponse.json(
      { error: "Missing required fields: projectId, testType, variantA, variantB" },
      { status: 400 }
    );
  }

  if (!VALID_TEST_TYPES.includes(testType as AbTestType)) {
    return NextResponse.json(
      { error: `Invalid testType. Must be one of: ${VALID_TEST_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const db = getDb();

  // Verify project ownership
  const projectRows = await db`
    SELECT id FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
    LIMIT 1
  `;
  if (projectRows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const test = await createAbTest(
    projectId,
    testType as AbTestType,
    variantA,
    variantB
  );

  return NextResponse.json({ test }, { status: 201 });
}
