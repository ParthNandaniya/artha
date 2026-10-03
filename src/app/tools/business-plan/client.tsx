"use client";

import { FREE_TOOLS } from "@/lib/free-tools";
import { ToolPage } from "@/components/tools/tool-page";
import { MarkdownResult } from "@/components/tools/markdown-result";

const tool = FREE_TOOLS.find((t) => t.slug === "business-plan")!;

export function BusinessPlanTool() {
  return (
    <ToolPage
      tool={tool}
      apiEndpoint="/api/tools/business-plan"
      renderResult={(data) => (
        <MarkdownResult
          title={data.title as string}
          content={data.content as string}
        />
      )}
    />
  );
}
