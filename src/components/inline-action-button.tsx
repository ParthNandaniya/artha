"use client";

import { Sparkles } from "lucide-react";
import { ArthaLoader } from "@/components/icons/artha-loader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useInlineAction } from "@/hooks/use-inline-action";

type InlineAction =
  | "suggest_next_steps"
  | "enrich_lead"
  | "draft_reply"
  | "deep_dive_research"
  | "rewrite_website_section";

interface InlineActionButtonProps {
  projectId: string;
  action: InlineAction;
  context?: Record<string, unknown>;
  onResult: (data: Record<string, unknown>) => void;
  onNeedCredits?: () => void;
  label: string;
  loadingLabel?: string;
  className?: string;
  variant?: "outline" | "ghost" | "secondary" | "default";
  size?: "sm" | "xs" | "default" | "lg" | "icon";
  icon?: React.ReactNode;
}

export function InlineActionButton({
  projectId,
  action,
  context,
  onResult,
  onNeedCredits,
  label,
  loadingLabel,
  className,
  variant = "outline",
  size = "sm",
  icon,
}: InlineActionButtonProps) {
  const { execute, loading } = useInlineAction<Record<string, unknown>>({
    projectId,
    action,
    onSuccess: onResult,
    onNeedCredits,
  });

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("gap-1.5", className)}
      onClick={() => execute(context)}
      disabled={loading}
    >
      {loading ? (
        <ArthaLoader size={14} className="text-current" />
      ) : (
        icon ?? <Sparkles className="h-3.5 w-3.5" />
      )}
      {loading ? (loadingLabel ?? "Generating...") : label}
    </Button>
  );
}
