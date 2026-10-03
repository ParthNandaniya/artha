"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArthaIcon } from "@/components/icons/artha-icon";
import type { Project } from "@/lib/types";

const IS_DEV = process.env.NODE_ENV === "development";

interface TopBarProps {
  projects: Project[];
  currentProject: Project | null;
  onSwitchProject: (slug: string) => void;
  onNewCompany: () => void;
  onSubscribe?: () => void;
}

export function TopBar({
  projects,
  currentProject,
  onSwitchProject,
  onNewCompany,
  onSubscribe,
}: TopBarProps) {
  const creditsLeft = typeof currentProject?.task_credits === "number" ? currentProject.task_credits : 0;
  const queryClient = useQueryClient();
  const [devLoading, setDevLoading] = useState(false);

  async function handleDevCredits(action: "add" | "remove") {
    if (!currentProject) return;
    setDevLoading(true);
    try {
      await fetch("/api/dev/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProject.id, action }),
      });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    } finally {
      setDevLoading(false);
    }
  }

  return (
    <div className="h-14 border-b bg-background flex items-center justify-between px-2 sm:px-4 shrink-0 gap-1 sm:gap-2">
      <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <ArthaIcon size={20} />
          <span className="hidden sm:inline text-lg font-bold tracking-tight">artha</span>
        </div>

        {projects.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="max-w-[120px] sm:max-w-[200px] min-h-0 min-w-0 h-8">
                <span className="truncate text-xs sm:text-sm">
                  {currentProject?.name || "Select company"}
                </span>
                <svg className="w-3 h-3 ml-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[220px]">
              {projects.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => onSwitchProject(p.slug)}
                  className="flex items-center justify-between"
                >
                  <span className="truncate">{p.name}</span>
                  <Badge
                    variant={p.subscription_status === "active" ? "default" : "secondary"}
                    className="text-[10px] ml-2"
                  >
                    {p.subscription_status === "active" ? "Pro" : "Free"}
                  </Badge>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button variant="ghost" size="sm" onClick={onNewCompany} className="min-h-0 min-w-0 h-8 px-2 sm:px-3">
          +<span className="hidden sm:inline"> New</span>
        </Button>
      </div>

      {currentProject && (
        <div className="flex items-center gap-1.5 sm:gap-4 text-sm shrink-0">
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-[10px] sm:text-xs">{Number.isInteger(creditsLeft) ? creditsLeft : creditsLeft.toFixed(1)}</Badge>
          </div>
          {currentProject.subscription_status === "active" ? (
            <Badge variant="default" className="hidden sm:inline-flex">Pro</Badge>
          ) : (
            <Button variant="default" size="sm" className="h-7 text-[10px] sm:text-xs px-2 sm:px-3 min-h-0 min-w-0" onClick={onSubscribe}>
              <span className="hidden sm:inline">Subscribe</span>
              <span className="sm:hidden">Pro</span>
            </Button>
          )}
          <div className="hidden md:flex items-center gap-1.5">
            <span className="text-muted-foreground">Revenue:</span>
            <span className="font-medium">
              ${(currentProject.revenue_balance_cents / 100).toFixed(2)}
            </span>
          </div>
          <form action="/api/auth/logout" method="POST" className="border-l pl-1.5 sm:pl-3 ml-0.5 sm:ml-1">
            <Button variant="ghost" size="sm" className="h-7 text-[10px] sm:text-xs px-1.5 sm:px-2 min-h-0 min-w-0" type="submit">
              <span className="hidden sm:inline">Sign out</span>
              <svg className="sm:hidden w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </Button>
          </form>
          {IS_DEV && (
            <div className="hidden sm:flex items-center gap-1 border-l pl-3 ml-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2 min-h-0 min-w-0"
                disabled={devLoading}
                onClick={() => handleDevCredits("add")}
              >
                +Credit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2 text-destructive min-h-0 min-w-0"
                disabled={devLoading}
                onClick={() => handleDevCredits("remove")}
              >
                -Credit
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
