"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  closestCorners,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DealCard, type Deal } from "@/components/crm/DealCard";
import { Plus, DollarSign, Loader2 } from "lucide-react";
import type { Project } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────────

interface Stage {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

interface CrmPipelineProps {
  project: Project;
}

// ── Currency formatter ───────────────────────────────────────────────

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);

// ── Component ────────────────────────────────────────────────────────

export function CrmPipeline({ project }: CrmPipelineProps) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addingToStage, setAddingToStage] = useState<string | null>(null);
  const [newDealTitle, setNewDealTitle] = useState("");
  const [newDealValue, setNewDealValue] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // ── Data fetching ──────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const [stagesRes, dealsRes] = await Promise.all([
        fetch(`/api/deals/stages?projectId=${project.id}`),
        fetch(`/api/deals?projectId=${project.id}`),
      ]);

      if (stagesRes.ok) setStages(await stagesRes.json());
      if (dealsRes.ok) setDeals(await dealsRes.json());
    } catch (err) {
      console.error("Failed to fetch CRM data:", err);
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Deals grouped by stage ─────────────────────────────────────────

  const dealsByStage = useMemo(() => {
    const map = new Map<string, Deal[]>();
    for (const stage of stages) {
      map.set(stage.id, []);
    }
    for (const deal of deals) {
      const stageDeals = map.get(deal.stage_id) || [];
      stageDeals.push(deal);
      map.set(deal.stage_id, stageDeals);
    }
    return map;
  }, [stages, deals]);

  // ── Drag handlers ──────────────────────────────────────────────────

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const dealId = active.id as string;
    const overId = over.id as string;

    // Determine target stage: could be a deal ID or a stage ID
    let targetStageId: string | null = null;

    // Check if dropped on a stage column
    if (stages.some((s) => s.id === overId)) {
      targetStageId = overId;
    } else {
      // Dropped on another deal — find its stage
      const overDeal = deals.find((d) => d.id === overId);
      if (overDeal) targetStageId = overDeal.stage_id;
    }

    if (!targetStageId) return;

    const currentDeal = deals.find((d) => d.id === dealId);
    if (!currentDeal || currentDeal.stage_id === targetStageId) return;

    // Optimistic update
    setDeals((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, stage_id: targetStageId! } : d))
    );

    // Persist
    try {
      await fetch("/api/deals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          dealId,
          stage_id: targetStageId,
        }),
      });
    } catch {
      // Revert on failure
      fetchData();
    }
  }

  // ── Add deal ───────────────────────────────────────────────────────

  async function handleAddDeal(stageId: string) {
    if (!newDealTitle.trim()) return;

    const valueCents = Math.round(parseFloat(newDealValue || "0") * 100);

    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          title: newDealTitle.trim(),
          value_cents: valueCents,
          stage_id: stageId,
        }),
      });

      if (res.ok) {
        const deal = await res.json();
        setDeals((prev) => [...prev, deal]);
        setNewDealTitle("");
        setNewDealValue("");
        setAddingToStage(null);
      }
    } catch (err) {
      console.error("Failed to add deal:", err);
    }
  }

  // ── Loading state ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageDeals = dealsByStage.get(stage.id) || [];
          const totalValue = stageDeals.reduce((sum, d) => sum + (d.value_cents || 0), 0);

          return (
            <div
              key={stage.id}
              className="flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30"
            >
              {/* Stage header */}
              <div className="flex items-center justify-between border-b p-3">
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="text-sm font-semibold">{stage.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {stageDeals.length}
                  </Badge>
                </div>
                {totalValue > 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                    <DollarSign className="h-3 w-3" />
                    {formatCurrency(totalValue)}
                  </span>
                )}
              </div>

              {/* Deal cards */}
              <SortableContext
                items={stageDeals.map((d) => d.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex min-h-[80px] flex-col gap-2 p-2" data-stage-id={stage.id}>
                  {stageDeals.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      isDragging={activeId === deal.id}
                    />
                  ))}
                </div>
              </SortableContext>

              {/* Add deal form / button */}
              <div className="border-t p-2">
                {addingToStage === stage.id ? (
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="Deal title..."
                      className="w-full rounded border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      value={newDealTitle}
                      onChange={(e) => setNewDealTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddDeal(stage.id);
                        if (e.key === "Escape") setAddingToStage(null);
                      }}
                      autoFocus
                    />
                    <input
                      type="number"
                      placeholder="Value ($)"
                      className="w-full rounded border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      value={newDealValue}
                      onChange={(e) => setNewDealValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddDeal(stage.id);
                        if (e.key === "Escape") setAddingToStage(null);
                      }}
                    />
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() => handleAddDeal(stage.id)}
                      >
                        Add
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs"
                        onClick={() => setAddingToStage(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-1 text-xs text-muted-foreground"
                    onClick={() => {
                      setAddingToStage(stage.id);
                      setNewDealTitle("");
                      setNewDealValue("");
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add deal
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </DndContext>
  );
}
