"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2,
  Plus,
  Trash2,
  Search,
  Eye,
  Pencil,
  Sparkles,
  BookOpen,
  Globe,
} from "lucide-react";
import type { Project } from "@/lib/types";

interface KBArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  published: boolean;
  created_at: string;
  updated_at: string;
}

interface KnowledgeBasePanelProps {
  project: Project;
}

export function KnowledgeBasePanel({ project }: KnowledgeBasePanelProps) {
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");

  const selectedArticle = articles.find((a) => a.id === selectedId) ?? null;

  // ── Fetch articles ──────────────────────────────────────────────

  const fetchArticles = useCallback(async () => {
    setIsLoading(true);
    try {
      const url = searchQuery
        ? `/api/projects/knowledge-base?projectId=${project.id}&search=${encodeURIComponent(searchQuery)}`
        : `/api/projects/knowledge-base?projectId=${project.id}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setArticles(data.articles ?? []);
      }
    } finally {
      setIsLoading(false);
    }
  }, [project.id, searchQuery]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  // ── Select article ─────────────────────────────────────────────

  const selectArticle = (article: KBArticle) => {
    setSelectedId(article.id);
    setEditTitle(article.title);
    setEditContent(article.content);
    setEditCategory(article.category);
    setActiveTab("edit");
  };

  // ── Create article ─────────────────────────────────────────────

  const handleCreate = async () => {
    try {
      const res = await fetch("/api/projects/knowledge-base", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          title: "Untitled Article",
          content: "",
          category: "general",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setArticles((prev) => [data.article, ...prev]);
        selectArticle(data.article);
      }
    } catch {
      // Silently fail — UI will show stale state
    }
  };

  // ── Save article ───────────────────────────────────────────────

  const handleSave = async () => {
    if (!selectedId) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/projects/knowledge-base", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId: selectedId,
          title: editTitle,
          content: editContent,
          category: editCategory,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setArticles((prev) =>
          prev.map((a) => (a.id === selectedId ? data.article : a)),
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  // ── Toggle publish ─────────────────────────────────────────────

  const handleTogglePublish = async () => {
    if (!selectedArticle) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/projects/knowledge-base", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId: selectedArticle.id,
          published: !selectedArticle.published,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setArticles((prev) =>
          prev.map((a) => (a.id === selectedArticle.id ? data.article : a)),
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  // ── Delete article ─────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch("/api/projects/knowledge-base", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: id }),
      });
      if (res.ok) {
        setArticles((prev) => prev.filter((a) => a.id !== id));
        if (selectedId === id) {
          setSelectedId(null);
          setEditTitle("");
          setEditContent("");
          setEditCategory("");
        }
      }
    } catch {
      // Silently fail
    }
  };

  // ── Auto-generate ──────────────────────────────────────────────

  const handleAutoGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/projects/knowledge-base/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      if (res.ok) {
        await fetchArticles();
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Unique categories ─────────────────────────────────────────

  const categories = Array.from(new Set(articles.map((a) => a.category)));

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="flex h-full gap-4">
      {/* Sidebar — article list */}
      <div className="w-72 shrink-0 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Knowledge Base</h2>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search articles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={handleCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            New
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-xs"
            onClick={handleAutoGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1" />
            )}
            Generate
          </Button>
        </div>

        {/* Category badges */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {categories.map((cat) => (
              <Badge key={cat} variant="secondary" className="text-[10px]">
                {cat}
              </Badge>
            ))}
          </div>
        )}

        {/* Article list */}
        <div className="flex-1 overflow-y-auto space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : articles.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              No articles yet. Create one or auto-generate from your company context.
            </p>
          ) : (
            articles.map((article) => (
              <button
                key={article.id}
                onClick={() => selectArticle(article)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  selectedId === article.id
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-xs">
                    {article.title || "Untitled"}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {article.published && (
                      <Globe className="h-3 w-3 text-emerald-500" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(article.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {article.category}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Editor — right side */}
      <div className="flex-1 min-w-0">
        {!selectedArticle ? (
          <Card className="h-full flex items-center justify-center">
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Select an article to edit, or create a new one.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 flex items-center gap-3">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Article title"
                    className="text-base font-semibold h-9"
                  />
                  <Input
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    placeholder="Category"
                    className="w-32 h-9 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant={selectedArticle.published ? "default" : "outline"}
                    onClick={handleTogglePublish}
                    disabled={isSaving}
                    className="text-xs"
                  >
                    <Globe className="h-3.5 w-3.5 mr-1" />
                    {selectedArticle.published ? "Published" : "Publish"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="text-xs"
                  >
                    {isSaving ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : null}
                    Save
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0">
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as "edit" | "preview")}
                className="flex-1 flex flex-col"
              >
                <TabsList className="w-fit mb-3">
                  <TabsTrigger value="edit" className="text-xs gap-1.5">
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="text-xs gap-1.5">
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="edit" className="flex-1 mt-0">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="Write your article in Markdown..."
                    className="w-full h-full min-h-[400px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </TabsContent>

                <TabsContent value="preview" className="flex-1 mt-0 overflow-y-auto">
                  <div className="prose prose-sm dark:prose-invert max-w-none p-4 rounded-md border bg-muted/30 min-h-[400px]">
                    {editContent ? (
                      <div
                        dangerouslySetInnerHTML={{
                          __html: simpleMarkdown(editContent),
                        }}
                      />
                    ) : (
                      <p className="text-muted-foreground">Nothing to preview.</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Simple markdown-to-HTML (no external dep) ────────────────────────

function simpleMarkdown(md: string): string {
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*<\/li>)/, "<ul>$1</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>");
}
