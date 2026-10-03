"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface CreditPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscribe: () => void;
  onBuyPack: () => void;
  loading: boolean;
  hasSubscription: boolean;
  projectName: string;
}

export function CreditPurchaseModal({
  isOpen,
  onClose,
  onSubscribe,
  onBuyPack,
  loading,
  hasSubscription,
  projectName,
}: CreditPurchaseModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Get more credits</DialogTitle>
          <DialogDescription>
            {projectName} needs credits to run tasks and research.
            {hasSubscription
              ? " Your current credits are exhausted — buy a credit pack or wait for renewal."
              : " Choose a plan that works for you."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!hasSubscription && (
            <>
              <div
                className="border-2 border-primary rounded-lg p-4 space-y-2 cursor-pointer hover:bg-primary/5 transition-colors"
                onClick={() => !loading && onSubscribe()}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">Pro Subscription</h3>
                    <Badge className="text-[10px]">Best Value</Badge>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-bold">$49</span>
                    <span className="text-muted-foreground text-sm">/mo</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  35 credits/month (40 first month) + nightly task execution + all features
                </p>
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSubscribe();
                  }}
                  disabled={loading}
                  className="w-full mt-2"
                >
                  {loading ? "Redirecting..." : "Subscribe"}
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">or buy a one-time credit pack</span>
                <Separator className="flex-1" />
              </div>
            </>
          )}

          <div
            className="border rounded-lg p-4 space-y-2 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all"
            onClick={() => !loading && onBuyPack()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Credit Pack</h3>
                <p className="text-xs text-muted-foreground">One-time purchase — no subscription required</p>
              </div>
              <div className="text-right">
                <span className="text-xl font-bold">$25</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              15 task credits added to your balance instantly
            </p>
            <Button
              variant="outline"
              className="w-full mt-1"
              onClick={(e) => {
                e.stopPropagation();
                onBuyPack();
              }}
              disabled={loading}
            >
              {loading ? "Redirecting..." : "Buy 15 credits"}
            </Button>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors mt-2"
        >
          Maybe later
        </button>
      </DialogContent>
    </Dialog>
  );
}
