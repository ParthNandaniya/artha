"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useFounderDirectives(projectId: string) {
  return useQuery<{ directives: string }>({
    queryKey: ["founder_directives", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/direction?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load directives");
      return res.json();
    },
    enabled: !!projectId,
  });
}

export function useGenerateDirectives(projectId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/projects/direction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate directives");
      }
      return res.json() as Promise<{ directives: string }>;
    },
  });
}

export function useUpdateFounderDirectives(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (directives: string) => {
      const res = await fetch("/api/projects/direction", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, directives }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update directives");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["founder_directives", projectId] });
    },
  });
}
