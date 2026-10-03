"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface CelebrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  projectSlug: string;
  suggestedTasks: Array<{ id: string; title: string; description: string | null }>;
  onRunTask: (taskId: string) => void;
  buildDurationSeconds?: number;
}

const CONFETTI_COLORS = [
  "#f59e0b", "#8b5cf6", "#06b6d4", "#f43f5e", "#22c55e",
  "#3b82f6", "#ec4899", "#14b8a6", "#eab308", "#a855f7",
];

function ConfettiPiece({ index }: { index: number }) {
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const left = Math.random() * 100;
  const delay = Math.random() * 1.5;
  const duration = 2 + Math.random() * 2;
  const size = 6 + Math.random() * 6;
  const shape = index % 3 === 0 ? "50%" : index % 3 === 1 ? "0" : "2px";

  return (
    <div
      className="absolute top-0 pointer-events-none"
      style={{
        left: `${left}%`,
        width: size,
        height: size,
        borderRadius: shape,
        backgroundColor: color,
        animation: `confetti-fall ${duration}s ease-out ${delay}s forwards`,
        opacity: 0,
      }}
    />
  );
}

export function CelebrationModal({
  isOpen,
  onClose,
  projectName,
  projectSlug,
  suggestedTasks,
  onRunTask,
  buildDurationSeconds,
}: CelebrationModalProps) {
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShowConfetti(true);
      // Inject confetti keyframe if not already present
      if (!document.getElementById("confetti-style")) {
        const style = document.createElement("style");
        style.id = "confetti-style";
        style.textContent = `
          @keyframes confetti-fall {
            0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
            100% { transform: translateY(500px) rotate(720deg); opacity: 0; }
          }
        `;
        document.head.appendChild(style);
      }
      const timer = setTimeout(() => setShowConfetti(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const [copied, setCopied] = useState(false);

  const shareText = buildDurationSeconds
    ? `Just built ${projectName} in ${Math.round(buildDurationSeconds)} seconds with @tryarthaHQ`
    : `Just built ${projectName} with @tryarthaHQ`;
  const shareUrl = `https://artha.run/built/${projectSlug}`;
  const twitterIntent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
  const linkedInIntent = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md overflow-hidden">
        {showConfetti && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-50">
            {Array.from({ length: 30 }).map((_, i) => (
              <ConfettiPiece key={i} index={i} />
            ))}
          </div>
        )}

        <DialogHeader className="text-center">
          <DialogTitle className="text-2xl">
            {projectName} is live!
          </DialogTitle>
          <DialogDescription className="text-base">
            Your company is built and your website is online.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex items-center justify-center gap-3 py-3 px-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600 text-white text-sm px-3 py-1 animate-[reveal-scale_400ms_ease-out_200ms_both]">
                5 free credits
              </Badge>
              <span className="text-sm text-emerald-700 dark:text-emerald-300">
                to get you started
              </span>
            </div>
          </div>

          {suggestedTasks.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Try running a task:
              </p>
              {suggestedTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => {
                    onRunTask(task.id);
                    onClose();
                  }}
                  className="w-full text-left p-3 rounded-lg border hover:border-primary/50 hover:bg-accent/50 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium group-hover:text-primary transition-colors">
                      {task.title}
                    </span>
                    <span className="text-xs text-muted-foreground">1 credit</span>
                  </div>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {task.description}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center">
              Share your launch
            </p>
            <div className="flex items-center gap-2">
              <a
                href={twitterIntent}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1"
              >
                <Button size="sm" className="w-full text-xs bg-foreground text-background hover:bg-foreground/90">
                  Share on X
                </Button>
              </a>
              <a
                href={linkedInIntent}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1"
              >
                <Button variant="outline" size="sm" className="w-full text-xs">
                  LinkedIn
                </Button>
              </a>
              <Button
                variant="outline"
                size="sm"
                className="text-xs px-3"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Explore on my own
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
