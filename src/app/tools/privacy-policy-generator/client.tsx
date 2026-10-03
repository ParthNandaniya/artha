"use client";

import { FREE_TOOLS } from "@/lib/free-tools";
import { ToolPage } from "@/components/tools/tool-page";
import { MarkdownResult } from "@/components/tools/markdown-result";

const tool = FREE_TOOLS.find((t) => t.slug === "privacy-policy-generator")!;

export function PrivacyPolicyGeneratorTool() {
  return (
    <ToolPage
      tool={tool}
      apiEndpoint="/api/tools/privacy-policy-generator"
      renderResult={(data) => (
        <MarkdownResult
          title={(data.title as string) || "Privacy Policy & Terms of Service"}
          content={data.content as string}
        />
      )}
    />
  );
}
