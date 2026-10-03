"use client";

import { ArthaLoader } from "@/components/icons/artha-loader";

interface LiveSectionHeaderProps {
  title: string;
  isFetching?: boolean;
  right?: React.ReactNode;
}

export function LiveSectionHeader({ title, isFetching, right }: LiveSectionHeaderProps) {
  return (
    <div className="px-4 py-3 border-b border-border flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {isFetching && (
          <ArthaLoader size={14} className="text-muted-foreground" />
        )}
      </div>
      {right && <div className="flex items-center">{right}</div>}
    </div>
  );
}
