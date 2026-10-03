"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, X, TrendingUp, Users, BarChart3, FileText } from "lucide-react";
import { ArthaLoader } from "@/components/icons/artha-loader";

interface BriefingOpportunity {
  type: "lead" | "competitor" | "analytics" | "content";
  title: string;
  description: string;
  panel: string;
}

interface BriefingAction {
  label: string;
  chatMessage: string;
}

interface BriefingData {
  headline: string;
  opportunities: BriefingOpportunity[];
  suggestedActions: BriefingAction[];
}

interface MorningBriefingProps {
  projectId: string;
  onSwitchPanel: (panel: string) => void;
  onSendChat: (message: string) => void;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  lead: <Users className="h-4 w-4 text-blue-500" />,
  competitor: <TrendingUp className="h-4 w-4 text-red-500" />,
  analytics: <BarChart3 className="h-4 w-4 text-green-500" />,
  content: <FileText className="h-4 w-4 text-purple-500" />,
};

export function MorningBriefing({ projectId, onSwitchPanel, onSendChat }: MorningBriefingProps) {
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const dismissKey = `briefing_dismissed_${projectId}`;
    const dismissedAt = localStorage.getItem(dismissKey);
    if (dismissedAt && new Date(dismissedAt).toDateString() === new Date().toDateString()) {
      setDismissed(true);
      return;
    }

    setLoading(true);
    fetch("/api/ai/briefing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    })
      .then(async (res) => {
        if (!res.ok) {
          setError(true);
          return;
        }
        const data = await res.json();
        if (data.headline) setBriefing(data);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (dismissed || error) return null;

  if (loading) {
    return (
      <Card className="border-primary/20 bg-gradient-to-r from-primary/[0.03] to-transparent">
        <CardContent className="p-4 flex items-center gap-3">
          <ArthaLoader size={16} className="text-primary" />
          <span className="text-sm text-muted-foreground">Generating your morning briefing...</span>
        </CardContent>
      </Card>
    );
  }

  if (!briefing) return null;

  function handleDismiss() {
    localStorage.setItem(`briefing_dismissed_${projectId}`, new Date().toISOString());
    setDismissed(true);
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/[0.03] to-transparent animate-[reveal-up_400ms_ease-out_both]">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">{briefing.headline}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Morning briefing</p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {briefing.opportunities.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {briefing.opportunities.map((opp, i) => (
              <button
                key={i}
                onClick={() => onSwitchPanel(opp.panel)}
                className="flex items-start gap-2 rounded-md border bg-background p-2.5 text-left transition-colors hover:border-primary/30 hover:bg-muted/50"
              >
                <div className="mt-0.5 shrink-0">
                  {TYPE_ICONS[opp.type] || <Sparkles className="h-4 w-4 text-primary" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{opp.title}</p>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{opp.description}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {briefing.suggestedActions.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-muted-foreground">Quick actions:</span>
            {briefing.suggestedActions.map((action, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onSendChat(action.chatMessage)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
