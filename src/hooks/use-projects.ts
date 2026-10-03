"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project } from "@/lib/types";

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
    staleTime: 30_000,
    gcTime: 1000 * 60 * 10, // 10 minutes
  });
}

export function useProjectBySlug(slug: string | null) {
  const { data: projects, isLoading: isProjectsLoading } = useProjects();
  
  const project = projects?.find((p) => p.slug === slug) ?? null;

  return {
    project,
    isLoading: isProjectsLoading,
  };
}
