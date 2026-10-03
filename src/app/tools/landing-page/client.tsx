"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { FREE_TOOLS } from "@/lib/free-tools";
import { ToolPage } from "@/components/tools/tool-page";
import { Download, Monitor, Tablet, Smartphone, X } from "lucide-react";

const tool = FREE_TOOLS.find((t) => t.slug === "landing-page")!;

type PreviewSize = "desktop" | "tablet" | "mobile";
const PREVIEW_WIDTHS: Record<PreviewSize, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
};

function downloadHtml(html: string) {
  const blob = new Blob([html], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "landing-page.html";
  a.click();
  URL.revokeObjectURL(a.href);
}

export function LandingPageTool() {
  const [companyName, setCompanyName] = useState("");
  const [previewSize, setPreviewSize] = useState<PreviewSize>("desktop");
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <ToolPage
      tool={tool}
      apiEndpoint="/api/tools/landing-page"
      extraFields={
        <Input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Company name (optional)"
          className="text-base"
        />
      }
      buildBody={(prompt) => ({ prompt: prompt.trim(), companyName: companyName.trim() || undefined })}
      renderResult={(data) => {
        const html = data.html as string;
        return (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-display text-lg font-bold text-foreground">Your Landing Page</h2>
              <div className="flex items-center gap-2">
                <div className="flex items-center border border-border rounded-md overflow-hidden">
                  {([
                    { key: "desktop" as PreviewSize, icon: <Monitor className="size-3.5" /> },
                    { key: "tablet" as PreviewSize, icon: <Tablet className="size-3.5" /> },
                    { key: "mobile" as PreviewSize, icon: <Smartphone className="size-3.5" /> },
                  ]).map((item) => (
                    <button
                      key={item.key}
                      onClick={() => setPreviewSize(item.key)}
                      className={`px-2.5 py-1.5 text-xs transition-colors ${
                        previewSize === item.key
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {item.icon}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setFullscreen(true)}
                  className="text-xs text-foreground font-medium underline underline-offset-2 hover:no-underline"
                >
                  Full screen
                </button>
                <button
                  onClick={() => downloadHtml(html)}
                  className="flex items-center gap-1 text-xs text-foreground font-medium hover:text-foreground/70 transition-colors"
                >
                  <Download className="size-3.5" />
                  Download
                </button>
              </div>
            </div>

            {/* Preview */}
            <div className="border border-border rounded-lg overflow-hidden bg-muted/30 flex justify-center p-4">
              <iframe
                srcDoc={html}
                style={{ width: PREVIEW_WIDTHS[previewSize], maxWidth: "100%" }}
                className="h-[600px] border border-border rounded-md bg-white transition-all duration-300"
                sandbox="allow-scripts"
                title="Generated landing page preview"
              />
            </div>

            {/* Fullscreen overlay */}
            {fullscreen && (
              <div className="fixed inset-0 z-50 bg-background">
                <div className="absolute top-4 right-4 z-10">
                  <button
                    onClick={() => setFullscreen(false)}
                    className="flex items-center gap-1.5 bg-foreground text-background px-3 py-1.5 rounded-md text-sm font-medium hover:bg-foreground/90"
                  >
                    <X className="size-4" /> Close
                  </button>
                </div>
                <iframe
                  srcDoc={html}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts"
                  title="Generated landing page full screen"
                />
              </div>
            )}
          </div>
        );
      }}
    />
  );
}
