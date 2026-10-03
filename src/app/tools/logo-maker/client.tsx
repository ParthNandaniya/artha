"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { FREE_TOOLS } from "@/lib/free-tools";
import { ToolPage } from "@/components/tools/tool-page";
import { Download } from "lucide-react";

const tool = FREE_TOOLS.find((t) => t.slug === "logo-maker")!;

async function downloadImage(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    window.open(url, "_blank");
  }
}

interface LogoVariant {
  style: string;
  imageUrl: string;
}

export function LogoMakerTool() {
  const [industry, setIndustry] = useState("");

  return (
    <ToolPage
      tool={tool}
      apiEndpoint="/api/tools/logo-maker"
      extraFields={
        <Input
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="Industry (optional)... e.g. FinTech, Health & Wellness, SaaS"
          className="text-base"
        />
      }
      inputOverride={(value, onChange) => (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={tool.placeholder}
          className="h-12 text-base"
        />
      )}
      buildBody={(prompt) => ({ companyName: prompt.trim(), industry: industry.trim() || undefined })}
      renderResult={(data) => {
        const variants = (data.variants as LogoVariant[]) || [];
        return (
          <div className="space-y-4">
            <h2 className="font-display text-lg font-bold text-foreground">Your Logos</h2>
            <div className="grid grid-cols-2 gap-4">
              {variants.map((v) => (
                <div key={v.style} className="border border-border rounded-lg p-4 flex flex-col items-center gap-3">
                  <img src={v.imageUrl} alt={`${v.style} logo`} className="w-40 h-40 object-contain rounded-lg" />
                  <span className="text-sm font-medium text-foreground/60 capitalize">{v.style}</span>
                  <button
                    onClick={() => downloadImage(v.imageUrl, `logo-${v.style}.png`)}
                    className="flex items-center gap-1.5 text-xs text-foreground font-medium hover:text-foreground/70 transition-colors"
                  >
                    <Download className="size-3.5" />
                    Download
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center">Logo images expire in ~1 hour. Sign up to save them permanently.</p>
          </div>
        );
      }}
    />
  );
}
