"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Copy, Gift, Link2, Send, ShieldCheck, Ticket, TrendingUp, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { formatNumber, formatTokens, REFERRAL_CODE_WINDOW_DAYS } from "@nova/shared";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, CardBody, CardHeader, CopyButton, EmptyState, Field, Input, PageHeader, Skeleton } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/controls";
import { TimeSeriesChart, type Series } from "@/components/charts";
import { StatTile } from "@/components/dashboard/stat";
import { Callout, TH } from "@/components/account/common";
import { ShareButtons } from "@/components/account/share";
import { api, errorMessage } from "@/lib/api";
import { useMe, useRefreshAccount } from "@/lib/queries";
import { BRAND, KEY_PREFIX, cn, copyText, formatDate } from "@/lib/utils";

type Referral = { id: string; name: string; email: string; joinedAt: string; plan: string; status: "pending" | "verified"; rewardTokens: number; verifiedAt?: string | null };
type ReferralData = {
  code: string;
  link: string;
  rewardTokens: number;
  verifyVia: "telegram" | "email";
  stats: { invited: number; verified: number; pending: number; tokensEarned: number };
  referrals: Referral[];
  earnings: { at: string; tokens: number }[];
  canEnterCode: boolean;
  referredBy: string | null;
};
type Filter = "all" | "verified" | "pending";

const SERIES: Series[] = [{ key: "tokens", label: "Tokens earned", color: "--chart-1" }];

