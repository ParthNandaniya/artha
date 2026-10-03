import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import {
  createInvoice,
  listInvoices,
  updateInvoiceStatus,
  type InvoiceStatus,
  type CreateInvoiceData,
} from "@/lib/invoicing";

/**
 * GET /api/projects/invoices?projectId=xxx
 * List all invoices for a project.
 */
export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  // Verify ownership
  const db = getDb();
  const projectRows = await db`
    SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id} LIMIT 1
  `;
  if (projectRows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const invoices = await listInvoices(projectId);
  return NextResponse.json({ invoices });
}

/**
 * POST /api/projects/invoices
 * Create a new invoice.
 * Body: { projectId, clientName, clientEmail, items, dueDate, notes?, taxRate? }
 */
export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { projectId, clientName, clientEmail, items, dueDate, notes, taxRate } = body;

  if (!projectId || !clientName || !clientEmail || !items || !dueDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Verify ownership
  const db = getDb();
  const projectRows = await db`
    SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id} LIMIT 1
  `;
  if (projectRows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Validate items
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Items must be a non-empty array" }, { status: 400 });
  }

  for (const item of items) {
    if (!item.description || typeof item.quantity !== "number" || typeof item.unitPrice !== "number") {
      return NextResponse.json({ error: "Each item must have description, quantity, and unitPrice" }, { status: 400 });
    }
  }

  const data: CreateInvoiceData = {
    clientName,
    clientEmail,
    items,
    dueDate,
    notes,
    taxRate: taxRate ? parseFloat(taxRate) : undefined,
  };

  const invoice = await createInvoice(projectId, data);
  return NextResponse.json({ invoice }, { status: 201 });
}

/**
 * PATCH /api/projects/invoices
 * Update invoice status.
 * Body: { invoiceId, status, projectId }
 */
export async function PATCH(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { invoiceId, status, projectId } = body;

  if (!invoiceId || !status || !projectId) {
    return NextResponse.json({ error: "Missing invoiceId, status, or projectId" }, { status: 400 });
  }

  const validStatuses: InvoiceStatus[] = ["draft", "sent", "paid", "overdue"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, { status: 400 });
  }

  // Verify ownership
  const db = getDb();
  const projectRows = await db`
    SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${user.id} LIMIT 1
  `;
  if (projectRows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Verify invoice belongs to project
  const invoiceRows = await db`
    SELECT id FROM invoices WHERE id = ${invoiceId} AND project_id = ${projectId} LIMIT 1
  `;
  if (invoiceRows.length === 0) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const updated = await updateInvoiceStatus(invoiceId, status);
  return NextResponse.json({ invoice: updated });
}
