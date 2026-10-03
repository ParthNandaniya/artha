"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface SubscriptionPaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscribe: () => void;
  loading: boolean;
  projectName: string;
  projectSlug: string;
}

export function SubscriptionPaywallModal({
  isOpen,
  onClose,
  onSubscribe,
  loading,
  projectName,
  projectSlug,
}: SubscriptionPaywallModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Your company is ready!</DialogTitle>
          <DialogDescription>
            {projectName} is built and live. Subscribe to get 35 task credits
            every month and automatic nightly runs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Pro Plan</h3>
              <div className="text-right">
                <span className="text-2xl font-bold">$49</span>
                <span className="text-muted-foreground">/mo</span>
              </div>
            </div>

            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>
                  <strong>35 task credits</strong>
                </span>
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>
                  <strong>Automatic nightly runs</strong> — 1 task runs every
                  night
                </span>
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>
                  Landing page at{" "}
                  <span className="font-mono">{projectSlug}.tryartha.com</span>
                </span>
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>
                  Custom email:{" "}
                  <span className="font-mono">{projectSlug}@tryartha.com</span>
                </span>
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>AI chat assistant</span>
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Revenue tracking + withdrawals</span>
              </li>
            </ul>
          </div>

          <Button
            onClick={onSubscribe}
            disabled={loading}
            className="w-full h-12 text-base animate-[border-glow_1.5s_ease-in-out_3_0.5s]"
            size="lg"
          >
            {loading ? "Redirecting to checkout..." : "Subscribe"}
          </Button>

          <button
            onClick={onClose}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Maybe later — I&apos;ll explore first
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
