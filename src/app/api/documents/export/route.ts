import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { generatePdf } from "@/lib/pdf-generator";

/**
 * POST /api/documents/export
 * Export a document as PDF.
 *
 * Body: { projectId, documentId } or { projectId, title, content }
 */
export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId, documentId, title: directTitle, content: directContent } = body;

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const db = getDb();
  const projects = await db`SELECT id, name FROM projects WHERE id = ${projectId} AND user_id = ${user.id}`;
  if (projects.length === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const companyName = projects[0].name as string;
  let title: string;
  let content: string;

  if (documentId) {
    // Fetch document from database
    const docs = await db`
      SELECT title, content FROM documents
      WHERE id = ${documentId} AND project_id = ${projectId}
    `;
    if (docs.length === 0) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    title = docs[0].title as string;
    content = docs[0].content as string;
  } else if (directTitle && directContent) {
    title = directTitle;
    content = directContent;
  } else {
    return NextResponse.json({ error: "Provide documentId or title+content" }, { status: 400 });
  }

  try {
    const pdfBuffer = await generatePdf({
      title,
      content,
      companyName,
      generatedAt: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    });

    const safeFilename = title.replace(/[^a-zA-Z0-9-_ ]/g, "").slice(0, 80);

    const bytes = new Uint8Array(pdfBuffer);

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": bytes[0] === 0x25 ? "application/pdf" : "text/html",
        "Content-Disposition": `attachment; filename="${safeFilename}.pdf"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "PDF generation failed" },
      { status: 500 },
    );
  }
}
