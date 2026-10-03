"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, DollarSign, GripVertical, User } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

export interface Deal {
  id: string;
  project_id: string;
  lead_id: string | null;
  stage_id: string;
  title: string;
  value_cents: number;
  probability: number;
  notes: string | null;
  expected_close_date: string | null;
  won_at: string | null;
  lost_at: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  stage_name?: string;
  stage_color?: string;
  lead_name?: string;
  lead_email?: string;
  lead_company?: string;
}

interface DealCardProps {
  deal: Deal;
  isDragging?: boolean;
  onClick?: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);

function daysInStage(createdAt: string): number {
  const created = new Date(createdAt);
  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

function probabilityColor(probability: number): string {
  if (probability >= 75) return "bg-green-100 text-green-700 border-green-200";
  if (probability >= 50) return "bg-yellow-100 text-yellow-700 border-yellow-200";
  if (probability >= 25) return "bg-orange-100 text-orange-700 border-orange-200";
  return "bg-red-100 text-red-700 border-red-200";
}

// ── Component ────────────────────────────────────────────────────────

export function DealCard({ deal, isDragging = false, onClick }: DealCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: deal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dragging = isDragging || isSortableDragging;
  const days = daysInStage(deal.updated_at || deal.created_at);

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`cursor-pointer border bg-card p-3 transition-all ${
        dragging ? "scale-[1.02] shadow-lg opacity-80" : "hover:shadow-sm"
      }`}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="mt-0.5 shrink-0 cursor-grab text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Title */}
          <p className="text-sm font-medium leading-snug truncate">{deal.title}</p>

          {/* Contact info */}
          {(deal.lead_name || deal.lead_company) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {deal.lead_name && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <User className="h-3 w-3" />
                  {deal.lead_name}
                </span>
              )}
              {deal.lead_company && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3" />
                  {deal.lead_company}
                </span>
              )}
            </div>
          )}

          {/* Value + meta row */}
          <div className="mt-2 flex items-center gap-2">
            {deal.value_cents > 0 && (
              <span className="flex items-center gap-0.5 text-xs font-semibold text-foreground">
                <DollarSign className="h-3 w-3" />
                {formatCurrency(deal.value_cents)}
              </span>
            )}

            <Badge
              variant="outline"
              className={`text-[10px] ${probabilityColor(deal.probability)}`}
            >
              {deal.probability}%
            </Badge>

            <span className="ml-auto text-[10px] text-muted-foreground">
              {days === 0 ? "Today" : `${days}d`}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
