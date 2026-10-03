"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Detect HEX color codes and render inline swatches next to them */
function InlineColorSwatch({ children }: { children: React.ReactNode }) {
  if (typeof children !== "string") return <>{children}</>;

  const hexRegex = /#([0-9A-Fa-f]{6})\b/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = hexRegex.exec(children)) !== null) {
    if (match.index > lastIndex) {
      parts.push(children.slice(lastIndex, match.index));
    }
    const hex = match[0];
    parts.push(
      <span key={match.index} className="inline-flex items-center gap-1">
        <span
          className="inline-block size-4 rounded-sm border border-border/50 align-middle"
          style={{ backgroundColor: hex }}
        />
        <code className="text-xs bg-muted px-1 py-0.5 rounded">{hex}</code>
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < children.length) {
    parts.push(children.slice(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : <>{children}</>;
}

export function BrandKitResult({ content, title }: { content: string; title?: string }) {
  return (
    <div className="border border-border rounded-lg p-6 sm:p-8">
      {title && <h2 className="font-display text-lg font-bold text-foreground mb-4">{title}</h2>}
      <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-headings:font-semibold prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-p:text-foreground/80 prose-li:text-foreground/80 prose-strong:text-foreground prose-table:text-sm prose-th:bg-muted prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-td:border-border prose-th:border-border prose-a:text-foreground prose-a:underline prose-a:underline-offset-2">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Inject color swatches in paragraphs and list items
            p: ({ children }) => (
              <p>
                {Array.isArray(children)
                  ? children.map((child, i) => <InlineColorSwatch key={i}>{child}</InlineColorSwatch>)
                  : <InlineColorSwatch>{children}</InlineColorSwatch>}
              </p>
            ),
            li: ({ children }) => (
              <li>
                {Array.isArray(children)
                  ? children.map((child, i) => <InlineColorSwatch key={i}>{child}</InlineColorSwatch>)
                  : <InlineColorSwatch>{children}</InlineColorSwatch>}
              </li>
            ),
            td: ({ children }) => (
              <td>
                {Array.isArray(children)
                  ? children.map((child, i) => <InlineColorSwatch key={i}>{child}</InlineColorSwatch>)
                  : <InlineColorSwatch>{children}</InlineColorSwatch>}
              </td>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
