"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Search,
  BarChart3,
  FileText,
  Globe,
  Mail,
  MessageSquare,
  Sparkles,
  Target,
  Twitter,
  Users,
  Zap,
  LayoutDashboard,
  Settings,
  DollarSign,
} from "lucide-react";
import type { PanelType } from "@/lib/types";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  action: { type: "panel"; panel: PanelType } | { type: "chat"; message: string };
  category: "navigation" | "action";
}

const COMMANDS: CommandItem[] = [
  // Navigation
  { id: "nav-overview", label: "Overview", description: "Go to overview dashboard", icon: <LayoutDashboard className="h-4 w-4" />, action: { type: "panel", panel: "overview" }, category: "navigation" },
  { id: "nav-tasks", label: "Tasks", description: "View task queue", icon: <Zap className="h-4 w-4" />, action: { type: "panel", panel: "tasks" }, category: "navigation" },
  { id: "nav-leads", label: "Leads", description: "View lead database", icon: <Users className="h-4 w-4" />, action: { type: "panel", panel: "leads" }, category: "navigation" },
  { id: "nav-website", label: "Website", description: "Edit landing page", icon: <Globe className="h-4 w-4" />, action: { type: "panel", panel: "landing-page" }, category: "navigation" },
  { id: "nav-email", label: "Email", description: "View email threads", icon: <Mail className="h-4 w-4" />, action: { type: "panel", panel: "email" }, category: "navigation" },
  { id: "nav-research", label: "Research", description: "View research documents", icon: <FileText className="h-4 w-4" />, action: { type: "panel", panel: "research" }, category: "navigation" },
  { id: "nav-analytics", label: "Analytics", description: "View site analytics", icon: <BarChart3 className="h-4 w-4" />, action: { type: "panel", panel: "analytics" }, category: "navigation" },
  { id: "nav-twitter", label: "Twitter", description: "Manage tweets", icon: <Twitter className="h-4 w-4" />, action: { type: "panel", panel: "twitter" }, category: "navigation" },
  { id: "nav-revenue", label: "Revenue", description: "View revenue", icon: <DollarSign className="h-4 w-4" />, action: { type: "panel", panel: "revenue" }, category: "navigation" },
  { id: "nav-settings", label: "Settings", description: "Project settings", icon: <Settings className="h-4 w-4" />, action: { type: "panel", panel: "settings" }, category: "navigation" },
  // Quick actions
  { id: "action-find-leads", label: "Find leads", description: "AI finds potential customers", icon: <Target className="h-4 w-4" />, action: { type: "chat", message: "Find leads and potential customers" }, category: "action" },
  { id: "action-draft-email", label: "Draft email", description: "AI writes an email", icon: <Mail className="h-4 w-4" />, action: { type: "chat", message: "Draft an outreach email" }, category: "action" },
  { id: "action-research", label: "Run research", description: "AI researches your market", icon: <FileText className="h-4 w-4" />, action: { type: "chat", message: "Research our market and competitors" }, category: "action" },
  { id: "action-generate-tasks", label: "Generate tasks", description: "AI suggests next steps", icon: <Sparkles className="h-4 w-4" />, action: { type: "chat", message: "Generate high-impact tasks for this week" }, category: "action" },
  { id: "action-tweet", label: "Draft tweet", description: "AI writes a tweet", icon: <MessageSquare className="h-4 w-4" />, action: { type: "chat", message: "Draft a tweet about our product" }, category: "action" },
  { id: "action-update-website", label: "Update website", description: "AI updates your landing page", icon: <Globe className="h-4 w-4" />, action: { type: "chat", message: "Update the landing page to improve conversions" }, category: "action" },
];

interface CommandBarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSwitchPanel: (panel: PanelType) => void;
  onSendChat: (message: string) => void;
}

export function CommandBar({ open, onOpenChange, onSwitchPanel, onSendChat }: CommandBarProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = useMemo(() => {
    if (!query.trim()) return COMMANDS;
    const q = query.toLowerCase();
    return COMMANDS.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.description?.toLowerCase().includes(q)
    );
  }, [query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  const executeCommand = useCallback(
    (cmd: CommandItem) => {
      onOpenChange(false);
      if (cmd.action.type === "panel") {
        onSwitchPanel(cmd.action.panel);
      } else {
        onSendChat(cmd.action.message);
      }
    },
    [onOpenChange, onSwitchPanel, onSendChat]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          executeCommand(filtered[selectedIndex]);
        } else if (query.trim()) {
          // Free-form text → send to chat
          onOpenChange(false);
          onSendChat(query);
        }
      }
    },
    [filtered, selectedIndex, executeCommand, query, onOpenChange, onSendChat]
  );

  const navCommands = filtered.filter((c) => c.category === "navigation");
  const actionCommands = filtered.filter((c) => c.category === "action");

  let runningIndex = -1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 w-[calc(100vw-2rem)] sm:w-full max-w-lg overflow-hidden" aria-describedby={undefined}>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search commands or type a message..."
            className="border-0 shadow-none focus-visible:ring-0 h-11 text-sm"
            autoFocus
          />
          <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 text-[10px] text-muted-foreground">
            esc
          </kbd>
        </div>

        <div className="max-h-[300px] overflow-y-auto p-1">
          {navCommands.length > 0 && (
            <>
              <p className="px-2 pt-2 pb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Navigate
              </p>
              {navCommands.map((cmd) => {
                runningIndex++;
                const idx = runningIndex;
                return (
                  <button
                    key={cmd.id}
                    onClick={() => executeCommand(cmd)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full flex items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                      selectedIndex === idx ? "bg-muted" : "hover:bg-muted/50"
                    }`}
                  >
                    <span className="text-muted-foreground">{cmd.icon}</span>
                    <span className="font-medium">{cmd.label}</span>
                    {cmd.description && (
                      <span className="text-xs text-muted-foreground ml-auto truncate max-w-[200px]">
                        {cmd.description}
                      </span>
                    )}
                  </button>
                );
              })}
            </>
          )}

          {actionCommands.length > 0 && (
            <>
              <p className="px-2 pt-3 pb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Actions
              </p>
              {actionCommands.map((cmd) => {
                runningIndex++;
                const idx = runningIndex;
                return (
                  <button
                    key={cmd.id}
                    onClick={() => executeCommand(cmd)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full flex items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                      selectedIndex === idx ? "bg-muted" : "hover:bg-muted/50"
                    }`}
                  >
                    <span className="text-muted-foreground">{cmd.icon}</span>
                    <span className="font-medium">{cmd.label}</span>
                    {cmd.description && (
                      <span className="text-xs text-muted-foreground ml-auto truncate max-w-[200px]">
                        {cmd.description}
                      </span>
                    )}
                  </button>
                );
              })}
            </>
          )}

          {filtered.length === 0 && query.trim() && (
            <div className="p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Press <kbd className="rounded border px-1 text-xs">Enter</kbd> to send &quot;{query}&quot; to AI
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
