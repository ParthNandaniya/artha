"use client";

import { FREE_TOOLS } from "@/lib/free-tools";
import { ToolPage } from "@/components/tools/tool-page";
import { MarkdownResult } from "@/components/tools/markdown-result";

const tool = FREE_TOOLS.find((t) => t.slug === "competitor-analysis")!;

export function CompetitorAnalysisTool() {
  return (
    <ToolPage
      tool={tool}
      apiEndpoint="/api/tools/competitor-analysis"
      renderResult={(data) => (
        <MarkdownResult
          title="Competitor Analysis"
          content={data.content as string}
        />
      )}
    />
  );
}
