"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, Code, Globe, Lock, PanelLeft, Wrench, Plus, Settings, Sparkles, Table2, Sigma, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { Popover, PopoverContent, PopoverTrigger, Sheet, Tooltip } from "@/components/ui/overlay";
import { CAP_META } from "@/components/model-meta";
import { api, errorMessage, streamEvents } from "@/lib/api";
import { useMe, useModels } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/hooks";
import { ArtifactPanel } from "./artifact-panel";
import { Composer, type ComposerHandle } from "./composer";
import { GetCodeDialog } from "./get-code";
import { extractArtifacts } from "./markdown";
import { AssistantMessage, UserMessage } from "./message";
import { ModelPicker } from "./model-picker";
import { ParamsPanel } from "./params-panel";
import { ConversationSidebar } from "./sidebar";
import { DEFAULT_PARAMS, childrenOf, deepestLeaf, pathTo, type Artifact, type Attachment, type Conversation, type Msg, type Params, type ToolCall } from "./types";

const TMP_USER = "tmp-user";
const TMP_ASSISTANT = "tmp-assistant";

const emptyMsg = (over: Partial<Msg>): Msg => ({
  id: "",
  parentId: null,
  role: "assistant",
  content: "",
  attachments: [],
  reasoning: "",
  reasoningMs: 0,
  toolCalls: [],
  model: "",
  usage: { input: 0, output: 0, cached: 0, reasoning: 0 },
  latencyMs: 0,
  ttftMs: 0,
  status: "complete",
  error: "",
  feedback: "",
  createdAt: new Date().toISOString(),
  ...over,
});

const SUGGESTIONS = [
  { icon: LayoutTemplate, title: "Build a landing page", prompt: "Build a small landing page in HTML for a coffee shop called Bean There. Make it look modern." },
  { icon: Sigma, title: "Explain with math", prompt: "Explain the quadratic formula with an example. Use math notation." },
  { icon: Table2, title: "Compare in a table", prompt: "Compare REST, GraphQL and gRPC in a table: strengths, weaknesses, best use." },
  { icon: Globe, title: "Search the web", prompt: "Search the latest news about open-weight AI models and summarise it." },
];

