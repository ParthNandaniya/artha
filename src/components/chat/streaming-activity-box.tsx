"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface StreamingActivityBoxProps {
  /** Array of activity lines to display (most recent last) */
  lines: string[];
  /** Maximum number of visible lines (default 5) */
  maxLines?: number;
  className?: string;
}

/**
 * A fixed-height terminal-like box that shows streaming agent activity.
 * Lines appear with a typing animation, older lines fade out as new ones arrive.
 * Uses black background (Artha brand color).
 */
export function StreamingActivityBox({
  lines,
  maxLines = 5,
  className,
}: StreamingActivityBoxProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new lines arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  // Show only the last N lines
  const visibleLines = lines.slice(-maxLines);
  // How many lines were cut (for fade effect on top line)
  const hasTruncated = lines.length > maxLines;

  return (
    <div
      className={cn(
        "relative rounded-lg bg-[#0a0a0a] border border-[#1a1a1a] overflow-hidden font-mono",
        className
      )}
    >
      {/* Top fade gradient when there are more lines above */}
      {hasTruncated && (
        <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-[#0a0a0a] to-transparent z-10 pointer-events-none" />
      )}

      <div
        ref={containerRef}
        className="px-3 py-2.5 overflow-hidden"
        style={{ height: `${maxLines * 20 + 20}px` }}
      >
        <div className="space-y-0.5">
          {visibleLines.map((line, index) => {
            const isLatest = index === visibleLines.length - 1;
            const opacity = isLatest ? 1 : 0.4 + (index / visibleLines.length) * 0.4;

            return (
              <div
                key={`${lines.length}-${index}`}
                className={cn(
                  "text-[11px] leading-[18px] text-emerald-400/90 truncate",
                  isLatest && "animate-[streamLineIn_0.3s_ease-out_both]"
                )}
                style={{ opacity }}
              >
                <span className="text-emerald-600/60 mr-1.5 select-none">{">"}</span>
                {line}
                {isLatest && (
                  <span className="inline-block w-1.5 h-3 bg-emerald-400/70 animate-pulse ml-0.5 -mb-0.5 rounded-[1px]" />
                )}
              </div>
            );
          })}

          {/* Empty lines to maintain fixed height */}
          {visibleLines.length < maxLines &&
            Array.from({ length: maxLines - visibleLines.length }).map((_, i) => (
              <div key={`empty-${i}`} className="h-[18px]" />
            ))}
        </div>
      </div>

      {/* Bottom scan line effect */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
    </div>
  );
}