export default function RewardsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["referrals"], queryFn: () => api<ReferralData>("/api/referrals") });
  const [filter, setFilter] = useState<Filter>("all");
  const reward = data ? formatTokens(data.rewardTokens) : "1M";
  const via = data?.verifyVia === "telegram" ? "Telegram" : "email";

  // Cumulative tokens per day, at least the last 14 days so a single reward still reads as a step
  const chart = useMemo(() => {
    if (!data?.earnings.length) return [];
    const day = (d: string | number | Date) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    };
    const today = day(Date.now());
    const first = day(data.earnings[0].at);
    const start = new Date(Math.min(first.getTime(), today.getTime() - 13 * 86_400_000));
    const points: { t: number; tokens: number }[] = [];
    let cum = 0;
    let i = 0;
    for (const d = day(start); d <= today; d.setDate(d.getDate() + 1)) {
      while (i < data.earnings.length && day(data.earnings[i].at) <= d) cum += data.earnings[i++].tokens;
      points.push({ t: d.getTime(), tokens: cum });
    }
    return points;
  }, [data]);

  const rows = (data?.referrals ?? []).filter((r) => filter === "all" || r.status === filter);

  return (
    <div className="space-y-8">
      <PageHeader title="Rewards" description={`Invite developers to ${BRAND}. Every friend who joins and verifies their account earns you ${reward} free tokens.`} />

      <div className="grid gap-4 lg:grid-cols-[1.65fr_1fr]">
        <ShareCard data={data} reward={reward} via={via} />

        <Card>
          <CardHeader title="How it works" description="Rewards are added automatically" />
          <CardBody>
            <ol className="relative space-y-5">
              {[
                { icon: Link2, title: "Share your link", body: data ? <>Send your link, or your code <span className="font-mono text-foreground">{data.code}</span>.</> : "Send your link or code." },
                { icon: UserPlus, title: "Your friend signs up", body: `With your link, or by entering your code within ${REFERRAL_CODE_WINDOW_DAYS} days of joining.` },
                {
                  icon: data?.verifyVia === "telegram" ? Send : ShieldCheck,
                  title: data?.verifyVia === "telegram" ? "They verify with Telegram" : "They confirm their email",
                  body: data?.verifyVia === "telegram" ? "One tap in our Telegram bot proves they're a real person." : "Clicking the code we email them proves they're a real person.",
                },
                { icon: Gift, title: `You get ${reward} tokens`, body: "Added to your bonus tokens instantly — used after your plan allowance." },
              ].map((s, i, all) => (
                <li key={s.title} className="relative flex gap-3.5">
                  {i < all.length - 1 && <span className="absolute left-[15px] top-9 h-[calc(100%-16px)] w-px bg-border" />}
                  <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
                    <s.icon className="size-4" />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[13px] font-medium">
                      <span className="mr-1.5 text-subtle-foreground tabular">{i + 1}.</span>
                      {s.title}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Friends invited" loading={isLoading} value={formatNumber(data?.stats.invited ?? 0)} sub="Signed up with your link or code" />
        <StatTile label="Verified" loading={isLoading} value={formatNumber(data?.stats.verified ?? 0)} sub={`Confirmed via ${via}`} />
        <StatTile label="Pending" loading={isLoading} value={formatNumber(data?.stats.pending ?? 0)} sub={data?.stats.pending ? `Waiting for ${via} verification` : "Nobody waiting"} />
        <StatTile label="Tokens earned" loading={isLoading} value={formatTokens(data?.stats.tokensEarned ?? 0)} sub={`${reward} per verified friend`} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.65fr_1fr]">
        <Card>
          <CardHeader title="Tokens earned" description="Cumulative referral rewards" />
          <CardBody className="pt-4">
            {isLoading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : chart.length ? (
              <TimeSeriesChart data={chart} series={SERIES} unit="day" kind="area" height={240} format={formatTokens} />
            ) : (
              <EmptyState icon={<TrendingUp />} title="No rewards yet" description={`When a friend verifies, the ${reward} tokens you earn are charted here.`} className="h-[240px] py-0" />
            )}
          </CardBody>
        </Card>

        <div className="space-y-4">
          {data && <EnterCodeCard data={data} />}
          <Callout tone="info" title="Friend not listed?">
            Friends only appear if they signed up with your link or code. Already joined without it? They can add your code <span className="font-mono font-medium text-foreground">{data?.code ?? "…"}</span> from their own Rewards page within {REFERRAL_CODE_WINDOW_DAYS} days of signing up. The reward is paid once they verify via {via}.
          </Callout>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Your referrals"
          description="Everyone who joined with your link or code"
          action={
            <Segmented
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: data?.stats.invited },
                { value: "verified", label: "Verified", count: data?.stats.verified },
                { value: "pending", label: "Pending", count: data?.stats.pending },
              ]}
            />
          }
          className="flex-col sm:flex-row"
        />
        {isLoading ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : !rows.length ? (
          <EmptyState
            icon={<Users />}
            title={filter === "all" ? "No referrals yet" : filter === "verified" ? "No verified friends yet" : "Nobody pending"}
            description={filter === "all" ? "Share your link above — friends show up here as soon as they sign up." : filter === "pending" ? "Everyone you invited has verified." : `Friends move here once they verify via ${via}.`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr>
                  <th className={cn(TH, "pl-5")}>Friend</th>
                  <th className={TH}>Joined</th>
                  <th className={TH}>Plan</th>
                  <th className={TH}>Status</th>
                  <th className={cn(TH, "pr-5 text-right")}>Reward</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-3 pl-5 pr-3">
                      <span className="flex items-center gap-3">
                        <Avatar name={r.name} className="size-8 text-[11px]" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{r.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{r.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{formatDate(r.joinedAt)}</td>
                    <td className="px-3 py-3">
                      <Badge tone={r.plan === "free" ? "neutral" : "accent"}>{r.plan[0].toUpperCase() + r.plan.slice(1)}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      {r.status === "verified" ? (
                        <span className="flex flex-col items-start gap-0.5">
                          <Badge tone="success">
                            <BadgeCheck className="size-3" /> Verified
                          </Badge>
                          {r.verifiedAt && <span className="text-[11px] text-subtle-foreground">{formatDate(r.verifiedAt)}</span>}
                        </span>
                      ) : (
                        <span className="flex flex-col items-start gap-0.5">
                          <Badge tone="warning" dot>
                            Pending
                          </Badge>
                          <span className="text-[11px] text-subtle-foreground">Waiting for {via} verification</span>
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-3 pl-3 pr-5 text-right font-medium tabular">
                      {r.status === "verified" ? <span className="text-success">+{formatTokens(r.rewardTokens)}</span> : <span className="text-subtle-foreground">{reward} on verify</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ShareCard({ data, reward, via }: { data: ReferralData | undefined; reward: string; via: string }) {
  const text = `I'm building with ${BRAND} — one API key for top AI models, with a free tier. Sign up with my link:`;
  return (
    <Card className="hero-surface relative overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_left,black,transparent_70%)]" />
      <div className="relative flex h-full flex-col p-5 sm:p-6">
        <Badge tone="outline" className="w-fit bg-card/60">
          <Gift className="size-3" /> Referral program
        </Badge>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
          Earn <span className="text-accent">{reward} tokens</span> for every friend
        </h2>
        <p className="mt-1.5 max-w-lg text-sm text-muted-foreground">
          They get a free account. You get {reward} bonus tokens as soon as they verify via {via}. No limit on how many friends you invite.
        </p>

        <div className="mt-6 space-y-3">
          {data ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-card/80 py-1.5 pl-3.5 pr-1.5 backdrop-blur">
                <Link2 className="size-4 shrink-0 text-subtle-foreground" />
                <code className="min-w-0 flex-1 truncate text-[13px]">{data.link}</code>
              </div>
              <Button
                variant="primary"
                className="h-11 rounded-xl"
                onClick={async () => {
                  if (await copyText(data.link)) toast.success("Referral link copied");
                }}
              >
                <Copy /> Copy link
              </Button>
            </div>
          ) : (
            <Skeleton className="h-11 w-full rounded-xl" />
          )}
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            <Ticket className="size-4 text-subtle-foreground" />
            Or share your code
            {data ? (
              <span className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-card/80 py-0.5 pl-2.5 pr-0.5 font-mono text-[13px] font-medium text-foreground">
                {data.code}
                <CopyButton value={data.code} label="Referral code" size="xs" />
              </span>
            ) : (
              <Skeleton className="h-7 w-24" />
            )}
          </div>
        </div>

        <div className="mt-6 lg:mt-auto lg:pt-6">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-subtle-foreground">Share via</p>
          {data ? <ShareButtons url={data.link} text={text} subject={`Try ${BRAND} with my invite`} /> : <Skeleton className="h-9 w-full" />}
        </div>
      </div>
    </Card>
  );
}

function EnterCodeCard({ data }: { data: ReferralData }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const refresh = useRefreshAccount();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (data.referredBy) {
    return (
      <Card className="flex items-center gap-3 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
          <BadgeCheck className="size-4" />
        </span>
        <p className="text-[13px] text-muted-foreground">
          You joined with code <span className="font-mono font-medium text-foreground">{data.referredBy}</span>. Thanks for coming on board!
        </p>
      </Card>
    );
  }
  if (!data.canEnterCode) return null;

  const daysLeft = me ? Math.max(0, REFERRAL_CODE_WINDOW_DAYS - Math.floor((Date.now() - new Date(me.user.createdAt).getTime()) / 86_400_000)) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length < 3) return setError("Enter the code your friend shared");
    if (c === data.code) return setError("That's your own code — share it with friends instead");
    setError(null);
    setBusy(true);
    try {
      await api("/api/me/referral-code", { body: { code: c } });
      toast.success("Referral code applied", { description: "Your friend gets their reward once your account is verified." });
      setCode("");
      void qc.invalidateQueries({ queryKey: ["referrals"] });
      refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Were you invited?" description={daysLeft !== null ? `Add a friend's code — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left to do this` : "Add a friend's code"} />
      <CardBody>
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <Field error={error} className="flex-1">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={`e.g. ${KEY_PREFIX.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase()}-AB12C`} className="font-mono uppercase placeholder:normal-case" aria-label="Referral code" aria-invalid={Boolean(error)} />
          </Field>
          <Button type="submit" variant="outline" className="h-10" loading={busy}>
            Apply
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
