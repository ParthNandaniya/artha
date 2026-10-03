"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project } from "@/lib/types";

export function useProjectSettings(projectId: string) {
  return useQuery({
    queryKey: ["project_settings", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/settings?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load project settings");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Partial<Project>) => {
      const res = await fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: projectId, ...updates }),
      });
      if (!res.ok) throw new Error("Failed to update project");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useProjectPricing(projectId: string) {
  return useQuery({
    queryKey: ["project_pricing", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/pricing?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load pricing");
      return res.json() as Promise<{
        connectAccountId: string | null;
        plans: Array<{
          id: string;
          publicId: string;
          slug: string;
          name: string;
          amountCents: number;
          currency: string;
          billingInterval: string;
          intervalCount: number;
          ctaText: string;
          features: string[];
          sortOrder: number;
          checkoutUrl: string;
          creditAmount: number;
        }>;
      }>;
    },
    enabled: !!projectId,
  });
}

export function useUpdateProjectSettings(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const res = await fetch("/api/projects/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ...updates }),
      });
      if (!res.ok) throw new Error("Failed to update settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project_settings", projectId] });
    },
  });
}
