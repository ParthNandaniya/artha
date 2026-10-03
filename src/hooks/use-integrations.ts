"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface StripeEvent {
  stripe_event_id: string;
  type: string;
  livemode: boolean;
  processed: boolean;
  created_at: string;
  error_message: string | null;
}

export function useBillingEvents(projectId: string) {
  return useQuery<StripeEvent[]>({
    queryKey: ["billing_events", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/stripe/events?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load billing events");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useRunIntegrationAction(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (action: "create_email_address" | "post_launch_tweet" | "deploy_cloudflare") => {
      const res = await fetch("/api/projects/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.reason || data.error || "Integration action failed.");
      }
      return data;
    },
    onSuccess: (_data, action) => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      if (action === "deploy_cloudflare") {
        queryClient.invalidateQueries({ queryKey: ["website", projectId] });
      }
    },
  });
}
