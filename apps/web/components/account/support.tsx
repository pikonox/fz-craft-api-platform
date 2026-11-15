"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TICKET_CATEGORIES } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/overlay";
import { Field, Input, NativeSelect, Textarea, type BadgeTone } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketMessage = { id: string; from: "user" | "admin"; authorName: string; body: string; createdAt: string };
export type Ticket = {
  id: string;
  number: number;
  subject: string;
  category: TicketCategory;
  status: "open" | "answered" | "closed";
  priority: "low" | "normal" | "high";
  lastActivityAt: string;
  createdAt: string;
  messageCount: number;
  lastMessage: { from: "user" | "admin"; body: string } | null;
  messages?: TicketMessage[];
};

export const TICKET_STATUS: Record<Ticket["status"], { label: string; tone: BadgeTone }> = {
  open: { label: "Open", tone: "info" },
  answered: { label: "Support replied", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
};

export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  billing: "Billing & payments",
  api: "API & models",
  account: "Account & login",
  bug: "Bug report",
  other: "Something else",
};

export function NewTicketDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: { subject?: string; category?: string; message?: string };
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<TicketCategory>("other");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ subject?: string; message?: string; form?: string }>({});

  useEffect(() => {
    if (!open) return;
    setSubject(initial?.subject ?? "");
    setCategory(TICKET_CATEGORIES.includes(initial?.category as TicketCategory) ? (initial!.category as TicketCategory) : "other");
    setMessage(initial?.message ?? "");
    setErrors({});
  }, [open, initial?.subject, initial?.category, initial?.message]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const next: typeof errors = {};
    if (subject.trim().length < 3) next.subject = "Add a short subject (at least 3 characters)";
    if (message.trim().length < 5) next.message = "Describe the issue so we can help";
    setErrors(next);
    if (next.subject || next.message) return;
    setBusy(true);
    try {
      const r = await api<{ ticket: Ticket }>("/api/support", { body: { subject: subject.trim(), category, message: message.trim() } });
      toast.success(`Ticket #${r.ticket.number} opened`, { description: "We'll reply here and notify you." });
      void qc.invalidateQueries({ queryKey: ["support"] });
      onOpenChange(false);
      router.push(`/dashboard/support/${r.ticket.id}`);
    } catch (err) {
      setErrors({ form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title="New support ticket"
      description="Tell us what's going on. Include IDs (payment, request or key name) if you have them."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => submit()}>
            Open ticket
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Subject" htmlFor="t-subject" error={errors.subject}>
          <Input id="t-subject" value={subject} maxLength={140} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. JazzCash payment not credited" autoFocus aria-invalid={Boolean(errors.subject)} />
        </Field>
        <Field label="Category" htmlFor="t-category">
          <NativeSelect id="t-category" value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)}>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Message" htmlFor="t-message" error={errors.message} hint="Please don't paste full API keys — the last 4 characters are enough.">
          <Textarea
            id="t-message"
            value={message}
            maxLength={10_000}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
            }}
            placeholder="What happened, what you expected, and any IDs that help us find it."
            className="min-h-36"
            aria-invalid={Boolean(errors.message)}
          />
        </Field>
        {errors.form && <p className="text-[13px] text-danger">{errors.form}</p>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
