"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface NewCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (prompt: string, meta: { url?: string }) => void;
  isRunning: boolean;
}

export function NewCompanyModal({
  isOpen,
  onClose,
  onSubmit,
  isRunning,
}: NewCompanyModalProps) {
  const [prompt, setPrompt] = useState("");
  const [url, setUrl] = useState("");

  function handleSubmit() {
    if (!prompt.trim()) return;
    onSubmit(prompt.trim(), {
      url: url.trim() || undefined,
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isRunning && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Build a new company</DialogTitle>
          <DialogDescription>
            Tell us about your idea. We&apos;ll research the market, generate
            your mission, build a landing page, set up email, and queue tasks
            — all automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="idea">Your idea</Label>
            <Textarea
              id="idea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder='e.g., "An AI matchmaking platform that pairs people based on deep personality analysis — trueloveai.com"'
              className="min-h-[100px]"
              disabled={isRunning}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">Website or domain (optional)</Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="e.g., trueloveai.com"
              disabled={isRunning}
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          {/* Surprise Me — temporarily disabled, will implement later
          <Button
            variant="outline"
            onClick={() => onSubmit("__SURPRISE_ME__", {})}
            disabled={isRunning}
          >
            Surprise me
          </Button>
          */}
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={isRunning}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!prompt.trim() || isRunning}
            >
              {isRunning ? "Building..." : "Build My Company"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
