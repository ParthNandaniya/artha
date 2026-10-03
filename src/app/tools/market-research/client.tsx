"use client";

import { FREE_TOOLS } from "@/lib/free-tools";
import { ToolPage } from "@/components/tools/tool-page";
import { MarkdownResult } from "@/components/tools/markdown-result";

const tool = FREE_TOOLS.find((t) => t.slug === "market-research")!;

export function MarketResearchTool() {
  return (
    <ToolPage
      tool={tool}
      apiEndpoint="/api/tools/market-research"
      renderResult={(data) => (
        <MarkdownResult
          title={data.title as string}
          content={data.content as string}
        />
      )}
    />
  );
}