export function Playground() {
  const search = useSearchParams();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: allModels } = useModels();
  const chatModels = useMemo(() => (allModels ?? []).filter((m) => m.type === "chat"), [allModels]);
  const { data: cfg } = useQuery({ queryKey: ["playground", "config"], queryFn: () => api<{ webSearch: boolean }>("/api/playground/config"), staleTime: 300_000 });
  const convs = useQuery({ queryKey: ["conversations"], queryFn: () => api<{ conversations: Conversation[] }>("/api/playground/conversations").then((r) => r.conversations) });

  const [convId, setConvId] = useState<string | null>(null);
  const [byId, setById] = useState<Record<string, Msg>>({});
  const [leafId, setLeafId] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [busy, setBusy] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [showList, setShowList] = useState(true);
  const [listSheet, setListSheet] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [artifactWide, setArtifactWide] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const composer = useRef<ComposerHandle>(null);
  const savingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMobile = useMediaQuery("(max-width: 767px)");
  const current = chatModels.find((m) => m.id === model);
  const path = useMemo(() => pathTo(leafId, byId), [leafId, byId]);

  // ── URL helpers ───────────────────────────────────────
  const setUrl = (id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("c", id);
    else url.searchParams.delete("c");
    url.searchParams.delete("model");
    window.history.replaceState(null, "", url.toString());
  };

  const defaultsFromUser = useCallback(
    (): Params => ({ ...DEFAULT_PARAMS, temperature: me?.user.defaults.temperature ?? DEFAULT_PARAMS.temperature, maxTokens: me?.user.defaults.maxTokens ?? DEFAULT_PARAMS.maxTokens }),
    [me],
  );

  // Pick a starting model: ?model= → user default → first available
  useEffect(() => {
    if (model || !chatModels.length) return;
    const wanted = [search.get("model"), me?.user.defaults.model].find((id) => id && chatModels.some((m) => m.id === id && m.available && m.status !== "maintenance"));
    setModel(wanted ?? chatModels.find((m) => m.available && m.status !== "maintenance")?.id ?? chatModels[0].id);
  }, [chatModels, me, model, search]);

  useEffect(() => {
    if (me && !convId && !Object.keys(byId).length) setParams(defaultsFromUser());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  // ── Load / switch conversations ───────────────────────
  const loadConversation = useCallback(async (id: string) => {
    abortRef.current?.abort();
    setLoadingConv(true);
    setArtifact(null);
    try {
      const r = await api<{ conversation: Conversation; messages: Msg[] }>(`/api/playground/conversations/${id}`);
      const map = Object.fromEntries(r.messages.map((m) => [m.id, m]));
      setById(map);
      setLeafId(r.conversation.currentLeafId && map[r.conversation.currentLeafId] ? r.conversation.currentLeafId : (r.messages[r.messages.length - 1]?.id ?? null));
      if (r.conversation.model) setModel(r.conversation.model);
      setParams({ ...DEFAULT_PARAMS, ...r.conversation.params });
      setConvId(id);
      setUrl(id);
      stick.current = true;
    } catch (e) {
      toast.error(errorMessage(e));
      setConvId(null);
      setUrl(null);
    } finally {
      setLoadingConv(false);
      setListSheet(false);
    }
  }, []);

  useEffect(() => {
    const c = search.get("c");
    if (c) void loadConversation(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    setConvId(null);
    setById({});
    setLeafId(null);
    setParams(defaultsFromUser());
    setArtifact(null);
    setUrl(null);
    setListSheet(false);
    setTimeout(() => composer.current?.focus(), 50);
  }, [defaultsFromUser]);

  // Persist model/params changes for an existing conversation (debounced)
  const persist = (patch: Record<string, unknown>) => {
    if (!convId) return;
    if (savingTimer.current) clearTimeout(savingTimer.current);
    savingTimer.current = setTimeout(() => {
      api(`/api/playground/conversations/${convId}`, { method: "PATCH", body: patch }).catch(() => {});
    }, 600);
  };
  const updateParams = (p: Partial<Params>) => {
    setParams((cur) => {
      const next = { ...cur, ...p };
      persist({ params: next });
      return next;
    });
  };
  const changeModel = (id: string) => {
    setModel(id);
    persist({ model: id });
  };

  // ── Scrolling ─────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [byId, leafId]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stick.current = near;
    setAtBottom(near);
  };
  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  // ── Sending ───────────────────────────────────────────
  const run = async (opts: { mode: "send" | "edit" | "regenerate"; content?: string; attachments?: Attachment[]; targetId?: string }) => {
    if (!model || busy) return;
    if (current?.status === "maintenance") return toast.error(`${current.name} is under maintenance. Pick another model.`);
    if (current && !current.available) return toast.error(`${current.name} needs a paid plan`);

    // Drop any placeholders left by a failed request
    const clean = Object.fromEntries(Object.entries(byId).filter(([id]) => !id.startsWith("tmp-")));
    const realPath = pathTo(leafId, clean).length ? pathTo(leafId, clean) : path.filter((m) => !m.id.startsWith("tmp-"));
    const realLeaf = realPath[realPath.length - 1]?.id ?? null;
    const target = opts.targetId ? clean[opts.targetId] : undefined;

    const now = new Date().toISOString();
    const userParent = opts.mode === "edit" ? (target?.parentId ?? null) : realLeaf;
    const tmpUser = opts.mode === "regenerate" ? null : emptyMsg({ id: TMP_USER, parentId: userParent, role: "user", content: opts.content ?? "", attachments: opts.attachments ?? [], status: "complete", createdAt: now });
    const tmpAssistant = emptyMsg({ id: TMP_ASSISTANT, parentId: tmpUser ? TMP_USER : (target?.parentId ?? null), role: "assistant", model, status: "streaming", createdAt: now });

    setById({ ...clean, ...(tmpUser ? { [TMP_USER]: tmpUser } : {}), [TMP_ASSISTANT]: tmpAssistant });
    setLeafId(TMP_ASSISTANT);
    stick.current = true;
    setBusy(true);

    const ac = new AbortController();
    abortRef.current = ac;
    let assistantId = TMP_ASSISTANT;
    const patchAssistant = (fn: (m: Msg) => Msg) => setById((prev) => (prev[assistantId] ? { ...prev, [assistantId]: fn(prev[assistantId]) } : prev));

    try {
      await streamEvents(
        "/api/playground/chat",
        {
          conversationId: convId,
          mode: opts.mode,
          parentId: opts.mode === "send" ? realLeaf : undefined,
          targetId: opts.targetId,
          content: opts.content ?? "",
          attachments: opts.attachments ?? [],
          model,
          params,
        },
        (event, data) => {
          if (event === "meta") {
            const conv = data.conversation as Conversation;
            if (!convId) {
              setConvId(conv.id);
              setUrl(conv.id);
              qc.setQueryData<Conversation[]>(["conversations"], (old) => [conv, ...(old ?? []).filter((c) => c.id !== conv.id)]);
            }
            const realAssistant = data.assistantMessage as Msg;
            setById((prev) => {
              const next = { ...prev };
              const streamed = next[TMP_ASSISTANT];
              delete next[TMP_ASSISTANT];
              if (data.userMessage) {
                delete next[TMP_USER];
                next[data.userMessage.id] = data.userMessage;
              }
              next[realAssistant.id] = { ...realAssistant, content: streamed?.content ?? "", reasoning: streamed?.reasoning ?? "", status: "streaming" };
              return next;
            });
            assistantId = realAssistant.id;
            setLeafId(realAssistant.id);
          } else if (event === "reasoning") {
            patchAssistant((m) => ({ ...m, reasoning: m.reasoning + data.text }));
          } else if (event === "delta") {
            patchAssistant((m) => ({ ...m, content: m.content + data.text }));
          } else if (event === "tool") {
            const call = data as ToolCall;
            patchAssistant((m) => {
              const exists = m.toolCalls.some((t) => t.id === call.id);
              return { ...m, toolCalls: exists ? m.toolCalls.map((t) => (t.id === call.id ? call : t)) : [...m.toolCalls, call] };
            });
          } else if (event === "title") {
            qc.setQueryData<Conversation[]>(["conversations"], (old) => old?.map((c) => (c.id === data.conversationId ? { ...c, title: data.title } : c)));
          } else if (event === "done") {
            const final = data.message as Msg;
            setById((prev) => ({ ...prev, [final.id]: final }));
            const arts = extractArtifacts(final.content).filter((a) => a.code.split("\n").length >= 6);
            if (arts.length) setArtifact(arts[arts.length - 1]);
          }
        },
        ac.signal,
      );
    } catch (e) {
      if (ac.signal.aborted) patchAssistant((m) => ({ ...m, status: "stopped" }));
      else patchAssistant((m) => ({ ...m, status: "error", error: errorMessage(e) }));
    } finally {
      setBusy(false);
      abortRef.current = null;
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      void qc.invalidateQueries({ queryKey: ["me"] });
    }
  };

  const stop = () => abortRef.current?.abort();

  // ── Message actions ───────────────────────────────────
  const branchFor = (m: Msg) => {
    if (m.id.startsWith("tmp-")) return null;
    const siblings = childrenOf(m.parentId, byId).filter((s) => !s.id.startsWith("tmp-"));
    if (siblings.length < 2) return null;
    const index = siblings.findIndex((s) => s.id === m.id);
    const go = (i: number) => {
      if (busy) return;
      const leaf = deepestLeaf(siblings[i].id, byId);
      setLeafId(leaf);
      if (convId) api(`/api/playground/conversations/${convId}`, { method: "PATCH", body: { currentLeafId: leaf } }).catch(() => {});
    };
    return { index, count: siblings.length, onPrev: () => go(index - 1), onNext: () => go(index + 1) };
  };

  const deleteMessage = async (m: Msg) => {
    if (m.id.startsWith("tmp-")) {
      setById((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !id.startsWith("tmp-"))));
      setLeafId(path.filter((x) => !x.id.startsWith("tmp-")).at(-1)?.id ?? null);
      return;
    }
    try {
      const r = await api<{ deleted: string[]; currentLeafId: string | null }>(`/api/playground/messages/${m.id}`, { method: "DELETE" });
      setById((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !r.deleted.includes(id))));
      setLeafId(r.currentLeafId ?? m.parentId);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const feedback = (m: Msg, f: "" | "up" | "down") => {
    setById((prev) => ({ ...prev, [m.id]: { ...prev[m.id], feedback: f } }));
    api(`/api/playground/messages/${m.id}`, { method: "PATCH", body: { feedback: f } }).catch(() => {});
  };

  // ── Conversation list actions ─────────────────────────
  const mutateList = (fn: (list: Conversation[]) => Conversation[]) => qc.setQueryData<Conversation[]>(["conversations"], (old) => fn(old ?? []));
  const renameConv = (id: string, title: string) => {
    mutateList((l) => l.map((c) => (c.id === id ? { ...c, title } : c)));
    api(`/api/playground/conversations/${id}`, { method: "PATCH", body: { title } }).catch((e) => toast.error(errorMessage(e)));
  };
  const pinConv = (id: string, pinned: boolean) => {
    mutateList((l) => l.map((c) => (c.id === id ? { ...c, pinned } : c)));
    api(`/api/playground/conversations/${id}`, { method: "PATCH", body: { pinned } }).catch((e) => toast.error(errorMessage(e)));
  };
  const deleteConv = async (id: string) => {
    mutateList((l) => l.filter((c) => c.id !== id));
    if (id === convId) newChat();
    await api(`/api/playground/conversations/${id}`, { method: "DELETE" }).catch((e) => toast.error(errorMessage(e)));
  };
  const clearAll = async () => {
    mutateList(() => []);
    newChat();
    await api("/api/playground/conversations", { method: "DELETE" }).catch((e) => toast.error(errorMessage(e)));
  };

  const sidebar = (
    <ConversationSidebar
      conversations={convs.data ?? []}
      activeId={convId}
      loading={convs.isLoading}
      onSelect={(id) => id !== convId && loadConversation(id)}
      onNew={newChat}
      onRename={renameConv}
      onPin={pinConv}
      onDelete={deleteConv}
      onClearAll={clearAll}
    />
  );
  // Defaults = the user's own (Settings → Playground defaults), falling back to the built-in ones
  const baseParams = defaultsFromUser();
  const paramsPanel = <ParamsPanel model={current} params={params} defaults={baseParams} onChange={updateParams} />;
  // A dot on the gear when the chat settings differ from the defaults
  const customized = (["temperature", "maxTokens", "topP", "system", "reasoningEffort", "jsonMode"] as const).some((k) => params[k] !== baseParams[k]);
  const lastAssistant = [...path].reverse().find((m) => m.role === "assistant");
  const maintenance = current?.status === "maintenance";
  const locked = Boolean(current && (!current.available || maintenance));

  return (
    <div className="flex h-full">
      {showList && !artifact && <aside className="hidden w-[264px] shrink-0 border-r border-border bg-sidebar/60 lg:block">{sidebar}</aside>}
      <Sheet open={listSheet} onOpenChange={setListSheet} title="Chats">
        {sidebar}
      </Sheet>

      <section className="@container flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
          <Tooltip content={showList ? "Hide chats" : "Show chats"}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => (window.matchMedia("(min-width: 1024px)").matches ? setShowList((s) => !s) : setListSheet(true))}
              aria-label="Toggle chat list"
            >
              <PanelLeft />
            </Button>
          </Tooltip>
          <ModelPicker models={chatModels} value={model} onChange={changeModel} className="max-w-[220px] shrink-0" />
          <div className="hidden min-w-0 items-center gap-1 overflow-hidden @3xl:flex">
            {current?.capabilities
              .filter((c) => c !== "streaming")
              .map((c) => {
                const meta = CAP_META[c];
                return meta ? (
                  <Badge key={c} tone="outline">
                    <meta.icon className="size-3" /> {meta.label}
                  </Badge>
                ) : null;
              })}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
              <Tooltip content="Chat settings">
                <PopoverTrigger asChild>
                  <Button variant={settingsOpen ? "secondary" : "ghost"} size="icon-sm" className="relative" aria-label="Chat settings">
                    <Settings />
                    {customized && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-accent ring-2 ring-background" />}
                  </Button>
                </PopoverTrigger>
              </Tooltip>
              <PopoverContent align="end" collisionPadding={12} className="flex max-h-[min(80vh,720px)] w-[min(360px,calc(100vw-24px))] flex-col overflow-hidden p-0">
                {paramsPanel}
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="sm" onClick={() => setCodeOpen(true)} disabled={!model}>
              <Code /> <span className="hidden @xl:inline">Get code</span>
            </Button>
            <Tooltip content="New chat">
              <Button variant="ghost" size="icon-sm" onClick={newChat} aria-label="New chat">
                <Plus />
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* Messages */}
        <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} onScroll={onScroll} className="scrollbar-thin h-full overflow-y-auto">
            {loadingConv ? (
              <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="skeleton h-4 w-1/3 rounded" />
                    <div className="skeleton h-4 w-2/3 rounded" />
                  </div>
                ))}
              </div>
            ) : path.length === 0 ? (
              <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-4 py-10 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <Sparkles className="size-6" />
                </span>
                <h2 className="mt-5 text-2xl font-semibold tracking-tight">What are we building today?</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Chat with {current ? <b className="text-foreground">{current.name}</b> : "any model"} — usage counts against your plan, just like the API.
                </p>
                <div className="mt-8 grid w-full gap-2.5 sm:grid-cols-2">
                  {SUGGESTIONS.filter((s) => s.icon !== Globe || cfg?.webSearch).map((s) => (
                    <button
                      key={s.title}
                      disabled={!model || busy || Boolean(locked)}
                      onClick={() => {
                        if (s.icon === Globe && !params.webSearch) updateParams({ webSearch: true });
                        void run({ mode: "send", content: s.prompt });
                      }}
                      className="group flex items-start gap-3 rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:border-border-strong hover:bg-muted/40 disabled:opacity-50"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-accent">
                        <s.icon className="size-4" />
                      </span>
                      <span>
                        <span className="block text-[13.5px] font-medium">{s.title}</span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{s.prompt}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-8 px-4 pb-10 pt-8">
                {path.map((m) =>
                  m.role === "user" ? (
                    <UserMessage key={m.id} msg={m} branch={branchFor(m)} disabled={busy} onEdit={(text) => run({ mode: "edit", targetId: m.id, content: text, attachments: m.attachments })} onDelete={() => deleteMessage(m)} />
                  ) : (
                    <AssistantMessage
                      key={m.id}
                      msg={m}
                      modelName={chatModels.find((x) => x.id === m.model)?.name ?? m.model ?? "Assistant"}
                      vendor={chatModels.find((x) => x.id === m.model)?.vendor ?? ""}
                      branch={branchFor(m)}
                      busy={busy}
                      isLast={m.id === lastAssistant?.id}
                      onRegenerate={() => (m.id.startsWith("tmp-") ? undefined : run({ mode: "regenerate", targetId: m.id }))}
                      onDelete={() => deleteMessage(m)}
                      onFeedback={(f) => feedback(m, f)}
                      onPreview={setArtifact}
                    />
                  ),
                )}
              </div>
            )}
          </div>
          {!atBottom && path.length > 0 && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-3 left-1/2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-elevated text-muted-foreground shadow-lg hover:text-foreground"
              aria-label="Scroll to bottom"
            >
              <ArrowDown className="size-4" />
            </button>
          )}
        </div>

        {/* Composer */}
        <div className="mx-auto w-full max-w-3xl px-3 pb-3 sm:px-4">
          {maintenance && (
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-muted/60 px-3.5 py-2.5 text-[13px] text-muted-foreground">
              <Wrench className="size-4 shrink-0" /> {current?.name} is under maintenance. Pick another model to keep chatting.
            </div>
          )}
          {locked && !maintenance && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-[13px]">
              <span className="flex items-center gap-2 text-warning">
                <Lock className="size-4" /> {current?.name} is available on paid plans.
              </span>
              <Button size="xs" variant="primary" asChild>
                <Link href="/dashboard/billing/plan">Upgrade</Link>
              </Button>
            </div>
          )}
          <Composer
            ref={composer}
            busy={busy}
            disabled={!model || Boolean(locked)}
            vision={Boolean(current?.capabilities.includes("vision"))}
            searchAvailable={Boolean(cfg?.webSearch && current?.capabilities.includes("tools"))}
            webSearch={params.webSearch}
            onToggleSearch={() => updateParams({ webSearch: !params.webSearch })}
            footnote={`temp ${params.temperature.toFixed(1)} · max ${params.maxTokens.toLocaleString()} tokens${params.system ? " · system prompt" : ""}`}
            onSend={(text, attachments) => run({ mode: "send", content: text, attachments })}
            onStop={stop}
            autoFocus
          />
          <p className="mt-2 text-center text-[11px] text-subtle-foreground">Models can make mistakes. Chats are saved to your account.</p>
        </div>
      </section>

      {artifact && (
        <aside className={cn("hidden shrink-0 border-l border-border md:block", artifactWide ? "w-[58%]" : "w-[44%] max-w-[640px]")}>
          <ArtifactPanel artifact={artifact} onClose={() => setArtifact(null)} expanded={artifactWide} onToggleExpand={() => setArtifactWide((w) => !w)} />
        </aside>
      )}
      {artifact && isMobile && (
        <Sheet open onOpenChange={(o) => !o && setArtifact(null)} side="right" className="w-full max-w-full" title="Preview">
          <ArtifactPanel artifact={artifact} onClose={() => setArtifact(null)} expanded={false} onToggleExpand={() => {}} />
        </Sheet>
      )}
      <GetCodeDialog open={codeOpen} onOpenChange={setCodeOpen} model={model} params={params} messages={path.filter((m) => !m.id.startsWith("tmp-"))} />
    </div>
  );
}
