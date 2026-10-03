"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

// ── Types ────────────────────────────────────────────────────────────

export interface ReplayEvent {
  t: "snapshot" | "mouse" | "click" | "scroll" | "input";
  ts: number;
  s: number;
  d: Record<string, unknown>;
  n?: number;
}

interface SessionReplayPlayerProps {
  events: ReplayEvent[];
  duration: number;
}

type PlaybackSpeed = 1 | 2 | 4;

// ── Component ────────────────────────────────────────────────────────

export function SessionReplayPlayer({ events, duration }: SessionReplayPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [clicks, setClicks] = useState<{ x: number; y: number; ts: number }[]>([]);
  const [scrollPos, setScrollPos] = useState({ x: 0, y: 0 });

  const animFrameRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const playStartRef = useRef<number>(0);
  const playOffsetRef = useRef<number>(0);

  // Sorted events for efficient lookup
  const sortedEvents = useRef(
    [...events].sort((a, b) => a.ts - b.ts)
  );

  // Extract click events for timeline markers
  const clickEvents = sortedEvents.current.filter((e) => e.t === "click");

  // Get snapshot dimensions
  const snapshot = sortedEvents.current.find((e) => e.t === "snapshot");
  const viewportW = (snapshot?.d?.w as number) || 1280;
  const viewportH = (snapshot?.d?.h as number) || 800;

  const processEventsUpTo = useCallback((timeMs: number) => {
    const evts = sortedEvents.current;
    let latestMouse: { x: number; y: number } | null = null;
    let latestScroll = { x: 0, y: 0 };
    const recentClicks: { x: number; y: number; ts: number }[] = [];

    for (const ev of evts) {
      if (ev.ts > timeMs) break;

      switch (ev.t) {
        case "mouse":
          latestMouse = {
            x: ev.d.x as number,
            y: ev.d.y as number,
          };
          break;
        case "click":
          if (timeMs - ev.ts < 1000) {
            recentClicks.push({
              x: ev.d.x as number,
              y: ev.d.y as number,
              ts: ev.ts,
            });
          }
          break;
        case "scroll":
          latestScroll = {
            x: ev.d.x as number,
            y: ev.d.y as number,
          };
          break;
      }
    }

    if (latestMouse) setCursorPos(latestMouse);
    setScrollPos(latestScroll);
    setClicks(recentClicks);
  }, []);

  const tick = useCallback(() => {
    const now = performance.now();
    const elapsed = (now - playStartRef.current) * speed;
    const newTime = playOffsetRef.current + elapsed;

    if (newTime >= duration) {
      setCurrentTime(duration);
      setIsPlaying(false);
      processEventsUpTo(duration);
      return;
    }

    setCurrentTime(newTime);
    processEventsUpTo(newTime);

    animFrameRef.current = requestAnimationFrame(tick);
  }, [speed, duration, processEventsUpTo]);

  useEffect(() => {
    if (isPlaying) {
      playStartRef.current = performance.now();
      playOffsetRef.current = currentTime;
      animFrameRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, tick, currentTime]);

  const togglePlay = () => {
    if (currentTime >= duration) {
      setCurrentTime(0);
      processEventsUpTo(0);
      setCursorPos(null);
      setClicks([]);
    }
    setIsPlaying((p) => !p);
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const newTime = Math.max(0, Math.min(duration, pct * duration));
    setCurrentTime(newTime);
    processEventsUpTo(newTime);
    playOffsetRef.current = newTime;
    playStartRef.current = performance.now();
  };

  const cycleSpeed = () => {
    const speeds: PlaybackSpeed[] = [1, 2, 4];
    const idx = speeds.indexOf(speed);
    const next = speeds[(idx + 1) % speeds.length];
    setSpeed(next);
    // Reset play timing for new speed
    if (isPlaying) {
      playOffsetRef.current = currentTime;
      playStartRef.current = performance.now();
    }
  };

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  // Scale factor to fit viewport into container
  const containerWidth = 800;
  const scale = containerWidth / viewportW;
  const containerHeight = viewportH * scale;

  return (
    <Card className="overflow-hidden">
      {/* Replay Viewport */}
      <div
        ref={containerRef}
        className="relative bg-white overflow-hidden"
        style={{
          width: containerWidth,
          height: containerHeight,
          transform: `translateY(${-scrollPos.y * scale}px)`,
        }}
      >
        {/* Cursor dot */}
        {cursorPos && (
          <div
            className="absolute w-4 h-4 rounded-full bg-red-500 opacity-80 pointer-events-none z-50 -translate-x-1/2 -translate-y-1/2 transition-all duration-75"
            style={{
              left: cursorPos.x * scale,
              top: cursorPos.y * scale,
            }}
          />
        )}

        {/* Click indicators (ripple effect) */}
        {clicks.map((click, i) => {
          const age = currentTime - click.ts;
          const opacity = Math.max(0, 1 - age / 1000);
          const ringSize = 20 + (age / 1000) * 30;
          return (
            <div
              key={`click-${i}-${click.ts}`}
              className="absolute pointer-events-none z-40 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: click.x * scale,
                top: click.y * scale,
                width: ringSize,
                height: ringSize,
                opacity,
                border: "2px solid #ef4444",
                borderRadius: "50%",
              }}
            />
          );
        })}

        {/* Page info overlay */}
        {snapshot && (
          <div className="absolute top-2 left-2 z-50">
            <Badge variant="secondary" className="text-xs opacity-70">
              {(snapshot.d.url as string) || ""}
            </Badge>
          </div>
        )}

        {/* Empty state */}
        {events.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            No replay data available
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="border-t bg-gray-50 p-3 space-y-2">
        {/* Timeline */}
        <div
          className="relative h-6 bg-gray-200 rounded cursor-pointer group"
          onClick={handleTimelineClick}
        >
          {/* Progress bar */}
          <div
            className="absolute top-0 left-0 h-full bg-blue-500 rounded transition-none"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />

          {/* Click event markers */}
          {clickEvents.map((ev, i) => (
            <div
              key={`marker-${i}`}
              className="absolute top-1 w-1.5 h-4 bg-red-400 rounded-sm opacity-60"
              style={{ left: `${(ev.ts / duration) * 100}%` }}
              title={`Click at ${formatTime(ev.ts)}`}
            />
          ))}

          {/* Playhead */}
          <div
            className="absolute top-0 w-0.5 h-full bg-blue-700"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          />
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={togglePlay}>
            {isPlaying ? "Pause" : currentTime >= duration ? "Replay" : "Play"}
          </Button>

          <Button size="sm" variant="ghost" onClick={cycleSpeed}>
            {speed}x
          </Button>

          <span className="text-xs text-gray-500 ml-auto">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </Card>
  );
}
