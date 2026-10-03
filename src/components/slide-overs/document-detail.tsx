"use client";

import { useState, useEffect, startTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUpdateDocument } from "@/hooks/use-documents";
import type { Document } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Pencil, Loader2 } from "lucide-react";

interface DocumentDetailProps {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export function DocumentDetail({ document, isOpen, onClose, projectId }: DocumentDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [renderedDoc, setRenderedDoc] = useState<Document | null>(null);
  const updateDoc = useUpdateDocument(projectId);

  useEffect(() => {
    if (!isOpen) {
      setIsEditing(false);
      setRenderedDoc(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && document) {
      startTransition(() => setRenderedDoc(document));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, document?.id, document?.version]);

  const updatedLabel = document
    ? new Date(document.updated_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const handleStartEdit = () => {
    if (!document) return;
    setEditContent(document.content);
    setEditTitle(document.title);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleSave = () => {
    if (!document) return;
    const trimmedContent = editContent.trim();
    const trimmedTitle = editTitle.trim();
    if (!trimmedContent || !trimmedTitle) return;

    updateDoc.mutate(
      { id: document.id, title: trimmedTitle, content: trimmedContent },
      { onSuccess: () => setIsEditing(false) },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[100dvh] sm:h-[84vh] w-full sm:w-[min(78vw,1080px)] max-w-full sm:max-w-[min(78vw,1080px)] flex-col gap-0 overflow-hidden p-0 rounded-none sm:rounded-lg">
        {document ? (
          <>
            <div className="border-b bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_30%),linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,0.96))]">
              <DialogHeader className="space-y-3 px-4 sm:px-6 py-4 sm:py-5 pr-12 sm:pr-14 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.18em]">
                    {document.type.replace(/_/g, " ")}
                  </Badge>
                  <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px]">
                    v{document.version}
                  </Badge>
                  {updatedLabel && (
                    <span className="text-xs text-muted-foreground">
                      Updated {updatedLabel}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <Button variant="ghost" size="sm" onClick={handleCancel} disabled={updateDoc.isPending}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleSave}
                          disabled={updateDoc.isPending || !editContent.trim() || !editTitle.trim()}
                        >
                          {updateDoc.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                          Save
                        </Button>
                      </>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={handleStartEdit}>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="text-xl font-semibold"
                    placeholder="Document title"
                  />
                ) : (
                  <DialogTitle className="max-w-5xl text-xl leading-tight sm:text-2xl">
                    {document.title}
                  </DialogTitle>
                )}
              </DialogHeader>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="px-4 sm:px-6 py-4 sm:py-6">
                {isEditing ? (
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="min-h-[60vh] font-mono text-sm leading-relaxed"
                    placeholder="Document content (Markdown supported)"
                  />
                ) : !renderedDoc ? (
                  <div className="space-y-3 px-1">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className={`h-4 bg-muted rounded animate-pulse ${i % 3 === 2 ? "w-2/3" : "w-full"}`} />
                    ))}
                  </div>
                ) : (
                  <Card className="overflow-hidden border-slate-200/80 shadow-none">
                    <CardContent className="px-5 py-6 sm:px-7">
                      <div className="prose prose-slate max-w-none">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: ({ className, ...props }) => (
                              <h1
                                className={cn("mb-6 text-3xl font-semibold tracking-tight text-slate-950", className)}
                                {...props}
                              />
                            ),
                            h2: ({ className, ...props }) => (
                              <h2
                                className={cn("mt-10 border-t border-slate-200 pt-6 text-xl font-semibold text-slate-950 first:mt-0 first:border-t-0 first:pt-0", className)}
                                {...props}
                              />
                            ),
                            h3: ({ className, ...props }) => (
                              <h3
                                className={cn("mt-6 text-base font-semibold text-slate-900", className)}
                                {...props}
                              />
                            ),
                            p: ({ className, ...props }) => (
                              <p
                                className={cn("text-[15px] leading-7 text-slate-700", className)}
                                {...props}
                              />
                            ),
                            ul: ({ className, ...props }) => (
                              <ul
                                className={cn("my-4 space-y-2 pl-5 text-[15px] text-slate-700", className)}
                                {...props}
                              />
                            ),
                            ol: ({ className, ...props }) => (
                              <ol
                                className={cn("my-4 space-y-2 pl-5 text-[15px] text-slate-700", className)}
                                {...props}
                              />
                            ),
                            li: ({ className, ...props }) => (
                              <li className={cn("pl-1 leading-7", className)} {...props} />
                            ),
                            strong: ({ className, ...props }) => (
                              <strong className={cn("font-semibold text-slate-950", className)} {...props} />
                            ),
                            blockquote: ({ className, ...props }) => (
                              <blockquote
                                className={cn("my-6 border-l-4 border-sky-200 bg-sky-50/60 px-4 py-3 text-slate-700", className)}
                                {...props}
                              />
                            ),
                            table: ({ className, ...props }) => (
                              <div className="my-6 overflow-x-auto rounded-xl border border-slate-200">
                                <table className={cn("w-full border-collapse text-left text-sm", className)} {...props} />
                              </div>
                            ),
                            thead: ({ className, ...props }) => (
                              <thead className={cn("bg-slate-50 text-slate-700", className)} {...props} />
                            ),
                            th: ({ className, ...props }) => (
                              <th className={cn("border-b border-slate-200 px-4 py-3 font-medium", className)} {...props} />
                            ),
                            td: ({ className, ...props }) => (
                              <td className={cn("border-b border-slate-100 px-4 py-3 align-top text-slate-700 last:border-b-0", className)} {...props} />
                            ),
                            hr: ({ className, ...props }) => (
                              <hr className={cn("my-8 border-slate-200", className)} {...props} />
                            ),
                          }}
                        >
                          {renderedDoc.content}
                        </ReactMarkdown>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            This document could not be loaded.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
