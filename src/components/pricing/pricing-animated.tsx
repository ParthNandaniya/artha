"use client";

import { Reveal } from "@/components/ui/reveal";

export function PricingAnimated({ children }: { children: React.ReactNode }) {
  return (
    <Reveal>
      {children}
    </Reveal>
  );
}

export function PricingCardAnimated({
  children,
  delay = 0,
  glow = false,
}: {
  children: React.ReactNode;
  delay?: number;
  glow?: boolean;
}) {
  return (
    <Reveal delay={delay} className={glow ? "animate-[border-glow_1.5s_ease-in-out_3_1s]" : undefined}>
      {children}
    </Reveal>
  );
}

export function StaggeredList({ children }: { children: React.ReactNode[] }) {
  return (
    <ul className="space-y-3">
      {children}
    </ul>
  );
}
