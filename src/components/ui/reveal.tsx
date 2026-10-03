"use client";

import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/utils";

type Direction = "up" | "down" | "left" | "scale";

const animationMap: Record<Direction, string> = {
  up: "animate-[reveal-up_500ms_ease-out_both]",
  down: "animate-[reveal-down_500ms_ease-out_both]",
  left: "animate-[reveal-left_500ms_ease-out_both]",
  scale: "animate-[reveal-scale_400ms_ease-out_both]",
};

interface RevealProps {
  children: React.ReactNode;
  direction?: Direction;
  delay?: number;
  className?: string;
  as?: React.ElementType;
}

export function Reveal({
  children,
  direction = "up",
  delay = 0,
  className,
  as: Tag = "div",
}: RevealProps) {
  const { ref, isInView } = useInView();

  return (
    <Tag
      ref={ref}
      className={cn(
        isInView ? animationMap[direction] : "opacity-0",
        className
      )}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
