"use client";

import { FREE_TOOLS } from "@/lib/free-tools";
import { ToolPage } from "@/components/tools/tool-page";
import { MarkdownResult } from "@/components/tools/markdown-result";
import { Download } from "lucide-react";

const tool = FREE_TOOLS.find((t) => t.slug === "invoice-generator")!;

function downloadInvoiceHtml(content: string, title: string) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1a1a1a}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{padding:10px 12px;border:1px solid #e5e5e5;text-align:left}th{background:#f5f5f5;font-weight:600}h1,h2,h3{margin-top:24px}hr{border:none;border-top:1px solid #e5e5e5;margin:24px 0}@media print{body{margin:0;padding:20px}}</style></head><body>${content}</body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "invoice.html";
  a.click();
  URL.revokeObjectURL(a.href);
}

export function InvoiceGeneratorTool() {
  return (
    <ToolPage
      tool={tool}
      apiEndpoint="/api/tools/invoice-generator"
      renderResult={(data) => {
        const title = (data.title as string) || "Your Invoice";
        const content = data.content as string;
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
              <button
                onClick={() => downloadInvoiceHtml(content, title)}
                className="flex items-center gap-1.5 text-xs text-foreground font-medium hover:text-foreground/70 transition-colors"
              >
                <Download className="size-3.5" />
                Download HTML
              </button>
            </div>
            <MarkdownResult content={content} />
          </div>
        );
      }}
    />
  );
}
