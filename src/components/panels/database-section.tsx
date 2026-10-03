"use client";

import { useState } from "react";
import { ArthaLoader } from "@/components/icons/artha-loader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  useWebsiteTables,
  useTableData,
  useInsertRow,
  useUpdateRow,
  useDeleteRow,
  useDropTable,
} from "@/hooks/use-database";

interface DatabaseSectionProps {
  projectId: string;
  subscribed: boolean;
}

function formatTableName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function categoryLabel(cat: string): string {
  switch (cat) {
    case "free": return "Free";
    case "system": return "Pro";
    case "custom": return "Custom";
    default: return cat;
  }
}

function categoryVariant(cat: string): "secondary" | "default" | "destructive" {
  switch (cat) {
    case "free": return "secondary";
    case "system": return "default";
    case "custom": return "default";
    default: return "secondary";
  }
}

export function DatabaseSection({ projectId, subscribed }: DatabaseSectionProps) {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [deleteRowId, setDeleteRowId] = useState<string | null>(null);
  const [dropTableName, setDropTableName] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; column: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newRowData, setNewRowData] = useState<Record<string, string>>({});

  const { data: tablesData, isLoading: tablesLoading } = useWebsiteTables(projectId);
  const { data: tableData, isLoading: dataLoading } = useTableData(projectId, selectedTable ?? undefined, {
    page,
    pageSize: 50,
    sortBy,
    sortDir,
    search: search || undefined,
  });

  const insertRow = useInsertRow(projectId, selectedTable ?? "");
  const updateRow = useUpdateRow(projectId, selectedTable ?? "");
  const deleteRow = useDeleteRow(projectId, selectedTable ?? "");
  const dropTable = useDropTable(projectId);

  const tables = tablesData?.tables ?? [];
  const hasWebsiteDb = tablesData?.hasWebsiteDb ?? false;

  // Group tables by category
  const freeTables = tables.filter((t) => t.category === "free");
  const systemTables = tables.filter((t) => t.category === "system");
  const customTables = tables.filter((t) => t.category === "custom");

  const selectedTableInfo = tables.find((t) => t.name === selectedTable);
  const totalPages = tableData ? Math.ceil(tableData.total / tableData.pageSize) : 0;
  const editableColumns = tableData?.columns.filter(
    (c) => c.name !== "id" && c.name !== "created_at" && c.name !== "updated_at"
  ) ?? [];

  function handleSort(column: string) {
    if (sortBy === column) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortDir("asc");
    }
    setPage(1);
  }

  function handleSelectTable(name: string) {
    setSelectedTable(name);
    setPage(1);
    setSortBy("created_at");
    setSortDir("desc");
    setSearch("");
    setEditingCell(null);
  }

  async function handleSaveEdit(rowId: string, column: string, value: string) {
    try {
      await updateRow.mutateAsync({ rowId, data: { [column]: value || null } });
    } catch {
      // error shown via mutation state
    }
    setEditingCell(null);
  }

  async function handleAddRow() {
    if (!selectedTable) return;
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(newRowData)) {
      data[k] = v || null;
    }
    try {
      await insertRow.mutateAsync(data);
      setAddRowOpen(false);
      setNewRowData({});
    } catch {
      // error shown via mutation state
    }
  }

  async function handleDeleteRow() {
    if (!deleteRowId) return;
    try {
      await deleteRow.mutateAsync(deleteRowId);
      setDeleteRowId(null);
    } catch {
      // error shown via mutation state
    }
  }

  async function handleDropTable() {
    if (!dropTableName) return;
    try {
      await dropTable.mutateAsync(dropTableName);
      setDropTableName(null);
      if (selectedTable === dropTableName) setSelectedTable(null);
    } catch {
      // error shown via mutation state
    }
  }

  if (tablesLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <ArthaLoader size={32} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading tables...</p>
      </div>
    );
  }

  // Not subscribed — show free tables + upgrade prompt
  if (!subscribed && !hasWebsiteDb) {
    return (
      <div className="flex-1 flex flex-col gap-4">
        {freeTables.length > 0 ? (
          <div className="flex gap-4 flex-1 min-h-0">
            <TableList
              freeTables={freeTables}
              systemTables={[]}
              customTables={[]}
              selectedTable={selectedTable}
              onSelectTable={handleSelectTable}
              onDropTable={setDropTableName}
            />
            {selectedTable ? (
              <TableDataView
                tableData={tableData}
                dataLoading={dataLoading}
                selectedTableInfo={selectedTableInfo}
                editableColumns={editableColumns}
                page={page}
                totalPages={totalPages}
                sortBy={sortBy}
                sortDir={sortDir}
                search={search}
                editingCell={editingCell}
                editValue={editValue}
                onSort={handleSort}
                onSearch={setSearch}
                onSetPage={setPage}
                onStartEdit={(rowId, column, value) => {
                  setEditingCell({ rowId, column });
                  setEditValue(String(value ?? ""));
                }}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={() => setEditingCell(null)}
                onEditValueChange={setEditValue}
                onDeleteRow={setDeleteRowId}
                onAddRow={() => setAddRowOpen(true)}
                updatePending={updateRow.isPending}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center border rounded-lg bg-muted/20">
                <p className="text-sm text-muted-foreground">Select a table to view its data</p>
              </div>
            )}
          </div>
        ) : null}
        <div className="rounded-lg border border-dashed px-6 py-8 text-center space-y-2">
          <p className="text-sm font-medium">Unlock your website database</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Subscribe to enable user accounts, payments, and custom business tables for your website.
            Contacts and form submissions are always free.
          </p>
        </div>
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center border rounded-lg bg-muted/20">
        <div className="text-center space-y-2 max-w-sm">
          <p className="text-sm font-medium">No tables yet</p>
          <p className="text-xs text-muted-foreground">
            Ask AI to create tables for your business, like &quot;Create subscription plans with a credit system&quot;
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0">
      <div className="flex gap-4 flex-1 min-h-0">
        <TableList
          freeTables={freeTables}
          systemTables={systemTables}
          customTables={customTables}
          selectedTable={selectedTable}
          onSelectTable={handleSelectTable}
          onDropTable={setDropTableName}
        />

        {selectedTable ? (
          <TableDataView
            tableData={tableData}
            dataLoading={dataLoading}
            selectedTableInfo={selectedTableInfo}
            editableColumns={editableColumns}
            page={page}
            totalPages={totalPages}
            sortBy={sortBy}
            sortDir={sortDir}
            search={search}
            editingCell={editingCell}
            editValue={editValue}
            onSort={handleSort}
            onSearch={setSearch}
            onSetPage={setPage}
            onStartEdit={(rowId, column, value) => {
              setEditingCell({ rowId, column });
              setEditValue(String(value ?? ""));
            }}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={() => setEditingCell(null)}
            onEditValueChange={setEditValue}
            onDeleteRow={setDeleteRowId}
            onAddRow={() => setAddRowOpen(true)}
            updatePending={updateRow.isPending}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center border rounded-lg bg-muted/20">
            <p className="text-sm text-muted-foreground">Select a table to view its data</p>
          </div>
        )}
      </div>

      {/* Add Row Dialog */}
      <Dialog open={addRowOpen} onOpenChange={setAddRowOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Row to {selectedTableInfo?.display_name ?? selectedTable}</DialogTitle>
            <DialogDescription>
              Fill in the fields below. Leave blank for null values.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {editableColumns.map((col) => (
              <div key={col.name}>
                <Label className="text-xs">
                  {col.name}
                  <span className="text-muted-foreground ml-1">({col.type})</span>
                </Label>
                <Input
                  className="mt-1"
                  value={newRowData[col.name] ?? ""}
                  onChange={(e) => setNewRowData({ ...newRowData, [col.name]: e.target.value })}
                  placeholder={col.nullable ? "null" : "required"}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddRowOpen(false)}>Cancel</Button>
            <Button onClick={handleAddRow} disabled={insertRow.isPending}>
              {insertRow.isPending ? "Adding..." : "Add Row"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Row Confirmation */}
      <Dialog open={!!deleteRowId} onOpenChange={() => setDeleteRowId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Row</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this row? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRowId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteRow} disabled={deleteRow.isPending}>
              {deleteRow.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drop Table Confirmation */}
      <Dialog open={!!dropTableName} onOpenChange={() => setDropTableName(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Drop Table</DialogTitle>
            <DialogDescription>
              Are you sure you want to drop &quot;{dropTableName}&quot;? All data in this table will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDropTableName(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDropTable} disabled={dropTable.isPending}>
              {dropTable.isPending ? "Dropping..." : "Drop Table"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Sub-components ---

function TableList({
  freeTables,
  systemTables,
  customTables,
  selectedTable,
  onSelectTable,
  onDropTable,
}: {
  freeTables: { name: string; display_name: string; row_count: number; category: string }[];
  systemTables: { name: string; display_name: string; row_count: number; category: string }[];
  customTables: { name: string; display_name: string; row_count: number; category: string }[];
  selectedTable: string | null;
  onSelectTable: (name: string) => void;
  onDropTable: (name: string) => void;
}) {
  const groups = [
    { label: "Free", tables: freeTables },
    { label: "Pro", tables: systemTables },
    { label: "Custom", tables: customTables },
  ].filter((g) => g.tables.length > 0);

  return (
    <div className="w-48 shrink-0 border rounded-lg overflow-hidden flex flex-col">
      <div className="px-3 py-2 bg-muted/40 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Tables
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="px-2 pt-2 pb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {group.label}
              </div>
              {group.tables.map((table) => (
                <button
                  key={table.name}
                  onClick={() => onSelectTable(table.name)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (table.category === "custom") onDropTable(table.name);
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between gap-1 transition-colors ${
                    selectedTable === table.name
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-muted/60 text-foreground"
                  }`}
                >
                  <span className="truncate text-xs">{table.display_name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{table.row_count}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function TableDataView({
  tableData,
  dataLoading,
  selectedTableInfo,
  editableColumns,
  page,
  totalPages,
  sortBy,
  sortDir,
  search,
  editingCell,
  editValue,
  onSort,
  onSearch,
  onSetPage,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditValueChange,
  onDeleteRow,
  onAddRow,
  updatePending,
}: {
  tableData: { rows: Record<string, unknown>[]; total: number; columns: { name: string; type: string; nullable: boolean; default_value: string | null }[]; page: number; pageSize: number } | undefined;
  dataLoading: boolean;
  selectedTableInfo: { name: string; display_name: string; description: string | null; category: string } | undefined;
  editableColumns: { name: string; type: string; nullable: boolean; default_value: string | null }[];
  page: number;
  totalPages: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  search: string;
  editingCell: { rowId: string; column: string } | null;
  editValue: string;
  onSort: (column: string) => void;
  onSearch: (v: string) => void;
  onSetPage: (p: number) => void;
  onStartEdit: (rowId: string, column: string, value: unknown) => void;
  onSaveEdit: (rowId: string, column: string, value: string) => Promise<void>;
  onCancelEdit: () => void;
  onEditValueChange: (v: string) => void;
  onDeleteRow: (rowId: string) => void;
  onAddRow: () => void;
  updatePending: boolean;
}) {
  const columns = tableData?.columns ?? [];
  const displayColumns = columns.filter((c) => c.name !== "updated_at");

  return (
    <div className="flex-1 border rounded-lg flex flex-col overflow-hidden min-w-0">
      {/* Header */}
      <div className="px-3 py-2 bg-muted/40 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h4 className="text-sm font-medium truncate">
            {selectedTableInfo?.display_name ?? selectedTableInfo?.name}
          </h4>
          {selectedTableInfo && (
            <Badge variant={categoryVariant(selectedTableInfo.category)} className="text-[10px] px-1.5 py-0">
              {categoryLabel(selectedTableInfo.category)}
            </Badge>
          )}
          {tableData && (
            <span className="text-[11px] text-muted-foreground">{tableData.total} rows</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="h-7 w-40 text-xs"
          />
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onAddRow}>
            + Add Row
          </Button>
        </div>
      </div>

      {/* Table */}
      {dataLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <ArthaLoader size={32} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      ) : tableData && tableData.rows.length > 0 ? (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background border-b">
              <tr>
                {displayColumns.map((col) => (
                  <th
                    key={col.name}
                    onClick={() => onSort(col.name)}
                    className="px-3 py-2 text-left font-medium text-muted-foreground cursor-pointer hover:text-foreground whitespace-nowrap"
                  >
                    {col.name}
                    {sortBy === col.name && (
                      <span className="ml-1">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>
                    )}
                  </th>
                ))}
                <th className="px-3 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {tableData.rows.map((row) => {
                const rowId = String(row.id ?? "");
                return (
                  <tr key={rowId} className="hover:bg-muted/30">
                    {displayColumns.map((col) => {
                      const isEditing = editingCell?.rowId === rowId && editingCell.column === col.name;
                      const isEditable = col.name !== "id" && col.name !== "created_at";
                      const cellValue = row[col.name];
                      const displayValue = cellValue === null ? "null" : String(cellValue);

                      if (isEditing) {
                        return (
                          <td key={col.name} className="px-2 py-1">
                            <Input
                              autoFocus
                              className="h-6 text-xs"
                              value={editValue}
                              onChange={(e) => onEditValueChange(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void onSaveEdit(rowId, col.name, editValue);
                                if (e.key === "Escape") onCancelEdit();
                              }}
                              onBlur={() => void onSaveEdit(rowId, col.name, editValue)}
                              disabled={updatePending}
                            />
                          </td>
                        );
                      }

                      return (
                        <td
                          key={col.name}
                          className={`px-3 py-2 max-w-[200px] truncate ${
                            isEditable ? "cursor-pointer hover:bg-muted/50" : ""
                          } ${cellValue === null ? "text-muted-foreground italic" : ""}`}
                          onDoubleClick={() => {
                            if (isEditable) onStartEdit(rowId, col.name, cellValue);
                          }}
                          title={displayValue}
                        >
                          {displayValue}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1">
                      <button
                        onClick={() => onDeleteRow(rowId)}
                        className="text-muted-foreground hover:text-destructive text-xs"
                        title="Delete row"
                      >
                        x
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            {search ? "No matching rows" : "No rows yet"}
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-3 py-2 border-t bg-muted/20 flex items-center justify-between text-xs shrink-0">
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs px-2"
              disabled={page <= 1}
              onClick={() => onSetPage(page - 1)}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs px-2"
              disabled={page >= totalPages}
              onClick={() => onSetPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
