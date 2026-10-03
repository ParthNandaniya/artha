import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb, setCompanyMemory } from "@/lib/neon";
import { ingestMemory, companyTag } from "@/lib/supermemory";
import { summarizeContentForMemory } from "@/lib/personalization";
import { decrementProjectCredits, getProjectCredits } from "@/lib/project-credits";
import { DEFAULT_CREDIT_COST } from "@/config/credit-costs";

const DOC_TYPE_MEMORY_KEY: Record<string, string> = {
  mission: "mission",
};

async function syncDocumentToMemory(
  projectId: string,
  docType: string,
  memoryKey: string,
  content: string,
  title: string,
) {
  await setCompanyMemory(projectId, memoryKey, content.slice(0, 300));
  await ingestMemory({
    content: [
      `${docType.replace(/_/g, " ")} document: ${title}`,
      `Summary: ${summarizeContentForMemory(content, 900)}`,
    ].join("\n"),
    containerTag: companyTag(projectId),
    dedupeKey: `${docType}_${projectId}`,
    projectId,
    customId: `${docType}_${projectId}`,
    metadata: { type: `${docType}_document` },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const projects = await db`SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const documents = await db`SELECT * FROM documents WHERE project_id = ${projectId} ORDER BY created_at DESC`;
  return NextResponse.json(documents);
}

export async function PUT(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, projectId, content, title } = body;

  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  if (!content?.trim() || !title?.trim()) return NextResponse.json({ error: "Content and title are required" }, { status: 400 });

  const db = getDb();
  const projects = await db`
    SELECT id
    FROM projects
    WHERE id = ${projectId} AND user_id = ${user.id}
    LIMIT 1
  `;
  if (projects.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rows = await db`
    UPDATE documents SET
      content = ${content},
      title = ${title},
      version = version + 1,
      updated_at = NOW()
    WHERE id = ${id} AND project_id = ${projectId}
    RETURNING *
  `;

  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const doc = rows[0];
  const memoryKey = DOC_TYPE_MEMORY_KEY[doc.type as string];
  if (memoryKey) {
    syncDocumentToMemory(projectId, doc.type as string, memoryKey, content, doc.title as string)
      .catch((err) => console.error("[documents] memory sync failed:", err));
  }

  return NextResponse.json(doc);
}

export async function PATCH(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId, documentId, prompt } = body;

  if (!projectId || !documentId || !prompt) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const db = getDb();
  const projects = await db`
    SELECT * FROM projects WHERE id = ${projectId} AND user_id = ${user.id}
  `;
  if (projects.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const creditsAvailable = getProjectCredits(projects[0] as Record<string, unknown>);
  if (creditsAvailable < DEFAULT_CREDIT_COST) {
    return NextResponse.json({ error: "No task credits remaining" }, { status: 402 });
  }

  await decrementProjectCredits(db, projectId, DEFAULT_CREDIT_COST);

  const rows = await db`
    INSERT INTO job_queue (type, payload)
    VALUES (
      'update_document',
      ${JSON.stringify({ projectId, documentId, prompt, userId: user.id, queuedBy: "user" })}::jsonb
    )
    RETURNING id
  `;

  return NextResponse.json({ jobId: rows[0].id });
}
