"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Send, X } from "lucide-react";
import { AiGenerateButton } from "@/components/ai-enhancer";

interface OutreachEmail {
  to: string;
  toName?: string;
  company?: string;
  role?: string;
  subject: string;
  body: string;
}

interface OutreachConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
  projectId: string;
  emails: OutreachEmail[];
  fromAddress: string;
  sendDisabledReason?: string | null;
  onConfirm: (emails: OutreachEmail[]) => Promise<void>;
  onCancel: () => Promise<void>;
}

export function OutreachConfirmationModal({
  isOpen,
  onClose,
  projectId,
  emails: initialEmails,
  fromAddress,
  sendDisabledReason,
  onConfirm,
  onCancel,
}: OutreachConfirmationModalProps) {
  const [emails, setEmails] = useState<OutreachEmail[]>(initialEmails);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEmails(initialEmails);
    setExpandedIndex(initialEmails.length > 0 ? 0 : null);
    setError(null);
  }, [initialEmails, isOpen]);

  function updateEmail(index: number, field: keyof OutreachEmail, value: string) {
    setEmails((prev) =>
      prev.map((e, i) => (i === index ? { ...e, [field]: value } : e))
    );
  }

  function removeEmail(index: number) {
    setEmails((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSendAll() {
    if (emails.length === 0 || sendDisabledReason) return;
    setSending(true);
    setError(null);
    try {
      await onConfirm(emails);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send emails.");
    } finally {
      setSending(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      await onCancel();
      onClose();
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Review outreach emails</DialogTitle>
          <DialogDescription>
            {emails.length} email{emails.length !== 1 ? "s" : ""} ready to review.
            {sendDisabledReason
              ? " Sending stays locked until email setup is complete."
              : " Review, edit, or remove before sending."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-3 py-2">
            {emails.map((email, index) => (
              <Card key={index} className="overflow-hidden">
                <CardContent className="p-0">
                  <button
                    className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
                    onClick={() =>
                      setExpandedIndex(expandedIndex === index ? null : index)
                    }
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {email.toName || email.to}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {email.subject}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {email.company && (
                        <Badge variant="outline" className="text-[10px]">
                          {email.company}
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeEmail(index);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                      {expandedIndex === index ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {expandedIndex === index && (
                    <div className="px-3 pb-3 space-y-2 border-t">
                      <div className="pt-2 flex items-center justify-end">
                        <AiGenerateButton
                          projectId={projectId}
                          formType="outreach"
                          currentValues={{
                            subject: email.subject,
                            body: email.body,
                          }}
                          context={{
                            recipientName: email.toName || "",
                            recipientCompany: email.company || "",
                            recipientRole: email.role || "",
                            recipientEmail: email.to,
                          }}
                          onResult={(values) => {
                            if (values.subject) updateEmail(index, "subject", values.subject);
                            if (values.body) updateEmail(index, "body", values.body);
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-muted-foreground uppercase">
                          To
                        </label>
                        <Input
                          value={email.to}
                          onChange={(e) =>
                            updateEmail(index, "to", e.target.value)
                          }
                          className="mt-0.5 h-8 text-sm"
                        />
                        {email.toName && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {email.toName}
                            {email.role ? `, ${email.role}` : ""}
                            {email.company ? ` at ${email.company}` : ""}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-muted-foreground uppercase">
                          Subject
                        </label>
                        <Input
                          value={email.subject}
                          onChange={(e) =>
                            updateEmail(index, "subject", e.target.value)
                          }
                          className="mt-0.5 h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-muted-foreground uppercase">
                          Body
                        </label>
                        <Textarea
                          value={email.body}
                          onChange={(e) =>
                            updateEmail(index, "body", e.target.value)
                          }
                          className="mt-0.5 min-h-[120px] text-sm"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between pt-3 border-t">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Sending from:{" "}
              <span className="font-mono">{fromAddress}</span>
            </p>
            {sendDisabledReason && (
              <p className="text-xs text-muted-foreground">{sendDisabledReason}</p>
            )}
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={sending || cancelling}
            >
              {cancelling ? "Cancelling..." : "Cancel"}
            </Button>
            <Button
              onClick={handleSendAll}
              disabled={sending || cancelling || emails.length === 0 || Boolean(sendDisabledReason)}
            >
              {sending ? (
                "Sending..."
              ) : (
                <>
                  <Send className="h-4 w-4 mr-1" />
                  Send {emails.length} email{emails.length !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
