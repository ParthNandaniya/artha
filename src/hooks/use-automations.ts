"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface AutomationRule {
  id: string;
  project_id: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  action_type: string;
  action_config: Record<string, unknown>;
  enabled: boolean;
  last_triggered_at: string | null;
  created_at: string;
}

export function useAutomations(projectId: string | undefined) {
  return useQuery<AutomationRule[]>({
    queryKey: ["automations", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/automations?projectId=${projectId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useCreateAutomation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rule: {
      triggerType: string;
      triggerConfig?: Record<string, unknown>;
      actionType: string;
      actionConfig?: Record<string, unknown>;
    }) => {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ...rule }),
      });
      if (!res.ok) throw new Error("Failed to create rule");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations", projectId] });
      toast.success("Automation created");
    },
    onError: () => toast.error("Failed to create automation"),
  });
}

export function useToggleAutomation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) => {
      const res = await fetch("/api/automations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId, enabled }),
      });
      if (!res.ok) throw new Error("Failed to update rule");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations", projectId] });
    },
  });
}

export function useDeleteAutomation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ruleId: string) => {
      const res = await fetch(`/api/automations?ruleId=${ruleId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete rule");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations", projectId] });
      toast.success("Automation deleted");
    },
  });
}
