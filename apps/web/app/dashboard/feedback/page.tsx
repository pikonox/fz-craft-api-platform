"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bug, Heart, LifeBuoy, Lightbulb, MessageCircle, MessageSquareText, Send, Star } from "lucide-react";
import { FEEDBACK_TYPES } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Skeleton, Textarea } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";

type FeedbackType = (typeof FEEDBACK_TYPES)[number];
type FeedbackRow = { id: string; type: FeedbackType; rating: number | null; message: string; status: "new" | "reviewed"; createdAt: string };

const TYPE_META: Record<FeedbackType, { label: string; hint: string; icon: typeof Bug; placeholder: string }> = {
  idea: { label: "Idea", hint: "A feature or improvement", icon: Lightbulb, placeholder: "What would make the platform better for you?" },
  bug: { label: "Bug", hint: "Something isn't working", icon: Bug, placeholder: "What happened, what did you expect, and how can we reproduce it?" },
  praise: { label: "Praise", hint: "Something you like", icon: Heart, placeholder: "What's working well for you?" },
  other: { label: "Other", hint: "Anything else", icon: MessageCircle, placeholder: "Tell us what's on your mind." },
};

const KEY = ["feedback"] as const;
const MAX = 5000;

function Stars({ value, onChange, size = "md" }: { value: number | null; onChange?: (v: number | null) => void; size?: "sm" | "md" }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  const s = size === "sm" ? "size-3.5" : "size-6";
  if (!onChange) {
    return (
      <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} className={cn(s, n <= (value ?? 0) ? "fill-amber-400 text-amber-400" : "text-border-strong")} />
        ))}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(value === n ? null : n)}
          className="rounded-md p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          <Star className={cn(s, n <= shown ? "fill-amber-400 text-amber-400" : "text-border-strong")} />
        </button>
      ))}
    </div>
  );
}

export default function FeedbackPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: KEY, queryFn: () => api<{ feedback: FeedbackRow[] }>("/api/feedback").then((r) => r.feedback) });
  const [type, setType] = useState<FeedbackType>("idea");
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = message.trim();
  const ready = trimmed.length >= 3 && trimmed.length <= MAX;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) {
      setError("Tell us a bit more (at least 3 characters).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/api/feedback", { body: { type, rating, message: trimmed, page: page.trim() || undefined } });
      toast.success("Thanks! Your feedback was sent to the team.");
      setMessage("");
      setRating(null);
      setPage("");
      void qc.invalidateQueries({ queryKey: KEY });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const meta = TYPE_META[type];

  return (
    <div>
      <PageHeader title="Feedback" description="Ideas, bugs, praise — every message is read by the team and shapes what we build next." />

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader title="Send feedback" />
          <CardBody>
            <form onSubmit={submit} className="space-y-5">
              <div>
                <p className="mb-2 text-[13px] font-medium">What kind of feedback?</p>
                <div role="radiogroup" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {FEEDBACK_TYPES.map((t) => {
                    const m = TYPE_META[t];
                    const on = t === type;
                    return (
                      <button
                        key={t}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setType(t)}
                        className={cn(
                          "flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors",
                          on ? "border-accent bg-accent-soft" : "border-border bg-card hover:border-border-strong hover:bg-muted/50",
                        )}
                      >
                        <m.icon className={cn("size-[18px]", on ? "text-accent" : "text-muted-foreground")} />
                        <span className="text-[13.5px] font-medium">{m.label}</span>
                        <span className="text-[11.5px] leading-snug text-muted-foreground">{m.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Field
                label={
                  <span className="flex items-center justify-between">
                    Message
                    <span className={cn("text-xs font-normal tabular", message.length > MAX ? "text-danger" : "text-subtle-foreground")}>
                      {message.length.toLocaleString()}/{MAX.toLocaleString()}
                    </span>
                  </span>
                }
                htmlFor="fb-message"
                error={error}
              >
                <Textarea id="fb-message" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={meta.placeholder} aria-invalid={Boolean(error)} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Where? (optional)" htmlFor="fb-page" hint="A page or feature, e.g. Playground.">
                  <Input id="fb-page" value={page} maxLength={200} onChange={(e) => setPage(e.target.value)} placeholder="Playground, Image Studio, API…" />
                </Field>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium">How's your experience overall? (optional)</span>
                  <Stars value={rating} onChange={setRating} />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-subtle-foreground">
                  Need a reply or have a billing issue?{" "}
                  <Link href="/dashboard/support" className="text-accent underline-offset-2 hover:underline">
                    Open a support ticket
                  </Link>
                  .
                </p>
                <Button type="submit" variant="primary" disabled={busy || !trimmed}>
                  <Send /> {busy ? "Sending…" : "Send feedback"}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Your feedback" description={data?.length ? `${data.length} sent` : undefined} />
          {isLoading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : isError ? (
            <EmptyState
              title="Couldn't load your feedback"
              action={
                <Button size="sm" onClick={() => void refetch()}>
                  Try again
                </Button>
              }
            />
          ) : !data?.length ? (
            <EmptyState icon={<MessageSquareText />} title="Nothing sent yet" description="Your messages will show here, with a note once the team has reviewed them." />
          ) : (
            <ul className="scrollbar-thin max-h-[640px] divide-y divide-border overflow-y-auto">
              {data.map((f) => {
                const m = TYPE_META[f.type] ?? TYPE_META.other;
                return (
                  <li key={f.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="outline">
                        <m.icon className="size-3" /> {m.label}
                      </Badge>
                      {f.rating ? <Stars value={f.rating} size="sm" /> : null}
                      <span className="ml-auto text-xs text-subtle-foreground" title={formatDateTime(f.createdAt)}>
                        {relativeTime(f.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-4 whitespace-pre-line break-words text-[13.5px] text-foreground/90">{f.message}</p>
                    <div className="mt-2">
                      {f.status === "reviewed" ? (
                        <Badge tone="success" dot>
                          Reviewed by the team
                        </Badge>
                      ) : (
                        <Badge tone="neutral" dot>
                          Received
                        </Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-auto flex items-center gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground">
            <LifeBuoy className="size-3.5" /> Urgent problem with a payment or the API? Support replies faster.
          </div>
        </Card>
      </div>
    </div>
  );
}
