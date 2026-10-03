"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AiGenerateButton } from "@/components/ai-enhancer";
import { InlineActionButton } from "@/components/inline-action-button";
import { Search, Loader2, Sparkles, ChevronDown } from "lucide-react";
import type { Lead, LeadStatus, Project } from "@/lib/types";

interface LeadsPanelProps {
  project: Project;
  leads: Lead[];
  onUpdateLead: (leadId: string, updates: Partial<Lead>) => void;
  onBulkUpdateLeads: (leadIds: string[], updates: Partial<Lead>) => void;
  onViewDocument: (docId: string) => void;
  onFindLeads?: (instructions?: string) => void;
  findingLeads?: boolean;
}

const STATUS_OPTIONS: { value: LeadStatus; label: string; color: string }[] = [
  { value: "new", label: "New", color: "bg-gray-500/10 text-gray-600" },
  { value: "contacted", label: "Contacted", color: "bg-blue-500/10 text-blue-600" },
  { value: "replied", label: "Replied", color: "bg-green-500/10 text-green-600" },
  { value: "qualified", label: "Qualified", color: "bg-purple-500/10 text-purple-600" },
  { value: "converted", label: "Converted", color: "bg-emerald-500/10 text-emerald-600" },
  { value: "lost", label: "Lost", color: "bg-red-500/10 text-red-600" },
];

type SortField = "name" | "company" | "score" | "status" | "created_at";
type SortDir = "asc" | "desc";

