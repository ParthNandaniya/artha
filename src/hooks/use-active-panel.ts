"use client";

import { useCallback, useState } from "react";
import type { PanelType } from "@/lib/types";

const VALID_PANELS: PanelType[] = [
  "overview",
  "tasks",
  "research",
  "ads",
  "leads",
  "documents",
  "landing-page",
  "analytics",
  "email",
  "twitter",
  "revenue",
  "marketplace",
  "automations",
  "settings",
];

export function useActivePanel(defaultPanel: PanelType = "overview") {
  const [activePanel, setActivePanel] = useState<PanelType>(() => {
    if (typeof window === "undefined") return defaultPanel;
    const hash = window.location.hash.replace("#", "") as PanelType;
    return hash && VALID_PANELS.includes(hash) ? hash : defaultPanel;
  });

  const switchPanel = useCallback((panel: PanelType) => {
    setActivePanel(panel);
    window.history.replaceState(null, "", `#${panel}`);
  }, []);

  return { activePanel, switchPanel };
}
