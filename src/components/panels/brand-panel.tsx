"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Sparkles,
  Check,
  RefreshCw,
  Palette,
  Type,
  Download,
} from "lucide-react";
import type { Project } from "@/lib/types";
import type { LogoStyle, LogoVariant } from "@/lib/ai/logo/generate-logo";

interface BrandPanelProps {
  project: Project;
  onRefresh: () => void | Promise<void>;
}

const LOGO_STYLES: { value: LogoStyle; label: string; desc: string }[] = [
  { value: "minimal", label: "Minimal", desc: "Clean, geometric, flat" },
  { value: "modern", label: "Modern", desc: "Bold, sleek, gradients" },
  { value: "tech", label: "Tech", desc: "Futuristic, digital" },
  { value: "playful", label: "Playful", desc: "Friendly, rounded, warm" },
  { value: "corporate", label: "Corporate", desc: "Professional, classic" },
  { value: "organic", label: "Organic", desc: "Natural, flowing curves" },
];

export function BrandPanel({ project, onRefresh }: BrandPanelProps) {
  const [generating, setGenerating] = useState(false);
  const projectAny = project as unknown as Record<string, unknown>;
  const [variants, setVariants] = useState<LogoVariant[]>(
    () => ((projectAny.brand_kit as Record<string, unknown>)?.logoVariants as LogoVariant[]) || []
  );
  const [selectedUrl, setSelectedUrl] = useState<string | null>(
    () => (projectAny.logo_url as string) || null
  );
  const [selecting, setSelecting] = useState(false);
  const [regeneratingStyle, setRegeneratingStyle] = useState<string | null>(null);

  const primaryColor = "#6366f1"; // TODO: extract from site theme
  const accentColor = "#f59e0b";

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/projects/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          action: "generate",
          primaryColor,
          accentColor,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setVariants(data.variants || []);
    } catch (err) {
      console.error("Logo generation failed:", err);
    } finally {
      setGenerating(false);
    }
  }, [project.id]);

  const handleSelect = useCallback(
    async (logoUrl: string) => {
      setSelecting(true);
      try {
        const res = await fetch("/api/projects/logo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: project.id,
            action: "select",
            logoUrl,
          }),
        });
        if (!res.ok) throw new Error("Selection failed");
        setSelectedUrl(logoUrl);
        await onRefresh();
      } catch (err) {
        console.error("Logo selection failed:", err);
      } finally {
        setSelecting(false);
      }
    },
    [project.id, onRefresh]
  );

  const handleRegenerateSingle = useCallback(
    async (style: LogoStyle) => {
      setRegeneratingStyle(style);
      try {
        const res = await fetch("/api/projects/logo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: project.id,
            action: "regenerate-single",
            style,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (data.variant) {
          setVariants((prev) => {
            const filtered = prev.filter((v) => v.style !== style);
            return [...filtered, data.variant];
          });
        }
      } catch (err) {
        console.error("Single regeneration failed:", err);
      } finally {
        setRegeneratingStyle(null);
      }
    },
    [project.id]
  );

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Brand Kit
          </h2>
          <p className="text-sm text-muted-foreground">
            Logo, colors, and typography for your brand.
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              Generating...
            </>
          ) : variants.length > 0 ? (
            <>
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Regenerate All
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-1.5" />
              Generate Logos
            </>
          )}
        </Button>
      </div>

      {/* Current Logo */}
      {selectedUrl && (
        <div className="flex items-center gap-4 p-4 rounded-xl border bg-card">
          <img
            src={selectedUrl}
            alt="Company logo"
            className="w-16 h-16 rounded-xl object-contain bg-white border"
          />
          <div>
            <p className="text-sm font-medium">Current Logo</p>
            <p className="text-xs text-muted-foreground">Used in navbar and favicon</p>
          </div>
          <Badge variant="secondary" className="ml-auto">
            <Check className="w-3 h-3 mr-1" /> Active
          </Badge>
        </div>
      )}

      {/* Logo Variants */}
      {variants.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-3">Logo Variants</h3>
          <div className="grid grid-cols-2 gap-4">
            {variants.map((variant) => {
              const styleInfo = LOGO_STYLES.find((s) => s.value === variant.style);
              const isSelected = variant.imageUrl === selectedUrl;
              const isRegenerating = regeneratingStyle === variant.style;

              return (
                <div
                  key={variant.style}
                  className={`relative group rounded-xl border-2 overflow-hidden transition-all cursor-pointer hover:shadow-md ${
                    isSelected
                      ? "border-primary shadow-md"
                      : "border-transparent hover:border-muted-foreground/20"
                  }`}
                  onClick={() => !selecting && handleSelect(variant.imageUrl)}
                >
                  <div className="aspect-square bg-white flex items-center justify-center p-4">
                    {isRegenerating ? (
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    ) : (
                      <img
                        src={variant.imageUrl}
                        alt={`${variant.style} logo`}
                        className="w-full h-full object-contain"
                      />
                    )}
                  </div>
                  <div className="p-3 bg-card">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium">{styleInfo?.label || variant.style}</p>
                        <p className="text-xs text-muted-foreground">{styleInfo?.desc}</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRegenerateSingle(variant.style);
                        }}
                        disabled={isRegenerating}
                        className="p-1.5 rounded-md hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Regenerate this style"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? "animate-spin" : ""}`} />
                      </button>
                    </div>
                    {isSelected && (
                      <Badge variant="default" className="mt-2 text-xs">
                        <Check className="w-3 h-3 mr-1" /> Selected
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Color Palette */}
      <div>
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Palette className="w-4 h-4" /> Color Palette
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Primary", color: primaryColor },
            { label: "Accent", color: accentColor },
            { label: "Background", color: "#ffffff" },
          ].map((c) => (
            <div key={c.label} className="text-center">
              <div
                className="w-full aspect-square rounded-xl border mb-2"
                style={{ backgroundColor: c.color }}
              />
              <p className="text-xs font-medium">{c.label}</p>
              <p className="text-xs text-muted-foreground font-mono">{c.color}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Typography */}
      <div>
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Type className="w-4 h-4" /> Typography
        </h3>
        <div className="p-4 rounded-xl border bg-card space-y-3">
          <div>
            <p className="text-2xl font-bold">Inter Bold</p>
            <p className="text-xs text-muted-foreground">Primary headings</p>
          </div>
          <div>
            <p className="text-base">Inter Regular</p>
            <p className="text-xs text-muted-foreground">Body text</p>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {variants.length === 0 && !generating && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Sparkles className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-sm font-medium mb-1">No logos generated yet</h3>
          <p className="text-xs text-muted-foreground mb-4 max-w-xs">
            Click &quot;Generate Logos&quot; to create AI-powered logo variants for your brand.
          </p>
        </div>
      )}
    </div>
  );
}
