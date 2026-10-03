"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowRightLeft,
  Calendar,
  Mail,
  MessageSquare,
  PenLine,
  Plus,
  Send,
  Loader2,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

interface Activity {
  id: string;
  deal_id: string;
  type: string;
  content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface ContactTimelineProps {
  dealId: string;
}

// ── Activity type config ─────────────────────────────────────────────

const ACTIVITY_ICONS: Record<string, { Icon: React.ComponentType<{ className?: string }>; color: string }> = {
  created: { Icon: Plus, color: "text-blue-500 bg-blue-50" },
  stage_change: { Icon: ArrowRightLeft, color: "text-purple-500 bg-purple-50" },
  note: { Icon: PenLine, color: "text-amber-500 bg-amber-50" },
  email: { Icon: Mail, color: "text-green-500 bg-green-50" },
  email_sent: { Icon: Send, color: "text-green-500 bg-green-50" },
  meeting: { Icon: Calendar, color: "text-indigo-500 bg-indigo-50" },
  comment: { Icon: MessageSquare, color: "text-slate-500 bg-slate-50" },
};

function getActivityConfig(type: string) {
  return ACTIVITY_ICONS[type] || ACTIVITY_ICONS.comment;
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

// ── Component ────────────────────────────────────────────────────────

export function ContactTimeline({ dealId }: ContactTimelineProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchActivities = useCallback(async () => {
    try {
      const res = await fetch(`/api/deals?dealId=${dealId}&activities=true`);
      if (res.ok) {
        const data = await res.json();
        setActivities(data);
      }
    } catch (err) {
      console.error("Failed to fetch activities:", err);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setSaving(true);

    try {
      const res = await fetch("/api/deals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          notes: noteText.trim(),
        }),
      });

      if (res.ok) {
        setNoteText("");
        // Refresh activities
        fetchActivities();
      }
    } catch (err) {
      console.error("Failed to add note:", err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Add note form */}
      <div className="rounded-lg border bg-card p-3">
        <textarea
          className="w-full resize-none rounded border-0 bg-transparent px-0 py-1 text-sm placeholder:text-muted-foreground focus:outline-none"
          placeholder="Add a note..."
          rows={2}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleAddNote();
            }
          }}
        />
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-muted-foreground">
            {navigator.platform.includes("Mac") ? "Cmd" : "Ctrl"}+Enter to save
          </span>
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={!noteText.trim() || saving}
            onClick={handleAddNote}
          >
            {saving ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Plus className="mr-1 h-3 w-3" />
            )}
            Add note
          </Button>
        </div>
      </div>

      {/* Timeline */}
      {activities.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No activity yet
        </p>
      ) : (
        <div className="relative ml-4">
          {/* Vertical line */}
          <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />

          {activities.map((activity) => {
            const config = getActivityConfig(activity.type);
            const { Icon, color } = config;

            return (
              <div key={activity.id} className="relative mb-4 flex items-start gap-3 pl-3">
                {/* Icon dot */}
                <div
                  className={`z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${color}`}
                >
                  <Icon className="h-3 w-3" />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm leading-snug">
                    {activity.content || activity.type.replace(/_/g, " ")}
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    {formatTimestamp(activity.created_at)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
