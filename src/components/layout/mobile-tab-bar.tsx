"use client";

import { MessageSquare, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

type MobileView = "chat" | "panels";

interface MobileTabBarProps {
  mobileView: MobileView;
  onSwitch: (view: MobileView) => void;
  chatActive?: boolean;
}

export function MobileTabBar({ mobileView, onSwitch, chatActive }: MobileTabBarProps) {
  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 h-14 border-t bg-background z-40 flex safe-area-bottom">
      <button
        onClick={() => onSwitch("chat")}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 text-sm font-medium transition-colors relative",
          mobileView === "chat"
            ? "text-primary"
            : "text-muted-foreground"
        )}
      >
        <MessageSquare className="h-5 w-5" />
        <span>Chat</span>
        {chatActive && mobileView !== "chat" && (
          <span className="absolute top-2.5 left-1/2 ml-4 h-2 w-2 rounded-full bg-primary" />
        )}
      </button>
      <div className="w-px bg-border my-2.5" />
      <button
        onClick={() => onSwitch("panels")}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 text-sm font-medium transition-colors",
          mobileView === "panels"
            ? "text-primary"
            : "text-muted-foreground"
        )}
      >
        <LayoutGrid className="h-5 w-5" />
        <span>Panels</span>
      </button>
    </div>
  );
}
