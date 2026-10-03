import { getDb } from "@/lib/neon";

// ═══════════════════════════════════════════════════════════════════════════
// Invoicing — create, manage, and render invoices
// ═══════════════════════════════════════════════════════════════════════════

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Invoice {
  id: string;
  projectId: string;
  clientName: string;
  clientEmail: string;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: InvoiceStatus;
  dueDate: string;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvoiceData {
  clientName: string;
  clientEmail: string;
  items: InvoiceItem[];
  dueDate: string;
  notes?: string;
  taxRate?: number;
}

/**
 * Create a new invoice.
 */
export async function createInvoice(
  projectId: string,
  data: CreateInvoiceData
): Promise<Invoice> {
  const db = getDb();
  const { subtotal, tax, total } = calculateInvoiceTotal(data.items, data.taxRate);

  const rows = await db`
    INSERT INTO invoices (project_id, client_name, client_email, items, subtotal, tax, total, status, due_date, notes)
    VALUES (
      ${projectId},
      ${data.clientName},
      ${data.clientEmail},
      ${JSON.stringify(data.items)},
      ${subtotal},
      ${tax},
      ${total},
      'draft',
      ${data.dueDate},
      ${data.notes || null}
    )
    RETURNING *
  `;

  return parseInvoiceRow(rows[0]);
}

/**
 * Fetch a single invoice by ID.
 */
export async function getInvoice(invoiceId: string): Promise<Invoice | null> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM invoices WHERE id = ${invoiceId}
  `;
  if (rows.length === 0) return null;
  return parseInvoiceRow(rows[0]);
}

/**
 * List all invoices for a project.
 */
export async function listInvoices(projectId: string): Promise<Invoice[]> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM invoices
    WHERE project_id = ${projectId}
    ORDER BY created_at DESC
  `;
  return rows.map(parseInvoiceRow);
}

/**
 * Update invoice status.
 */
export async function updateInvoiceStatus(
  invoiceId: string,
  status: InvoiceStatus
): Promise<Invoice | null> {
  const db = getDb();

  const paidAt = status === "paid" ? new Date().toISOString() : null;

  const rows = await db`
    UPDATE invoices
    SET status = ${status},
        paid_at = CASE WHEN ${status} = 'paid' THEN ${paidAt} ELSE paid_at END,
        updated_at = NOW()
    WHERE id = ${invoiceId}
    RETURNING *
  `;

  if (rows.length === 0) return null;
  return parseInvoiceRow(rows[0]);
}

/**
 * Calculate invoice totals from line items.
 */
export function calculateInvoiceTotal(
  items: InvoiceItem[],
  taxRate?: number
): { subtotal: number; tax: number; total: number } {
  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );
  const tax = taxRate ? Math.round(subtotal * taxRate * 100) / 100 : 0;
  const total = Math.round((subtotal + tax) * 100) / 100;

  return { subtotal: Math.round(subtotal * 100) / 100, tax, total };
}

/**
 * Generate styled HTML for an invoice (for PDF generation or email).
 */
export function generateInvoiceHtml(invoice: Invoice): string {
  const itemRows = invoice.items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5">${escapeHtml(item.description)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:center">${item.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:right">$${item.unitPrice.toFixed(2)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:right">$${(item.quantity * item.unitPrice).toFixed(2)}</td>
      </tr>`
    )
    .join("\n");

  const statusColors: Record<InvoiceStatus, string> = {
    draft: "#6b7280",
    sent: "#3b82f6",
    paid: "#10b981",
    overdue: "#ef4444",
  };

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Invoice</title></head>
<body style="margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a;background:#f9fafb">
  <div style="max-width:680px;margin:0 auto;padding:40px 24px">
    <div style="background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1);padding:40px">

      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px">
        <div>
          <h1 style="margin:0;font-size:28px;font-weight:700">INVOICE</h1>
          <p style="margin:4px 0 0;color:#6b7280;font-size:14px">#${escapeHtml(invoice.id.slice(0, 8).toUpperCase())}</p>
        </div>
        <span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;text-transform:uppercase;color:#fff;background:${statusColors[invoice.status]}">
          ${invoice.status}
        </span>
      </div>

      <!-- Client Info -->
      <div style="margin-bottom:32px;padding:16px;background:#f9fafb;border-radius:8px">
        <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;color:#6b7280;font-weight:600">Bill To</p>
        <p style="margin:0;font-weight:600">${escapeHtml(invoice.clientName)}</p>
        <p style="margin:2px 0 0;color:#6b7280">${escapeHtml(invoice.clientEmail)}</p>
      </div>

      <!-- Dates -->
      <div style="display:flex;gap:32px;margin-bottom:32px;font-size:14px">
        <div>
          <span style="color:#6b7280">Created:</span>
          <strong>${new Date(invoice.createdAt).toLocaleDateString()}</strong>
        </div>
        <div>
          <span style="color:#6b7280">Due:</span>
          <strong>${new Date(invoice.dueDate).toLocaleDateString()}</strong>
        </div>
        ${invoice.paidAt ? `<div><span style="color:#6b7280">Paid:</span> <strong>${new Date(invoice.paidAt).toLocaleDateString()}</strong></div>` : ""}
      </div>

      <!-- Items Table -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;font-weight:600">Description</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;text-transform:uppercase;color:#6b7280;font-weight:600">Qty</th>
            <th style="padding:10px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#6b7280;font-weight:600">Unit Price</th>
            <th style="padding:10px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#6b7280;font-weight:600">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>

      <!-- Totals -->
      <div style="margin-left:auto;width:240px">
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px">
          <span style="color:#6b7280">Subtotal</span>
          <span>$${invoice.subtotal.toFixed(2)}</span>
        </div>
        ${invoice.tax > 0 ? `
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px">
          <span style="color:#6b7280">Tax</span>
          <span>$${invoice.tax.toFixed(2)}</span>
        </div>` : ""}
        <div style="display:flex;justify-content:space-between;padding:12px 0;font-size:18px;font-weight:700;border-top:2px solid #1a1a1a;margin-top:8px">
          <span>Total</span>
          <span>$${invoice.total.toFixed(2)}</span>
        </div>
      </div>

      ${invoice.notes ? `
      <!-- Notes -->
      <div style="margin-top:32px;padding:16px;background:#fffbeb;border-radius:8px;border-left:4px solid #f59e0b">
        <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;color:#92400e;font-weight:600">Notes</p>
        <p style="margin:0;font-size:14px;color:#78350f">${escapeHtml(invoice.notes)}</p>
      </div>` : ""}

    </div>
  </div>
</body>
</html>`;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function parseInvoiceRow(row: Record<string, unknown>): Invoice {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    clientName: row.client_name as string,
    clientEmail: row.client_email as string,
    items: (typeof row.items === "string" ? JSON.parse(row.items) : row.items) as InvoiceItem[],
    subtotal: parseFloat(String(row.subtotal)),
    tax: parseFloat(String(row.tax)),
    total: parseFloat(String(row.total)),
    status: row.status as InvoiceStatus,
    dueDate: row.due_date as string,
    paidAt: (row.paid_at as string) || null,
    notes: (row.notes as string) || null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
