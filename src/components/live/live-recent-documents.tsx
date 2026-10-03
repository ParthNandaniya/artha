"use client";

import { Badge } from "@/components/ui/badge";
import type { LiveRecentDocument } from "@/hooks/use-live-dashboard";
import { LiveSectionHeader } from "./live-section-header";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDocType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

interface LiveRecentDocumentsProps {
  documents: LiveRecentDocument[];
  totalDocuments: number;
  isFetching?: boolean;
}

export function LiveRecentDocuments({ documents, totalDocuments, isFetching }: LiveRecentDocumentsProps) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <LiveSectionHeader
        title="Documents"
        isFetching={isFetching}
        right={
          totalDocuments > 0 ? (
            <span className="text-xs text-muted-foreground">
              {formatNumber(totalDocuments)} created
            </span>
          ) : null
        }
      />

      <div className="divide-y divide-border">
        {documents.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">No recent documents</p>
          </div>
        ) : (
          documents.slice(0, 6).map((doc, i) => (
            <div key={`${doc.projectSlug}-${doc.type}-${i}`} className="px-4 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {formatDocType(doc.type)}
                    </Badge>
                    <span className="text-xs text-muted-foreground truncate">
                      {doc.projectName}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                  {timeAgo(doc.createdAt)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
