"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownResult({ content, title }: { content: string; title?: string }) {
  return (
    <div className="border border-border rounded-lg p-6 sm:p-8">
      {title && <h2 className="font-display text-lg font-bold text-foreground mb-4">{title}</h2>}
      <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-headings:font-semibold prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-p:text-foreground/80 prose-li:text-foreground/80 prose-strong:text-foreground prose-table:text-sm prose-th:bg-muted prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-td:border-border prose-th:border-border prose-a:text-foreground prose-a:underline prose-a:underline-offset-2">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
