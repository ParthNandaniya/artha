"use client";

import { useState, useCallback, useMemo } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Project } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────────

interface CalendarPost {
  id: string;
  project_id: string;
  platform: string;
  content: string;
  media_urls: string[];
  status: string;
  scheduled_at: string;
  posted_at: string | null;
  external_id: string | null;
  external_url: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  source: "content_calendar" | "twitter_bot";
}

interface ContentCalendarProps {
  project: Project;
}

// ── Helpers ──────────────────────────────────────────────────────────

const PLATFORM_COLORS: Record<string, string> = {
  twitter: "bg-blue-500",
  linkedin: "bg-blue-700",
  bluesky: "bg-sky-400",
  both: "bg-purple-500",
};

const PLATFORM_LABELS: Record<string, string> = {
  twitter: "Twitter",
  linkedin: "LinkedIn",
  bluesky: "Bluesky",
  both: "Multi",
};

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function formatMonthYear(year: number, month: number): string {
  return new Date(year, month).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(year: number, month: number, day: number): boolean {
  const now = new Date();
  return (
    now.getFullYear() === year &&
    now.getMonth() === month &&
    now.getDate() === day
  );
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "\u2026";
}

// ── Component ────────────────────────────────────────────────────────

export function ContentCalendar({ project }: ContentCalendarProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [activePostId, setActivePostId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // Formatted month string for API
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

  // ── Data fetching ────────────────────────────────────────────────

  const { data: posts = [], isLoading } = useQuery<CalendarPost[]>({
    queryKey: ["content-calendar", project.id, monthStr],
    queryFn: async () => {
      const res = await fetch(
        `/api/content/calendar?projectId=${project.id}&month=${monthStr}`,
      );
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
  });

  // ── Mutations ────────────────────────────────────────────────────

  const reschedule = useMutation({
    mutationFn: async ({
      postId,
      scheduledAt,
    }: {
      postId: string;
      scheduledAt: string;
    }) => {
      const res = await fetch("/api/content/calendar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          postId,
          scheduledAt,
        }),
      });
      if (!res.ok) throw new Error("Failed to reschedule");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["content-calendar", project.id],
      });
    },
  });

  const createPost = useMutation({
    mutationFn: async (data: {
      platform: string;
      content: string;
      scheduledAt: string;
    }) => {
      const res = await fetch("/api/content/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, ...data }),
      });
      if (!res.ok) throw new Error("Failed to create post");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["content-calendar", project.id],
      });
    },
  });

  // ── Calendar grid data ───────────────────────────────────────────

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);

  const postsByDay = useMemo(() => {
    const map = new Map<number, CalendarPost[]>();
    for (const post of posts) {
      const d = new Date(post.scheduled_at);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        if (!map.has(day)) map.set(day, []);
        map.get(day)!.push(post);
      }
    }
    return map;
  }, [posts, year, month]);

  const selectedPosts = useMemo(() => {
    if (selectedDay === null) return [];
    return postsByDay.get(selectedDay) ?? [];
  }, [postsByDay, selectedDay]);

  // ── Navigation ───────────────────────────────────────────────────

  const goToPrevMonth = useCallback(() => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
    setSelectedDay(null);
  }, [month]);

  const goToNextMonth = useCallback(() => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
    setSelectedDay(null);
  }, [month]);

  const goToToday = useCallback(() => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setSelectedDay(now.getDate());
  }, []);

  // ── Drag & Drop ──────────────────────────────────────────────────

  function handleDragStart(event: DragStartEvent) {
    setActivePostId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActivePostId(null);
    const { active, over } = event;
    if (!over) return;

    const postId = active.id as string;
    const targetDay = Number(over.id);
    if (isNaN(targetDay)) return;

    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    const oldDate = new Date(post.scheduled_at);
    const targetDate = new Date(year, month, targetDay);

    if (isSameDay(oldDate, targetDate)) return;

    // Preserve the time, just change the date
    targetDate.setHours(
      oldDate.getHours(),
      oldDate.getMinutes(),
      oldDate.getSeconds(),
    );

    reschedule.mutate({ postId, scheduledAt: targetDate.toISOString() });
  }

  const activePost = activePostId
    ? posts.find((p) => p.id === activePostId)
    : null;

  // ── Quick add ────────────────────────────────────────────────────

  function handleAddPost(day: number) {
    const scheduledAt = new Date(year, month, day, 9, 0, 0).toISOString();
    createPost.mutate({
      platform: "twitter",
      content: "",
      scheduledAt,
    });
    setSelectedDay(day);
  }

  // ── Render ───────────────────────────────────────────────────────

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Build grid cells: empty cells for offset + day cells
  const cells: Array<{ day: number | null }> = [];
  for (let i = 0; i < firstDay; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Content Calendar</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToPrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <span className="text-sm font-medium min-w-[140px] text-center">
            {formatMonthYear(year, month)}
          </span>
          <Button variant="outline" size="sm" onClick={goToNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
          Loading calendar...
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* Week day headers */}
          <div className="grid grid-cols-7 gap-px bg-border rounded-t-lg overflow-hidden">
            {weekDays.map((wd) => (
              <div
                key={wd}
                className="bg-muted px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
              >
                {wd}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-px bg-border rounded-b-lg overflow-hidden">
            {cells.map((cell, i) => {
              if (cell.day === null) {
                return (
                  <div key={`empty-${i}`} className="bg-background h-24" />
                );
              }

              const day = cell.day;
              const dayPosts = postsByDay.get(day) ?? [];
              const todayClass = isToday(year, month, day)
                ? "ring-2 ring-primary ring-inset"
                : "";
              const selectedClass =
                selectedDay === day ? "bg-accent/10" : "bg-background";

              return (
                <DayCell
                  key={day}
                  day={day}
                  posts={dayPosts}
                  todayClass={todayClass}
                  selectedClass={selectedClass}
                  onClick={() => setSelectedDay(day)}
                  onAddPost={() => handleAddPost(day)}
                />
              );
            })}
          </div>

          <DragOverlay>
            {activePost ? (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-white bg-blue-500 shadow-lg opacity-90">
                <GripVertical className="h-3 w-3" />
                {truncate(activePost.content, 30)}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Detail panel */}
      {selectedDay !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Posts for{" "}
              {new Date(year, month, selectedDay).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No posts scheduled for this day.
              </p>
            ) : (
              <div className="space-y-3">
                {selectedPosts.map((post) => (
                  <div
                    key={post.id}
                    className="flex items-start gap-3 p-3 rounded-lg border"
                  >
                    <Badge
                      variant="secondary"
                      className={`${PLATFORM_COLORS[post.platform] ?? "bg-gray-500"} text-white text-[10px]`}
                    >
                      {PLATFORM_LABELS[post.platform] ?? post.platform}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm whitespace-pre-wrap">
                        {post.content || "(empty draft)"}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {new Date(post.scheduled_at).toLocaleTimeString(
                            "en-US",
                            { hour: "numeric", minute: "2-digit" },
                          )}
                        </span>
                        <Badge
                          variant={
                            post.status === "posted"
                              ? "default"
                              : post.status === "failed"
                                ? "destructive"
                                : "outline"
                          }
                          className="text-[10px]"
                        >
                          {post.status}
                        </Badge>
                        {post.source === "twitter_bot" && (
                          <Badge variant="outline" className="text-[10px]">
                            Bot
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Day Cell (droppable) ─────────────────────────────────────────────

import { useDroppable, useDraggable } from "@dnd-kit/core";

function DayCell({
  day,
  posts,
  todayClass,
  selectedClass,
  onClick,
  onAddPost,
}: {
  day: number;
  posts: CalendarPost[];
  todayClass: string;
  selectedClass: string;
  onClick: () => void;
  onAddPost: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day });

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={`h-24 p-1.5 cursor-pointer transition-colors group ${todayClass} ${selectedClass} ${isOver ? "bg-primary/10" : ""}`}
    >
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs font-medium">{day}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddPost();
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          title="Add post"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      <div className="space-y-0.5 overflow-hidden">
        {posts.slice(0, 3).map((post) => (
          <PostPill key={post.id} post={post} />
        ))}
        {posts.length > 3 && (
          <span className="text-[10px] text-muted-foreground">
            +{posts.length - 3} more
          </span>
        )}
      </div>
    </div>
  );
}

// ── Post Pill (draggable) ────────────────────────────────────────────

function PostPill({ post }: { post: CalendarPost }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: post.id,
  });

  const bgColor = PLATFORM_COLORS[post.platform] ?? "bg-gray-500";

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-1 px-1 py-px rounded text-[10px] text-white cursor-grab ${bgColor} ${isDragging ? "opacity-50" : ""}`}
      title={post.content}
    >
      <GripVertical className="h-2.5 w-2.5 flex-shrink-0 opacity-60" />
      <span className="truncate">{truncate(post.content, 20) || "Draft"}</span>
    </div>
  );
}
