"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Project, Document, Task, Lead, ResearchTagRecord, ProjectWebsite } from "@/lib/types";

export function useProject(slug: string) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["project-data", slug],
    queryFn: async () => {
      if (!slug) return null;

      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      const projects = await res.json();
      const proj = projects.find((p: Project) => p.slug === slug);

      if (!proj) return null;

      const [docsRes, tasksRes, leadsRes, tagsRes, websiteRes] = await Promise.all([
        fetch(`/api/documents?projectId=${proj.id}`),
        fetch(`/api/tasks?projectId=${proj.id}`),
        fetch(`/api/leads?projectId=${proj.id}`),
        fetch(`/api/research/tags?projectId=${proj.id}`),
        fetch(`/api/projects/website?projectId=${proj.id}`),
      ]);

      return {
        project: proj as Project,
        documents: docsRes.ok ? (await docsRes.json() as Document[]) : [],
        tasks: tasksRes.ok ? (await tasksRes.json() as Task[]) : [],
        leads: leadsRes.ok ? (await leadsRes.json() as Lead[]) : [],
        researchTags: tagsRes.ok ? (await tagsRes.json() as ResearchTagRecord[]) : [],
        website: websiteRes.ok ? (await websiteRes.json() as ProjectWebsite) : null,
      };
    },
    staleTime: 30_000,
    gcTime: 1000 * 60 * 10, // 10 minutes
    enabled: !!slug,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["project-data", slug] });
  };

  return {
    project: data?.project ?? null,
    website: data?.website ?? null,
    documents: data?.documents ?? [],
    tasks: data?.tasks ?? [],
    leads: data?.leads ?? [],
    researchTags: data?.researchTags ?? [],
    loading: isLoading,
    refresh,
  };
}
