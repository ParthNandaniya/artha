"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { X, Sparkles } from "lucide-react";
import { AiGenerateButton } from "@/components/ai-enhancer";
import { useInlineAction } from "@/hooks/use-inline-action";
import type {
  Project,
  Document,
  ResearchSuggestion,
  ResearchTagRecord,
} from "@/lib/types";

interface ResearchPanelProps {
  project: Project;
  documents: Document[];
  researchTags: ResearchTagRecord[];
  onRunResearch: (prompt: string, tag: string) => void;
  onViewDocument: (id: string) => void;
  onCreateTag: (tag: string, label: string, description: string) => void;
  onDeleteTag: (tagId: string) => void;
  onBuyCredits: () => void;
}

const DEFAULT_SUGGESTIONS: ResearchSuggestion[] = [
  {
    id: "ads",
    tag: "ads_research",
    title: "Ads Research",
    description:
      "Analyze ad platforms, budget recommendations, audience targeting, and ROI projections",
    icon: "📢",
  },
  {
    id: "customer",
    tag: "customer_research",
    title: "Customer Research",
    description:
      "Define ICP, pain points, buying triggers, and customer journey mapping",
    icon: "👥",
  },
  {
    id: "audience",
    tag: "target_audience",
    title: "Target Audience",
    description:
      "Demographics, psychographics, behavior patterns, and audience segmentation",
    icon: "📊",
  },
  {
    id: "competitor",
    tag: "competitor_analysis",
    title: "Competitor Analysis",
    description:
      "Competitor breakdown, SWOT analysis, market positioning, and feature comparison",
    icon: "⚔️",
  },
  {
    id: "trends",
    tag: "market_trends",
    title: "Market Trends",
    description:
      "Growing market indicators, trend analysis, and opportunity sizing",
    icon: "📈",
  },
  {
    id: "pricing",
    tag: "pricing_research",
    title: "Pricing Strategy",
    description:
      "Competitor pricing, willingness-to-pay analysis, and pricing model recommendations",
    icon: "💰",
  },
  {
    id: "content",
    tag: "content_research",
    title: "Content Strategy",
    description:
      "Content gaps, topic clusters, channel recommendations, and content calendar",
    icon: "✍️",
  },
];

const RESEARCH_DOC_TYPES = new Set([
  "market_research",
  "lead_research",
  "customer_research",
  "ads_research",
  "target_audience",
  "competitor_analysis",
  "market_trends",
  "pricing_research",
  "content_research",
  "research",
]);

const tagColors: Record<string, string> = {
  ads_research: "bg-orange-500/10 text-orange-600",
  lead_research: "bg-blue-500/10 text-blue-600",
  customer_research: "bg-purple-500/10 text-purple-600",
  target_audience: "bg-green-500/10 text-green-600",
  competitor_analysis: "bg-red-500/10 text-red-600",
  market_trends: "bg-emerald-500/10 text-emerald-600",
  pricing_research: "bg-amber-500/10 text-amber-600",
  content_research: "bg-indigo-500/10 text-indigo-600",
  market_research: "bg-cyan-500/10 text-cyan-600",
  research: "bg-gray-500/10 text-gray-600",
};

