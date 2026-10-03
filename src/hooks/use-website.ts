"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProjectWebsite } from "@/lib/types";
import type { WebsiteDatabaseStats } from "@/app/api/projects/website/database/route";

export function useWebsite(projectId?: string) {
  return useQuery<ProjectWebsite | null>({
    queryKey: ["website", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const res = await fetch(`/api/projects/website?projectId=${projectId}`);
      if (!res.ok) {
        if (res.status === 404) return null; // Expected if not created yet
        throw new Error("Failed to fetch website");
      }
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useWebsiteDatabase(projectId?: string) {
  return useQuery<WebsiteDatabaseStats | null>({
    queryKey: ["website-db", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const res = await fetch(`/api/projects/website/database?projectId=${projectId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

export function useDeployWebsite(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/projects/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Website deploy failed.");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["website", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
