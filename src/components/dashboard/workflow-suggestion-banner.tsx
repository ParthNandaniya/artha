"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, X } from "lucide-react";
import type { WorkflowSuggestion } from "@/lib/workflow-suggestions";

interface WorkflowSuggestionBannerProps {
  suggestions: WorkflowSuggestion[];
  onSwitchPanel: (panel: string) => void;
  onSendChat: (message: string) => void;
  onInlineAction?: (action: string, context: Record<string, unknown>) => void;
}

export function WorkflowSuggestionBanner({
  suggestions,
  onSwitchPanel,
  onSendChat,
  onInlineAction,
}: WorkflowSuggestionBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || suggestions.length === 0) return null;

  function handleClick(suggestion: WorkflowSuggestion) {
    switch (suggestion.action.type) {
      case "panel":
        onSwitchPanel(suggestion.action.panel);
        break;
      case "chat":
        onSendChat(suggestion.action.message);
        break;
      case "inline":
        onInlineAction?.(suggestion.action.inlineAction, suggestion.action.context);
        break;
    }
    setDismissed(true);
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2 dark:border-blue-900 dark:bg-blue-950/20">
      <ArrowRight className="h-3.5 w-3.5 text-blue-500 shrink-0" />
      <span className="text-xs text-blue-700 dark:text-blue-300 shrink-0">Next:</span>
      <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
        {suggestions.slice(0, 2).map((s) => (
          <Button
            key={s.id}
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-blue-700 hover:text-blue-900 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900"
            onClick={() => handleClick(s)}
          >
            {s.label}
          </Button>
        ))}
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="rounded p-0.5 text-blue-400 hover:text-blue-600 shrink-0"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
