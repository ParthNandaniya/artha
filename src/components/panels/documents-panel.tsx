"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Document } from "@/lib/types";

interface DocumentsPanelProps {
  documents: Document[];
  projectId?: string;
  onViewDocument: (id: string) => void;
}

const typeIcons: Record<string, string> = {
  mission: "📋",
  market_research: "📊",
  lead_research: "🎯",
  customer_research: "👥",
  ads_research: "📢",
  target_audience: "🧑‍🤝‍🧑",
  competitor_analysis: "⚔️",
  market_trends: "📈",
  pricing_research: "💰",
  content_research: "✍️",
  research: "🔬",
  plan: "📝",
  custom: "📄",
};

export function DocumentsPanel({ documents, projectId, onViewDocument }: DocumentsPanelProps) {
  const [exportingId, setExportingId] = useState<string | null>(null);

  async function handleExportPdf(e: React.MouseEvent, doc: Document) {
    e.stopPropagation();
    if (!projectId) return;
    setExportingId(doc.id);
    try {
      const res = await fetch("/api/documents/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, documentId: doc.id }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc.title.replace(/[^a-zA-Z0-9-_ ]/g, "").slice(0, 80)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silent fail — user can try again
    } finally {
      setExportingId(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl space-y-4">
      <h2 className="text-lg font-semibold">Documents</h2>

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No documents yet. Documents will be created when the AI generates your
          mission and market research.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {documents.map((doc) => (
            <Card
              key={doc.id}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => onViewDocument(doc.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{typeIcons[doc.type] || "📄"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium truncate">
                        {doc.title}
                      </h3>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        v{doc.version}
                      </Badge>
                      {projectId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 ml-auto shrink-0"
                          onClick={(e) => handleExportPdf(e, doc)}
                          disabled={exportingId === doc.id}
                          title="Export as PDF"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-[10px] mb-2">
                      {doc.type.replace("_", " ")}
                    </Badge>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {doc.content.slice(0, 120)}...
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      {new Date(doc.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
