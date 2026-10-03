"use client";

import { Button } from "@/components/ui/button";
import { Sparkles, Users, BarChart3, FileText, Zap } from "lucide-react";

interface Suggestion {
  id: string;
  type: string;
  panel: string;
  title: string;
  description: string;
  actionLabel: string;
  chatMessage: string;
}

interface SuggestionCardProps {
  suggestion: Suggestion;
  onAction: (chatMessage: string) => void;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  empty_state: <Sparkles className="h-3.5 w-3.5 text-primary" />,
  activity_nudge: <Zap className="h-3.5 w-3.5 text-amber-500" />,
  performance: <BarChart3 className="h-3.5 w-3.5 text-green-500" />,
  competitor: <Users className="h-3.5 w-3.5 text-red-500" />,
};

export function SuggestionCard({ suggestion, onAction }: SuggestionCardProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-muted-foreground/20 bg-muted/30 px-3 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        {TYPE_ICONS[suggestion.type] || <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
        <div className="min-w-0">
          <p className="text-xs font-medium truncate">{suggestion.title}</p>
          <p className="text-[11px] text-muted-foreground truncate">{suggestion.description}</p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs shrink-0"
        onClick={() => onAction(suggestion.chatMessage)}
      >
        {suggestion.actionLabel}
      </Button>
    </div>
  );
}
