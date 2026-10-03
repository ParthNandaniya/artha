"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ArthaLoader } from "@/components/icons/artha-loader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSubscription } from "@/contexts/subscription-context";

interface AiGenerateButtonProps {
  projectId: string;
  formType: "task" | "email" | "research" | "tweet" | "outreach" | "lead_note" | "research_tag";
  currentValues?: Record<string, string>;
  context?: Record<string, string>;
  onResult: (values: Record<string, string>) => void;
  onNeedCredits?: () => void;
  className?: string;
  label?: string;
}

export function AiGenerateButton({
  projectId,
  formType,
  currentValues,
  context,
  onResult,
  onNeedCredits,
  className,
  label,
}: AiGenerateButtonProps) {
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const subscription = useSubscription();
  const queryClient = useQueryClient();

  const hasValues = currentValues
    ? Object.values(currentValues).some((v) => v.trim())
    : false;

  const buttonLabel =
    label ?? (hasValues ? "Enhance with AI" : "Generate with AI");

  async function handleGenerate() {
    // Pre-check credits before making API call
    if (!subscription.requireCredits()) return;

    setLoadingLabel(buttonLabel === "Generate with AI" ? "Generating..." : "Enhancing...");
    setLoading(true);
    try {
      const res = await fetch("/api/ai/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          formType,
          currentValues,
          context,
        }),
      });
      if (res.status === 402) {
        // Fallback: use explicit callback or context
        if (onNeedCredits) {
          onNeedCredits();
        } else {
          subscription.openCreditModal();
        }
        return;
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || "Failed to generate");
      }
      const data = await res.json();
      // Pass all returned fields to the parent
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === "string" || typeof value === "boolean") {
          result[key] = String(value);
        }
      }
      if (Object.keys(result).length > 0) {
        onResult(result);
        // Refresh project data to update credit count in UI
        queryClient.invalidateQueries({ queryKey: ["projects"] });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("gap-1.5", className)}
      onClick={handleGenerate}
      disabled={loading}
    >
      {loading ? (
        <ArthaLoader size={14} className="text-current" />
      ) : (
        <Sparkles className="h-3.5 w-3.5" />
      )}
      {loading ? loadingLabel : buttonLabel}
    </Button>
  );
}
