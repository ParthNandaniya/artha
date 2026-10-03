"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Lead } from "@/lib/types";

export function useLeads(projectId?: string) {
  return useQuery<Lead[]>({
    queryKey: ["leads", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/leads?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch leads");
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useUpdateLead(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadId, updates }: { leadId: string; updates: Partial<Lead> }) => {
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, leadId, updates }),
      });
      if (!res.ok) throw new Error("Failed to update lead");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads", projectId] });
    },
  });
}

export function useBulkUpdateLeads(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadIds, updates }: { leadIds: string[]; updates: Partial<Lead> }) => {
      const res = await fetch("/api/leads/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, leadIds, updates }),
      });
      if (!res.ok) throw new Error("Failed to bulk update leads");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads", projectId] });
    },
  });
}

export function useFindLeads(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instructions?: string) => {
      const res = await fetch("/api/leads/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, instructions }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to find leads");
      }
      return res.json() as Promise<{ success: boolean; leadsCount: number; summary: string; error?: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads", projectId] });
      queryClient.invalidateQueries({ queryKey: ["documents", projectId] });
    },
  });
}
