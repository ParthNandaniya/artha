"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Zap } from "lucide-react";
import { useAutomations, useCreateAutomation, useToggleAutomation, useDeleteAutomation } from "@/hooks/use-automations";
import type { Project } from "@/lib/types";

interface AutomationsPanelProps {
  project: Project;
}

const TRIGGER_TYPES = [
  { value: "lead_score_above", label: "Lead score above threshold", configField: "threshold", configLabel: "Min score", configType: "number" },
  { value: "weekly_schedule", label: "Weekly schedule", configField: "day", configLabel: "Day of week", configType: "select", options: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] },
  { value: "new_lead", label: "New lead added", configField: null, configLabel: null, configType: null },
  { value: "contact_form_filled", label: "Contact form submitted", configField: null, configLabel: null, configType: null },
] as const;

const ACTION_TYPES = [
  { value: "send_email", label: "Send intro email" },
  { value: "run_research", label: "Run research" },
  { value: "generate_tasks", label: "Generate tasks" },
  { value: "find_leads", label: "Find more leads" },
] as const;

export function AutomationsPanel({ project }: AutomationsPanelProps) {
  const { data: rules = [], isLoading } = useAutomations(project.id);
  const { mutateAsync: createRule } = useCreateAutomation(project.id);
  const { mutateAsync: toggleRule } = useToggleAutomation(project.id);
  const { mutateAsync: deleteRule } = useDeleteAutomation(project.id);

  const [showCreate, setShowCreate] = useState(false);
  const [triggerType, setTriggerType] = useState("");
  const [actionType, setActionType] = useState("");
  const [configValue, setConfigValue] = useState("");

  function resetForm() {
    setTriggerType("");
    setActionType("");
    setConfigValue("");
    setShowCreate(false);
  }

  async function handleCreate() {
    if (!triggerType || !actionType) return;
    const trigger = TRIGGER_TYPES.find((t) => t.value === triggerType);
    const config: Record<string, unknown> = {};
    if (trigger?.configField && configValue) {
      config[trigger.configField] = trigger.configType === "number" ? Number(configValue) : configValue;
    }
    await createRule({ triggerType, triggerConfig: config, actionType });
    resetForm();
  }

  function getTriggerLabel(type: string) {
    return TRIGGER_TYPES.find((t) => t.value === type)?.label || type;
  }

  function getActionLabel(type: string) {
    return ACTION_TYPES.find((a) => a.value === type)?.label || type;
  }

  function formatConfig(config: Record<string, unknown>) {
    const parts = Object.entries(config)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${k}: ${v}`);
    return parts.length > 0 ? parts.join(", ") : null;
  }

  const selectedTrigger = TRIGGER_TYPES.find((t) => t.value === triggerType);

  return (
    <div className="p-4 sm:p-6 max-w-4xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Automations</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Set up if/then rules that trigger AI agents automatically
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Rule
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
      ) : rules.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center rounded-full bg-primary/10 p-3 mb-4">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <p className="text-sm font-medium mb-1">No automations yet</p>
          <p className="text-xs text-muted-foreground mb-5 max-w-xs mx-auto">
            Create rules like &quot;When a lead scores above 80, send an intro email&quot; to automate your workflow.
          </p>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create First Rule
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <Zap className={`h-4 w-4 shrink-0 ${rule.enabled ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      When{" "}
                      <span className="text-primary">{getTriggerLabel(rule.trigger_type)}</span>
                      {formatConfig(rule.trigger_config) && (
                        <span className="text-muted-foreground"> ({formatConfig(rule.trigger_config)})</span>
                      )}
                      {" → "}
                      <span className="text-primary">{getActionLabel(rule.action_type)}</span>
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={rule.enabled ? "default" : "secondary"} className="text-[10px]">
                        {rule.enabled ? "Active" : "Paused"}
                      </Badge>
                      {rule.last_triggered_at && (
                        <span className="text-[10px] text-muted-foreground">
                          Last run: {new Date(rule.last_triggered_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => toggleRule({ ruleId: rule.id, enabled: !rule.enabled })}
                  >
                    {rule.enabled ? "Pause" : "Enable"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteRule(rule.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Automation Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>When...</Label>
              <select
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value)}
                className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select a trigger</option>
                {TRIGGER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {selectedTrigger?.configField && (
              <div>
                <Label>{selectedTrigger.configLabel}</Label>
                {selectedTrigger.configType === "select" && selectedTrigger.options ? (
                  <select
                    value={configValue}
                    onChange={(e) => setConfigValue(e.target.value)}
                    className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm capitalize"
                  >
                    <option value="">Select...</option>
                    {selectedTrigger.options.map((opt) => (
                      <option key={opt} value={opt} className="capitalize">{opt}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type={selectedTrigger.configType === "number" ? "number" : "text"}
                    value={configValue}
                    onChange={(e) => setConfigValue(e.target.value)}
                    placeholder={selectedTrigger.configType === "number" ? "80" : ""}
                    className="mt-1.5"
                  />
                )}
              </div>
            )}

            <div>
              <Label>Then...</Label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
                className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select an action</option>
                {ACTION_TYPES.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!triggerType || !actionType}>
              Create Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
