"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ResearchTagRecord } from "@/lib/types";

export function useResearchTags(projectId?: string) {
  return useQuery<ResearchTagRecord[]>({
    queryKey: ["research-tags", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/research/tags?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch research tags");
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useRunResearch(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ prompt, tag }: { prompt: string; tag: string }) => {
      const res = await fetch("/api/research/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, prompt, tag }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["research-tags", projectId] });
    },
  });
}

export function useDeleteResearchTag(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tagId: string) => {
      const res = await fetch(`/api/research/tags?id=${tagId}&projectId=${projectId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete research tag");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["research-tags", projectId] });
    },
  });
}

export function useCreateResearchTag(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tag, label, description }: { tag: string; label: string; description: string }) => {
      const res = await fetch("/api/research/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, tag, label, description }),
      });
      if (!res.ok) throw new Error("Failed to create research tag");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["research-tags", projectId] });
    },
  });
}
