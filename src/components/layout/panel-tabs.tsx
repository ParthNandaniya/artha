"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { PanelType } from "@/lib/types";

/** Primary tabs — the first-dollar path. Rendered with full opacity. */
const PRIMARY_TABS: { id: PanelType; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "tasks", label: "Tasks" },
  { id: "agent-activity", label: "Agents" },
  { id: "landing-page", label: "Website" },
  { id: "leads", label: "Leads" },
  { id: "revenue", label: "Revenue" },
];

/** Secondary tabs — still visible, slightly dimmed until hovered/active. */
const SECONDARY_TABS: { id: PanelType; label: string }[] = [
  { id: "analytics", label: "Analytics" },
  { id: "email", label: "Email" },
  { id: "research", label: "Research" },
  { id: "twitter", label: "Twitter" },
  { id: "documents", label: "Documents" },
  { id: "ads", label: "Meta Ads" },
  { id: "marketplace", label: "Marketplace" },
  { id: "automations", label: "Automations" },
  { id: "settings", label: "Settings" },
];

const ALL_TABS = [...PRIMARY_TABS, ...SECONDARY_TABS];

interface PanelTabsProps {
  activePanel: PanelType;
  onSwitch: (panel: PanelType) => void;
  warnings?: Partial<Record<PanelType, boolean>>;
}

export function PanelTabs({ activePanel, onSwitch, warnings }: PanelTabsProps) {
  const navRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const setTabRef = useCallback((id: string) => (el: HTMLButtonElement | null) => {
    if (el) tabRefs.current.set(id, el);
    else tabRefs.current.delete(id);
  }, []);

  useEffect(() => {
    const btn = tabRefs.current.get(activePanel);
    const nav = navRef.current;
    if (!btn || !nav) return;
    setIndicator({
      left: btn.offsetLeft,
      width: btn.offsetWidth,
    });
  }, [activePanel]);

  return (
    <div className="border-b bg-background px-1 sm:px-2 md:px-4 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch]">
      <nav ref={navRef} className="flex min-w-max gap-0 sm:gap-0.5 -mb-px items-center relative">
        {/* Sliding underline indicator */}
        <span
          className="absolute bottom-0 h-0.5 bg-primary rounded-full transition-all duration-200 ease-out"
          style={{ left: indicator.left, width: indicator.width }}
        />

        {PRIMARY_TABS.map((tab) => (
          <button
            key={tab.id}
            ref={setTabRef(tab.id)}
            onClick={() => onSwitch(tab.id)}
            className={cn(
              "px-1.5 sm:px-2 md:px-3 py-2.5 text-xs sm:text-sm font-medium border-b-2 border-transparent transition-colors relative whitespace-nowrap min-h-0 min-w-0",
              activePanel === tab.id
                ? "text-primary"
                : "text-foreground/80 hover:text-foreground"
            )}
          >
            {tab.label}
            {warnings?.[tab.id] && (
              <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-yellow-500 align-top" />
            )}
          </button>
        ))}

        {/* Visual separator between primary and secondary */}
        <div className="mx-1.5 h-4 w-px bg-border" />

        {SECONDARY_TABS.map((tab) => (
          <button
            key={tab.id}
            ref={setTabRef(tab.id)}
            onClick={() => onSwitch(tab.id)}
            className={cn(
              "px-1.5 sm:px-2 md:px-3 py-2.5 text-xs sm:text-sm border-b-2 border-transparent transition-colors relative whitespace-nowrap min-h-0 min-w-0",
              activePanel === tab.id
                ? "text-primary font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {warnings?.[tab.id] && (
              <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-yellow-500 align-top" />
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
