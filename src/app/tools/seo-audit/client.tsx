"use client";

import { FREE_TOOLS } from "@/lib/free-tools";
import { ToolPage } from "@/components/tools/tool-page";
import { MarkdownResult } from "@/components/tools/markdown-result";
import { Input } from "@/components/ui/input";

const tool = FREE_TOOLS.find((t) => t.slug === "seo-audit")!;

export function SeoAuditTool() {
  return (
    <ToolPage
      tool={tool}
      apiEndpoint="/api/tools/seo-audit"
      inputOverride={(value, onChange) => (
        <Input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={tool.placeholder}
          className="h-12 text-base"
        />
      )}
      renderResult={(data) => (
        <MarkdownResult
          title="SEO Audit Report"
          content={data.content as string}
        />
      )}
    />
  );
}