export function LeadsPanel({
  project,
  leads,
  onUpdateLead,
  onBulkUpdateLeads,
  onViewDocument,
  onFindLeads,
  findingLeads,
}: LeadsPanelProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [showFindLeads, setShowFindLeads] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [findInstructions, setFindInstructions] = useState("");
  const [sortField, setSortField] = useState<SortField>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const filtered = useMemo(() => {
    let result = leads;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.name?.toLowerCase().includes(q) ||
          l.company?.toLowerCase().includes(q) ||
          l.email?.toLowerCase().includes(q) ||
          l.role?.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((l) => l.status === statusFilter);
    }

    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = (a.name || "").localeCompare(b.name || "");
          break;
        case "company":
          cmp = (a.company || "").localeCompare(b.company || "");
          break;
        case "score":
          cmp = a.score - b.score;
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "created_at":
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [leads, search, statusFilter, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedLeads);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedLeads(next);
  }

  function toggleSelectAll() {
    if (selectedLeads.size === filtered.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(filtered.map((l) => l.id)));
    }
  }

  function handleBulkStatus(status: LeadStatus) {
    onBulkUpdateLeads(Array.from(selectedLeads), { status });
    setSelectedLeads(new Set());
  }

  function handleBulkContacted() {
    onBulkUpdateLeads(Array.from(selectedLeads), {
      contacted: true,
      contacted_at: new Date().toISOString(),
      status: "contacted",
    });
    setSelectedLeads(new Set());
  }

  function handleToggleContacted(lead: Lead) {
    const newContacted = !lead.contacted;
    onUpdateLead(lead.id, {
      contacted: newContacted,
      contacted_at: newContacted ? new Date().toISOString() : null,
      status: newContacted && lead.status === "new" ? "contacted" : lead.status,
    });
  }

  function handleSaveNote(leadId: string) {
    onUpdateLead(leadId, { notes: noteText });
    setEditingNote(null);
    setNoteText("");
  }

  function getStatusBadge(status: LeadStatus) {
    const opt = STATUS_OPTIONS.find((s) => s.value === status);
    return (
      <Badge className={`text-[10px] ${opt?.color || ""}`} variant="secondary">
        {opt?.label || status}
      </Badge>
    );
  }

  function getScoreColor(score: number) {
    if (score >= 80) return "text-emerald-600";
    if (score >= 60) return "text-green-600";
    if (score >= 40) return "text-amber-600";
    return "text-gray-500";
  }

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: leads.length };
    for (const l of leads) {
      counts[l.status] = (counts[l.status] || 0) + 1;
    }
    return counts;
  }, [leads]);

  return (
    <div className="p-4 sm:p-6 max-w-6xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Leads</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {leads.length} contacts found through research
          </p>
        </div>
        {onFindLeads && (
          <Button
            variant={showFindLeads ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowFindLeads(!showFindLeads)}
            disabled={findingLeads}
          >
            {findingLeads ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5 mr-1.5" />
            )}
            {findingLeads ? "Finding..." : "Find Leads"}
          </Button>
        )}
      </div>

      {showFindLeads && onFindLeads && (
        <Card className="border-primary/20 bg-primary/[0.02]">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2 mt-0.5 shrink-0">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">AI will research and find leads for you</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Based on {project.name}&apos;s profile, market, and ideal customer — no input needed.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                onClick={() => setShowCustomize((v) => !v)}
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${showCustomize ? "rotate-180" : ""}`} />
                Customize search
              </button>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setShowFindLeads(false); setShowCustomize(false); }}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={findingLeads}
                  onClick={() => {
                    onFindLeads(findInstructions || undefined);
                    setFindInstructions("");
                    setShowFindLeads(false);
                    setShowCustomize(false);
                  }}
                >
                  {findingLeads ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {findingLeads ? "Searching..." : "Find Leads"}
                </Button>
              </div>
            </div>
            {showCustomize && (
              <Textarea
                placeholder="Add any specific criteria..."
                value={findInstructions}
                onChange={(e) => setFindInstructions(e.target.value)}
                className="min-h-[60px] text-sm"
                autoFocus
              />
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Input
          placeholder="Search leads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64"
        />
        <div className="flex gap-1 flex-wrap overflow-x-auto">
          {(["all", ...STATUS_OPTIONS.map((s) => s.value)] as const).map(
            (status) => (
              <Button
                key={status}
                variant={statusFilter === status ? "default" : "ghost"}
                size="sm"
                className="text-xs h-7"
                onClick={() => setStatusFilter(status as LeadStatus | "all")}
              >
                {status === "all"
                  ? "All"
                  : STATUS_OPTIONS.find((s) => s.value === status)?.label}
                {statusCounts[status] ? (
                  <Badge variant="secondary" className="ml-1 text-[10px]">
                    {statusCounts[status]}
                  </Badge>
                ) : null}
              </Button>
            )
          )}
        </div>
      </div>

      {selectedLeads.size > 0 && (
        <Card className="border-primary/30">
          <CardContent className="p-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium">
              {selectedLeads.size} selected
            </span>
            <Separator orientation="vertical" className="h-5" />
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={handleBulkContacted}
            >
              Mark Contacted
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs">
                  Change Status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {STATUS_OPTIONS.map((s) => (
                  <DropdownMenuItem
                    key={s.value}
                    onClick={() => handleBulkStatus(s.value)}
                  >
                    {s.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setSelectedLeads(new Set())}
            >
              Clear
            </Button>
          </CardContent>
        </Card>
      )}

      {leads.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center rounded-full bg-primary/10 p-3 mb-4">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <p className="text-sm font-medium mb-1">
            Let AI find leads for you
          </p>
          <p className="text-xs text-muted-foreground mb-5 max-w-xs mx-auto">
            Based on <span className="font-medium text-foreground">{project.name}</span>&apos;s profile and target market, AI will research and discover potential contacts.
          </p>
          {onFindLeads && (
            <Button
              size="sm"
              onClick={() => {
                onFindLeads();
              }}
              disabled={findingLeads}
            >
              {findingLeads ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5 mr-1.5" />
              )}
              {findingLeads ? "Finding leads..." : "Find Leads"}
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left w-8">
                    <input
                      type="checkbox"
                      checked={
                        selectedLeads.size === filtered.length &&
                        filtered.length > 0
                      }
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th
                    className="p-3 text-left cursor-pointer hover:text-foreground text-muted-foreground font-medium"
                    onClick={() => toggleSort("name")}
                  >
                    Name{" "}
                    {sortField === "name" && (sortDir === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    className="p-3 text-left cursor-pointer hover:text-foreground text-muted-foreground font-medium"
                    onClick={() => toggleSort("company")}
                  >
                    Company{" "}
                    {sortField === "company" && (sortDir === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="p-3 text-left text-muted-foreground font-medium">
                    Role
                  </th>
                  <th className="p-3 text-left text-muted-foreground font-medium">
                    Contact
                  </th>
                  <th
                    className="p-3 text-left cursor-pointer hover:text-foreground text-muted-foreground font-medium"
                    onClick={() => toggleSort("score")}
                  >
                    Score{" "}
                    {sortField === "score" && (sortDir === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    className="p-3 text-left cursor-pointer hover:text-foreground text-muted-foreground font-medium"
                    onClick={() => toggleSort("status")}
                  >
                    Status{" "}
                    {sortField === "status" && (sortDir === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="p-3 text-center text-muted-foreground font-medium">
                    Contacted
                  </th>
                  <th className="p-3 text-left text-muted-foreground font-medium">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-b hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selectedLeads.has(lead.id)}
                        onChange={() => toggleSelect(lead.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="p-3">
                      <button
                        className="text-sm font-medium hover:text-primary hover:underline text-left"
                        onClick={() => setDetailLead(lead)}
                      >
                        {lead.name || "—"}
                      </button>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {lead.company || "—"}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {lead.role || "—"}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1.5">
                        {lead.email && (
                          <a
                            href={`mailto:${lead.email}`}
                            className="text-xs text-primary hover:underline"
                            title={lead.email}
                          >
                            ✉️
                          </a>
                        )}
                        {lead.linkedin_url && (
                          <a
                            href={lead.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                            title="LinkedIn"
                          >
                            💼
                          </a>
                        )}
                        {lead.phone && (
                          <span className="text-xs text-muted-foreground" title={lead.phone}>
                            📞
                          </span>
                        )}
                        {lead.website && (
                          <a
                            href={lead.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                            title={lead.website}
                          >
                            🌐
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <span
                        className={`text-sm font-mono font-medium ${getScoreColor(lead.score)}`}
                      >
                        {lead.score}
                      </span>
                    </td>
                    <td className="p-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="cursor-pointer">
                            {getStatusBadge(lead.status)}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {STATUS_OPTIONS.map((s) => (
                            <DropdownMenuItem
                              key={s.value}
                              onClick={() =>
                                onUpdateLead(lead.id, { status: s.value })
                              }
                            >
                              {s.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={lead.contacted}
                        onChange={() => handleToggleContacted(lead)}
                        className="rounded"
                      />
                    </td>
                    <td className="p-3">
                      {editingNote === lead.id ? (
                        <div className="flex gap-1">
                          <Input
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            className="h-7 text-xs"
                            placeholder="Add note..."
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveNote(lead.id);
                              if (e.key === "Escape") setEditingNote(null);
                            }}
                            autoFocus
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={() => handleSaveNote(lead.id)}
                          >
                            ✓
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground text-left max-w-[150px] truncate block"
                          onClick={() => {
                            setEditingNote(lead.id);
                            setNoteText(lead.notes || "");
                          }}
                          title={lead.notes || "Click to add note"}
                        >
                          {lead.notes || "Add note..."}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog
        open={detailLead !== null}
        onOpenChange={(open) => !open && setDetailLead(null)}
      >
        {detailLead && (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{detailLead.name || "Lead Details"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Company</Label>
                  <p className="text-sm">{detailLead.company || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Role</Label>
                  <p className="text-sm">{detailLead.role || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <p className="text-sm">
                    {detailLead.email ? (
                      <a
                        href={`mailto:${detailLead.email}`}
                        className="text-primary hover:underline"
                      >
                        {detailLead.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  <p className="text-sm">{detailLead.phone || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">LinkedIn</Label>
                  <p className="text-sm">
                    {detailLead.linkedin_url ? (
                      <a
                        href={detailLead.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        View Profile
                      </a>
                    ) : (
                      "—"
                    )}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Website</Label>
                  <p className="text-sm">
                    {detailLead.website ? (
                      <a
                        href={detailLead.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {detailLead.website}
                      </a>
                    ) : (
                      "—"
                    )}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Score</Label>
                  <p className={`text-sm font-medium ${getScoreColor(detailLead.score)}`}>
                    {detailLead.score}/100
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <div className="mt-0.5">{getStatusBadge(detailLead.status)}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Source</Label>
                  <p className="text-sm">{detailLead.source || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Added</Label>
                  <p className="text-sm">
                    {new Date(detailLead.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {detailLead.tags.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Tags</Label>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {detailLead.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[10px]">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">AI Enrich</Label>
                  <InlineActionButton
                    projectId={project.id}
                    action="enrich_lead"
                    context={{
                      leadName: detailLead.name || "",
                      leadCompany: detailLead.company || "",
                      leadRole: detailLead.role || "",
                      leadEmail: detailLead.email || "",
                    }}
                    onResult={(values) => {
                      const updates: Partial<Lead> = {};
                      if (values.role && typeof values.role === "string" && !detailLead.role) {
                        updates.role = values.role;
                      }
                      if (values.linkedin_url && typeof values.linkedin_url === "string" && !detailLead.linkedin_url) {
                        updates.linkedin_url = values.linkedin_url;
                      }
                      if (values.notes && typeof values.notes === "string") {
                        updates.notes = detailLead.notes
                          ? `${detailLead.notes}\n\n${values.notes}`
                          : String(values.notes);
                      }
                      if (Object.keys(updates).length > 0) {
                        setDetailLead({ ...detailLead, ...updates });
                      }
                    }}
                    label="Enrich Lead"
                    loadingLabel="Enriching..."
                    size="sm"
                    variant="outline"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  AI will research this lead and fill in missing role, LinkedIn, and talking points.
                </p>
              </div>

              <Separator />

              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Notes</Label>
                  <AiGenerateButton
                    projectId={project.id}
                    formType="lead_note"
                    currentValues={{ notes: detailLead.notes || "" }}
                    context={{
                      leadName: detailLead.name || "",
                      leadCompany: detailLead.company || "",
                      leadRole: detailLead.role || "",
                      leadEmail: detailLead.email || "",
                      leadScore: String(detailLead.score),
                      leadStatus: detailLead.status,
                      leadTags: detailLead.tags.join(", "),
                    }}
                    onResult={(values) => {
                      if (values.notes) {
                        setDetailLead({ ...detailLead, notes: values.notes });
                      }
                    }}
                    className=""
                  />
                </div>
                <Textarea
                  value={detailLead.notes || ""}
                  onChange={(e) =>
                    setDetailLead({ ...detailLead, notes: e.target.value })
                  }
                  placeholder="Add notes about this lead..."
                  className="mt-1.5 min-h-[80px]"
                />
              </div>

              {detailLead.metadata &&
                Object.keys(detailLead.metadata).length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Additional Details
                      </Label>
                      <div className="mt-1.5 space-y-1">
                        {Object.entries(detailLead.metadata).map(
                          ([key, value]) => (
                            <div key={key} className="flex gap-2">
                              <span className="text-xs text-muted-foreground min-w-[100px]">
                                {key.replace(/_/g, " ")}:
                              </span>
                              <span className="text-xs">{String(value)}</span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </>
                )}
            </div>
            <DialogFooter>
              {detailLead.source_research_id && (
                <Button
                  variant="outline"
                  onClick={() => {
                    onViewDocument(detailLead.source_research_id!);
                    setDetailLead(null);
                  }}
                >
                  View Source Research
                </Button>
              )}
              <Button
                onClick={() => {
                  onUpdateLead(detailLead.id, { notes: detailLead.notes });
                  setDetailLead(null);
                }}
              >
                Save & Close
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
