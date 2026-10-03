"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSubscription } from "@/contexts/subscription-context";

type InlineAction =
  | "suggest_next_steps"
  | "enrich_lead"
  | "draft_reply"
  | "deep_dive_research"
  | "rewrite_website_section";

interface UseInlineActionOptions<T> {
  projectId: string;
  action: InlineAction;
  onSuccess?: (result: T) => void;
  onNeedCredits?: () => void;
}

export function useInlineAction<T = Record<string, unknown>>({
  projectId,
  action,
  onSuccess,
  onNeedCredits,
}: UseInlineActionOptions<T>) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subscription = useSubscription();
  const queryClient = useQueryClient();

  const execute = useCallback(
    async (context?: Record<string, unknown>): Promise<T | null> => {
      if (!subscription.requireCredits()) return null;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/ai/inline-action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, action, context: context ?? {} }),
        });

        if (res.status === 402) {
          if (onNeedCredits) {
            onNeedCredits();
          } else {
            subscription.openCreditModal();
          }
          return null;
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error((errData as { error?: string }).error || "Failed to generate");
        }

        const data = (await res.json()) as T;
        queryClient.invalidateQueries({ queryKey: ["projects"] });
        onSuccess?.(data);
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to generate";
        setError(message);
        toast.error(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [projectId, action, subscription, onSuccess, onNeedCredits, queryClient],
  );

  return { execute, loading, error };
}
