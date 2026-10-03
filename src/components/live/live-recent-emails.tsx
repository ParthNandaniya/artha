"use client";

import type { LiveRecentEmail } from "@/hooks/use-live-dashboard";
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

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

interface LiveRecentEmailsProps {
  emails: LiveRecentEmail[];
  totalEmails: number;
  isFetching?: boolean;
}

export function LiveRecentEmails({ emails, totalEmails, isFetching }: LiveRecentEmailsProps) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <LiveSectionHeader
        title="Email"
        isFetching={isFetching}
        right={
          totalEmails > 0 ? (
            <span className="text-xs text-muted-foreground">
              {formatNumber(totalEmails)} sent
            </span>
          ) : null
        }
      />

      <div className="divide-y divide-border">
        {emails.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">No recent emails</p>
          </div>
        ) : (
          emails.slice(0, 6).map((email, i) => (
            <div key={`email-${i}`} className="px-4 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">
                    <span className="text-muted-foreground">&rarr;</span>{" "}
                    {email.subject || "No subject"}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">
                    To: {email.toEmail || "—"}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                  {timeAgo(email.createdAt)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