export function ResearchPanel({
  project,
  documents,
  researchTags,
  onRunResearch,
  onViewDocument,
  onCreateTag,
  onDeleteTag,
  onBuyCredits,
}: ResearchPanelProps) {
  const [showResearchModal, setShowResearchModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [researchPrompt, setResearchPrompt] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [newTagLabel, setNewTagLabel] = useState("");
  const [newTagDescription, setNewTagDescription] = useState("");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [sentSuggestionId, setSentSuggestionId] = useState<string | null>(null);

  // Dismissed default suggestions (persisted per project in localStorage)
  const dismissKey = `research_dismissed_${project.id}`;
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem(dismissKey);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  function dismissSuggestion(id: string) {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem(dismissKey, JSON.stringify([...next]));
      return next;
    });
  }

  const visibleSuggestions = DEFAULT_SUGGESTIONS.filter((s) => !dismissedIds.has(s.id));

  const researchDocs = documents.filter(
    (d) => RESEARCH_DOC_TYPES.has(d.type) || isCustomResearchTag(d.type)
  );

  function isCustomResearchTag(type: string): boolean {
    return researchTags.some((t) => t.tag === type);
  }

  const allTags = [
    ...DEFAULT_SUGGESTIONS.map((s) => s.tag),
    ...researchTags.map((t) => t.tag),
  ];

  const filteredDocs =
    filterTag === "all"
      ? researchDocs
      : researchDocs.filter((d) => d.type === filterTag);

  const hasCredits = project.task_credits > 0;

  // Deep Dive: AI generates a research prompt and title for a tag, then auto-runs it
  const { execute: fetchDeepDive, loading: deepDiveLoading } = useInlineAction<{
    title: string;
    prompt: string;
  }>({
    projectId: project.id,
    action: "deep_dive_research",
    onSuccess: (result) => {
      if (result.prompt) {
        onRunResearch(result.prompt, filterTag !== "all" ? filterTag : "research");
      }
    },
  });

  function handleRunSuggestion(suggestion: ResearchSuggestion) {
    onRunResearch(
      `Run ${suggestion.title.toLowerCase()} for ${project.name}: ${suggestion.description}`,
      suggestion.tag
    );
    setSentSuggestionId(suggestion.id);
    setTimeout(() => setSentSuggestionId(null), 2000);
  }

  function handleSubmitResearch() {
    if (!researchPrompt.trim()) return;
    onRunResearch(researchPrompt, selectedTag || "research");
    setResearchPrompt("");
    setSelectedTag("");
    setShowResearchModal(false);
  }

  function handleCreateTag() {
    if (!newTagName.trim() || !newTagLabel.trim()) return;
    onCreateTag(
      newTagName.toLowerCase().replace(/\s+/g, "_"),
      newTagLabel,
      newTagDescription
    );
    setNewTagName("");
    setNewTagLabel("");
    setNewTagDescription("");
    setShowTagModal(false);
  }

  function getTagColor(tag: string): string {
    if (tagColors[tag]) return tagColors[tag];
    const customTag = researchTags.find((t) => t.tag === tag);
    if (customTag?.color) return customTag.color;
    return "bg-gray-500/10 text-gray-600";
  }

  const filteredTags = allTags.filter((tag) => researchDocs.some((d) => d.type === tag));

  return (
    <div className="p-4 sm:p-6 max-w-5xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Research</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Run research to get insights, analytics, and actionable data for{" "}
            {project.name}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchDeepDive({
              topic: filterTag !== "all" ? filterTag.replace(/_/g, " ") : "general market and business",
              existingResearchCount: String(researchDocs.length),
            })}
            disabled={deepDiveLoading || !hasCredits}
          >
            {deepDiveLoading ? (
              <span className="mr-1.5 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            {deepDiveLoading ? "Generating..." : "Deep Dive"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowTagModal(true)}>
            + Custom Tag
          </Button>
          <Button size="sm" onClick={() => setShowResearchModal(true)}>
            + New Research
          </Button>
        </div>
      </div>

      {!hasCredits && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">No credits remaining</p>
              <p className="text-xs text-muted-foreground">
                {project.subscription_status === "active"
                  ? "Your credits are exhausted. Wait for renewal or buy a credit pack."
                  : "Subscribe or buy a one-time credit pack to run research."}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onBuyCredits}>
              Buy Credits
            </Button>
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">
          Suggested Research
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {visibleSuggestions.map((suggestion) => (
            <Card
              key={suggestion.id}
              className={`relative cursor-pointer transition-all hover:shadow-md hover:border-primary/30 group ${
                !hasCredits ? "opacity-60" : ""
              } ${sentSuggestionId === suggestion.id ? "border-primary/50 bg-primary/5" : ""}`}
              onClick={() => hasCredits && handleRunSuggestion(suggestion)}
            >
              <button
                className="absolute top-2 right-2 p-0.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-muted transition-all z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  dismissSuggestion(suggestion.id);
                }}
                title="Remove suggestion"
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{suggestion.icon}</span>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-medium">{suggestion.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {suggestion.description}
                    </p>
                    {sentSuggestionId === suggestion.id ? (
                      <Badge className="mt-2 text-[10px] bg-primary/10 text-primary" variant="secondary">
                        Sent to AI
                      </Badge>
                    ) : (
                      <Badge
                        className={`mt-2 text-[10px] ${getTagColor(suggestion.tag)}`}
                        variant="secondary"
                      >
                        {suggestion.tag.replace(/_/g, " ")}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {researchTags.map((tag) => (
            <Card
              key={tag.id}
              className={`relative cursor-pointer transition-all hover:shadow-md hover:border-primary/30 group ${
                !hasCredits ? "opacity-60" : ""
              } ${sentSuggestionId === tag.id ? "border-primary/50 bg-primary/5" : ""}`}
              onClick={() => {
                if (!hasCredits) return;
                onRunResearch(
                  `Run ${tag.label.toLowerCase()} research for ${project.name}`,
                  tag.tag
                );
                setSentSuggestionId(tag.id);
                setTimeout(() => setSentSuggestionId(null), 2000);
              }}
            >
              <button
                className="absolute top-2 right-2 p-0.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-muted transition-all z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteTag(tag.id);
                }}
                title="Remove tag"
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🔬</span>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-medium">{tag.label}</h4>
                    {tag.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {tag.description}
                      </p>
                    )}
                    {sentSuggestionId === tag.id ? (
                      <Badge className="mt-2 text-[10px] bg-primary/10 text-primary" variant="secondary">
                        Sent to AI
                      </Badge>
                    ) : (
                      <Badge
                        className={`mt-2 text-[10px] ${getTagColor(tag.tag)}`}
                        variant="secondary"
                      >
                        {tag.tag.replace(/_/g, " ")}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Research History ({researchDocs.length})
          </h3>
          {
            filteredTags.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                <Button
                  variant={filterTag === "all" ? "default" : "ghost"}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setFilterTag("all")}
                >
                  All
                </Button>
                {filteredTags
                  .map((tag) => (
                    <Button
                      key={tag}
                      variant={filterTag === tag ? "default" : "ghost"}
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => setFilterTag(tag)}
                    >
                      {tag.replace(/_/g, " ")}
                    </Button>
                  ))}
              </div>
            )
          }
        </div>

        {filteredDocs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No research documents yet. Click a suggestion above or create custom
            research to get started.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredDocs.map((doc) => (
                <Card
                  key={doc.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => onViewDocument(doc.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-medium truncate">
                            {doc.title}
                          </h4>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            v{doc.version}
                          </Badge>
                        </div>
                        <Badge
                          className={`text-[10px] mb-2 ${getTagColor(doc.type)}`}
                          variant="secondary"
                        >
                          {doc.type.replace(/_/g, " ")}
                        </Badge>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {getContentPreview(doc.content)}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-2">
                          {new Date(doc.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        )}
      </div>

      <Dialog open={showResearchModal} onOpenChange={setShowResearchModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Research</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="research-prompt">What do you want to research?</Label>
                <AiGenerateButton
                  projectId={project.id}
                  formType="research"
                  currentValues={{ prompt: researchPrompt }}
                  context={{ tag: selectedTag }}
                  onResult={(values) => {
                    if (values.prompt) setResearchPrompt(values.prompt);
                  }}
                  className=""
                />
              </div>
              <Textarea
                id="research-prompt"
                placeholder="e.g., Find potential investors in the AI/SaaS space who have funded seed-stage companies..."
                value={researchPrompt}
                onChange={(e) => setResearchPrompt(e.target.value)}
                className="mt-1.5 min-h-[100px]"
              />
            </div>
            <div>
              <Label htmlFor="research-tag">Tag (optional)</Label>
              <div className="flex gap-2 flex-wrap mt-1.5">
                <Button
                  variant={selectedTag === "" ? "default" : "outline"}
                  size="sm"
                  className="text-xs"
                  onClick={() => setSelectedTag("")}
                >
                  Auto-categorize
                </Button>
                {DEFAULT_SUGGESTIONS.map((s) => (
                  <Button
                    key={s.tag}
                    variant={selectedTag === s.tag ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => setSelectedTag(s.tag)}
                  >
                    {s.icon} {s.title}
                  </Button>
                ))}
                {researchTags.map((t) => (
                  <Button
                    key={t.tag}
                    variant={selectedTag === t.tag ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => setSelectedTag(t.tag)}
                  >
                    🔬 {t.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowResearchModal(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitResearch}
              disabled={!researchPrompt.trim() || !hasCredits}
            >
              {hasCredits ? "Run Research (1 credit)" : "No Credits"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTagModal} onOpenChange={setShowTagModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Custom Research Tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="tag-label">Tag Label</Label>
                <AiGenerateButton
                  projectId={project.id}
                  formType="research_tag"
                  currentValues={{ label: newTagLabel, description: newTagDescription }}
                  onResult={(values) => {
                    if (values.label) {
                      setNewTagLabel(values.label);
                      setNewTagName(values.label.toLowerCase().replace(/\s+/g, "_"));
                    }
                    if (values.description) setNewTagDescription(values.description);
                  }}
                  className=""
                />
              </div>
              <Input
                id="tag-label"
                placeholder="e.g., Investor Research"
                value={newTagLabel}
                onChange={(e) => {
                  setNewTagLabel(e.target.value);
                  setNewTagName(
                    e.target.value.toLowerCase().replace(/\s+/g, "_")
                  );
                }}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="tag-name">Tag ID</Label>
              <Input
                id="tag-name"
                placeholder="investor_research"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Used internally for categorization
              </p>
            </div>
            <div>
              <Label htmlFor="tag-desc">Description (optional)</Label>
              <Textarea
                id="tag-desc"
                placeholder="What kind of research does this tag cover?"
                value={newTagDescription}
                onChange={(e) => setNewTagDescription(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTagModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateTag}
              disabled={!newTagName.trim() || !newTagLabel.trim()}
            >
              Create Tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getContentPreview(content: string): string {
  const lines = content.split("\n").filter((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith("#") && !trimmed.startsWith("|") && !trimmed.startsWith("---");
  });
  const preview = lines.slice(0, 3).join(" ").replace(/\*\*/g, "").replace(/\*/g, "").trim();
  return preview.length > 160 ? `${preview.slice(0, 160)}...` : preview || "No preview available";
}
