"use client";

import { useState } from "react";
import { useSubscription } from "@/contexts/subscription-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sparkles, Play } from "lucide-react";
import { ArthaLoader } from "@/components/icons/artha-loader";

type RecurrenceInterval = "daily" | "weekly" | "biweekly" | "monthly";

interface TaskPayload {
  title: string;
  description: string;
  isRecurring: boolean;
  recurrenceInterval?: RecurrenceInterval;
}

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  onCreateTask: (task: TaskPayload) => Promise<void>;
  onCreateAndRun: (task: TaskPayload) => Promise<void>;
  onGenerateWithAI: () => Promise<{
    title: string;
    description: string;
    isRecurring: boolean;
  }>;
  hasCredits: boolean;
}

export function CreateTaskModal({
  isOpen,
  onClose,
  projectId,
  onCreateTask,
  onCreateAndRun,
  onGenerateWithAI,
  hasCredits,
}: CreateTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState<RecurrenceInterval>("weekly");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const subscription = useSubscription();

  function resetForm() {
    setTitle("");
    setDescription("");
    setIsRecurring(false);
    setRecurrenceInterval("weekly");
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onCreateTask({ title: title.trim(), description: description.trim(), isRecurring, recurrenceInterval: isRecurring ? recurrenceInterval : undefined });
      resetForm();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndRun() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onCreateAndRun({ title: title.trim(), description: description.trim(), isRecurring, recurrenceInterval: isRecurring ? recurrenceInterval : undefined });
      resetForm();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate() {
    if (!subscription.requireCredits()) return;
    setGenerating(true);
    try {
      const suggestion = await onGenerateWithAI();
      setTitle(suggestion.title);
      setDescription(suggestion.description);
      setIsRecurring(suggestion.isRecurring);
    } catch (err: any) {
      if (err?.status === 402) {
        subscription.openCreditModal();
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          resetForm();
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a task</DialogTitle>
          <DialogDescription>
            Add a task to your queue. It will run automatically tonight or you
            can run it immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="task-title">Title</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                disabled={generating || saving}
                className="gap-1.5"
              >
                {generating ? (
                  <ArthaLoader size={14} className="text-current" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {generating ? "Generating..." : "Generate with AI"}
              </Button>
            </div>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g., "Research 10 competitors in the AI tools space"'
              disabled={saving || generating}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-description">Brief</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What should be done? Be specific — the AI agent will use this as its execution instructions."
              className="min-h-[100px] resize-none"
              disabled={saving || generating}
            />
          </div>

          <div className="rounded-lg border bg-background px-3 py-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label htmlFor="recurring-toggle" className="text-sm">
                  Recurring
                </Label>
                <p className="text-xs text-muted-foreground">
                  Automatically re-run this task on a schedule.
                </p>
              </div>
              <Switch
                id="recurring-toggle"
                checked={isRecurring}
                onCheckedChange={setIsRecurring}
                disabled={saving || generating}
              />
            </div>
            {isRecurring && (
              <div className="space-y-1.5">
                <Label htmlFor="recurrence-interval" className="text-xs text-muted-foreground">
                  Repeat every
                </Label>
                <select
                  id="recurrence-interval"
                  value={recurrenceInterval}
                  onChange={(e) => setRecurrenceInterval(e.target.value as RecurrenceInterval)}
                  disabled={saving || generating}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="daily">Day</option>
                  <option value="weekly">Week</option>
                  <option value="biweekly">2 Weeks</option>
                  <option value="monthly">Month</option>
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={!title.trim() || saving}
          >
            {saving ? (
              <ArthaLoader size={14} className="mr-1.5 text-current" />
            ) : null}
            Save to Queue
          </Button>
          <Button
            onClick={handleSaveAndRun}
            disabled={!title.trim() || saving || !hasCredits}
            title={!hasCredits ? "No credits available to run tasks" : ""}
          >
            <Play className="mr-1.5 h-3.5 w-3.5" />
            Save & Run
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
