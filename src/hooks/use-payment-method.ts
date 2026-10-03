"use client";

import { useQuery } from "@tanstack/react-query";

interface UsageResponse {
  storage_bytes: number;
  storage_limit_bytes: number;
  overage_credits: number;
  file_storage_bytes: number;
  file_storage_limit_bytes: number;
  file_storage_overage_credits: number;
}

export function useProjectUsage(projectId?: string) {
  return useQuery<UsageResponse>({
    queryKey: ["project-usage", projectId],
    queryFn: async () => {
      if (!projectId) return { storage_bytes: 0, storage_limit_bytes: 104857600, overage_credits: 0, file_storage_bytes: 0, file_storage_limit_bytes: 209715200, file_storage_overage_credits: 0 };
      const res = await fetch(`/api/projects/usage?projectId=${projectId}`);
      if (!res.ok) return { storage_bytes: 0, storage_limit_bytes: 104857600, overage_credits: 0, file_storage_bytes: 0, file_storage_limit_bytes: 209715200, file_storage_overage_credits: 0 };
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 60_000,
  });
}
