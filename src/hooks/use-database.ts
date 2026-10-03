"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TableInfo } from "@/lib/database/types";

interface TablesResponse {
  tables: TableInfo[];
  hasWebsiteDb: boolean;
  subscribed: boolean;
}

interface TableDataResponse {
  rows: Record<string, unknown>[];
  total: number;
  columns: { name: string; type: string; nullable: boolean; default_value: string | null }[];
  page: number;
  pageSize: number;
}

export function useWebsiteTables(projectId?: string) {
  return useQuery<TablesResponse>({
    queryKey: ["database-tables", projectId],
    queryFn: async () => {
      if (!projectId) return { tables: [], hasWebsiteDb: false, subscribed: false };
      const res = await fetch(`/api/database/tables?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch tables");
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useTableData(
  projectId: string | undefined,
  tableName: string | undefined,
  options: { page?: number; pageSize?: number; sortBy?: string; sortDir?: "asc" | "desc"; search?: string } = {}
) {
  const { page = 1, pageSize = 50, sortBy = "created_at", sortDir = "desc", search } = options;
  return useQuery<TableDataResponse>({
    queryKey: ["database-table-data", projectId, tableName, page, pageSize, sortBy, sortDir, search],
    queryFn: async () => {
      if (!projectId || !tableName) return { rows: [], total: 0, columns: [], page: 1, pageSize: 50 };
      const params = new URLSearchParams({
        projectId,
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        sortDir,
      });
      if (search) params.set("search", search);
      const res = await fetch(`/api/database/tables/${tableName}?${params}`);
      if (!res.ok) throw new Error("Failed to fetch table data");
      return res.json();
    },
    enabled: !!projectId && !!tableName,
    staleTime: 15_000,
  });
}

export function useInsertRow(projectId: string, tableName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch(`/api/database/tables/${tableName}/rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, data }),
      });
      if (!res.ok) throw new Error("Failed to insert row");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["database-table-data", projectId, tableName] });
      queryClient.invalidateQueries({ queryKey: ["database-tables", projectId] });
    },
  });
}

export function useUpdateRow(projectId: string, tableName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ rowId, data }: { rowId: string; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/database/tables/${tableName}/rows`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, rowId, data }),
      });
      if (!res.ok) throw new Error("Failed to update row");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["database-table-data", projectId, tableName] });
    },
  });
}

export function useDeleteRow(projectId: string, tableName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rowId: string) => {
      const res = await fetch(`/api/database/tables/${tableName}/rows`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, rowId }),
      });
      if (!res.ok) throw new Error("Failed to delete row");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["database-table-data", projectId, tableName] });
      queryClient.invalidateQueries({ queryKey: ["database-tables", projectId] });
    },
  });
}

export function useDropTable(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tableName: string) => {
      const res = await fetch(`/api/database/tables/${tableName}?projectId=${projectId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to drop table");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["database-tables", projectId] });
    },
  });
}
