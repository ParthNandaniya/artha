"use client";

import { useQuery } from "@tanstack/react-query";
import type { AnalyticsData } from "@/lib/types";

export function useAnalytics(projectId: string, days: number = 30) {
  return useQuery<AnalyticsData | null>({
    queryKey: ["analytics", projectId, days],
    queryFn: async () => {
      const res = await fetch(
        `/api/projects/analytics?projectId=${projectId}&days=${days}`
      );
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}
