"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Project } from "@/lib/types";

interface InvoicesPanelProps {
  project: Project;
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

interface Invoice {
  id: string;
  projectId: string;
  clientName: string;
  clientEmail: string;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: "draft" | "sent" | "paid" | "overdue";
  dueDate: string;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  draft: { variant: "secondary", label: "Draft" },
  sent: { variant: "default", label: "Sent" },
  paid: { variant: "outline", label: "Paid" },
  overdue: { variant: "destructive", label: "Overdue" },
};

export function InvoicesPanel({ project }: InvoicesPanelProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create form state
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([{ description: "", quantity: 1, unitPrice: 0 }]);
  const [creating, setCreating] = useState(false);

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/invoices?projectId=${project.id}`);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices || []);
      }
    } catch (error) {
      console.error("Failed to fetch invoices:", error);
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  async function handleCreate() {
    if (!clientName || !clientEmail || !dueDate || items.length === 0) return;
    const validItems = items.filter((i) => i.description && i.quantity > 0 && i.unitPrice > 0);
    if (validItems.length === 0) return;

    setCreating(true);
    try {
      const res = await fetch("/api/projects/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          clientName,
          clientEmail,
          items: validItems,
          dueDate,
          notes: notes || undefined,
        }),
      });
      if (res.ok) {
        setClientName("");
        setClientEmail("");
        setDueDate("");
        setNotes("");
        setItems([{ description: "", quantity: 1, unitPrice: 0 }]);
        setShowCreate(false);
        fetchInvoices();
      }
    } catch (error) {
      console.error("Failed to create invoice:", error);
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusUpdate(invoiceId: string, status: string) {
    setActionLoading(invoiceId);
    try {
      const res = await fetch("/api/projects/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, status, projectId: project.id }),
      });
      if (res.ok) {
        fetchInvoices();
        if (selectedInvoice?.id === invoiceId) {
          const data = await res.json();
          setSelectedInvoice(data.invoice);
        }
      }
    } catch (error) {
      console.error("Failed to update invoice:", error);
    } finally {
      setActionLoading(null);
    }
  }

  function addItem() {
    setItems([...items, { description: "", quantity: 1, unitPrice: 0 }]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof InvoiceItem, value: string | number) {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  }

  const formTotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-6 w-6 border-2 border-orange-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Invoice detail view
  if (selectedInvoice) {
    const inv = selectedInvoice;
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setSelectedInvoice(null)} className="text-sm">
          &larr; Back to list
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Invoice #{inv.id.slice(0, 8).toUpperCase()}</CardTitle>
              <Badge variant={STATUS_STYLES[inv.status]?.variant || "secondary"}>
                {STATUS_STYLES[inv.status]?.label || inv.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-neutral-500">Client</p>
                <p className="font-medium">{inv.clientName}</p>
                <p className="text-neutral-400">{inv.clientEmail}</p>
              </div>
              <div>
                <p className="text-neutral-500">Due Date</p>
                <p className="font-medium">{new Date(inv.dueDate).toLocaleDateString()}</p>
                {inv.paidAt && (
                  <p className="text-green-600 text-xs">Paid {new Date(inv.paidAt).toLocaleDateString()}</p>
                )}
              </div>
            </div>

            {/* Items table */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-neutral-500">
                  <th className="pb-2">Description</th>
                  <th className="pb-2 text-center">Qty</th>
                  <th className="pb-2 text-right">Price</th>
                  <th className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {inv.items.map((item, i) => (
                  <tr key={i} className="border-b border-neutral-100">
                    <td className="py-2">{item.description}</td>
                    <td className="py-2 text-center">{item.quantity}</td>
                    <td className="py-2 text-right">${item.unitPrice.toFixed(2)}</td>
                    <td className="py-2 text-right">${(item.quantity * item.unitPrice).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end">
              <div className="w-48 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Subtotal</span>
                  <span>${inv.subtotal.toFixed(2)}</span>
                </div>
                {inv.tax > 0 && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Tax</span>
                    <span>${inv.tax.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base border-t pt-2">
                  <span>Total</span>
                  <span>${inv.total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {inv.notes && (
              <div className="bg-amber-50 border-l-4 border-amber-400 p-3 text-sm text-amber-900 rounded">
                {inv.notes}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              {inv.status === "draft" && (
                <Button
                  size="sm"
                  onClick={() => handleStatusUpdate(inv.id, "sent")}
                  disabled={actionLoading === inv.id}
                >
                  {actionLoading === inv.id ? "Sending..." : "Mark as Sent"}
                </Button>
              )}
              {(inv.status === "sent" || inv.status === "overdue") && (
                <Button
                  size="sm"
                  onClick={() => handleStatusUpdate(inv.id, "paid")}
                  disabled={actionLoading === inv.id}
                >
                  {actionLoading === inv.id ? "Updating..." : "Mark Paid"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Create form
  if (showCreate) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setShowCreate(false)} className="text-sm">
          &larr; Back to list
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Create Invoice</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-neutral-700">Client Name</label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Acme Corp" />
              </div>
              <div>
                <label className="text-sm font-medium text-neutral-700">Client Email</label>
                <Input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="billing@acme.com" type="email" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-neutral-700">Due Date</label>
                <Input value={dueDate} onChange={(e) => setDueDate(e.target.value)} type="date" />
              </div>
            </div>

            {/* Line items */}
            <div>
              <label className="text-sm font-medium text-neutral-700">Line Items</label>
              <div className="space-y-2 mt-2">
                {items.map((item, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateItem(i, "description", e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={item.quantity || ""}
                      onChange={(e) => updateItem(i, "quantity", parseInt(e.target.value) || 0)}
                      className="w-20"
                    />
                    <Input
                      type="number"
                      placeholder="Price"
                      value={item.unitPrice || ""}
                      onChange={(e) => updateItem(i, "unitPrice", parseFloat(e.target.value) || 0)}
                      className="w-28"
                      step="0.01"
                    />
                    {items.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeItem(i)} className="text-red-500 shrink-0">
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={addItem} className="mt-2 text-xs">
                + Add Item
              </Button>
            </div>

            <div>
              <label className="text-sm font-medium text-neutral-700">Notes (optional)</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment terms, thank you note..." />
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <span className="text-lg font-bold">Total: ${formTotal.toFixed(2)}</span>
              <Button onClick={handleCreate} disabled={creating || !clientName || !clientEmail || !dueDate}>
                {creating ? "Creating..." : "Create Invoice"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invoice list
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Invoices</h3>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          Create Invoice
        </Button>
      </div>

      {invoices.length === 0 ? (
        <div className="text-center py-12 text-neutral-500">
          No invoices yet. Create your first invoice to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => (
            <Card
              key={inv.id}
              className="cursor-pointer hover:border-orange-200 transition-colors"
              onClick={() => setSelectedInvoice(inv)}
            >
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="flex items-center gap-4">
                  <Badge variant={STATUS_STYLES[inv.status]?.variant || "secondary"}>
                    {STATUS_STYLES[inv.status]?.label || inv.status}
                  </Badge>
                  <div>
                    <p className="font-medium text-sm">{inv.clientName}</p>
                    <p className="text-xs text-neutral-400">
                      Due {new Date(inv.dueDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <span className="font-bold">${inv.total.toFixed(2)}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
