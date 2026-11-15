"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/controls";
import { api, errorMessage } from "@/lib/api";
import type { MeResponse, User } from "@/lib/types";
import { SettingRow } from "./common";

type Prefs = User["notificationPrefs"];
const DEFAULT_PREFS: Prefs = { emailBilling: true, emailUsage: true, emailSecurity: true, emailProduct: false, telegram: false };

const EMAIL_PREFS: { key: keyof Prefs; title: string; description: string }[] = [
  { key: "emailBilling", title: "Billing & payments", description: "Payment received or rejected, plan renewals, low balance before a renewal." },
  { key: "emailUsage", title: "Usage alerts", description: "When you've used 80% and 100% of your plan's tokens." },
  { key: "emailSecurity", title: "Security", description: "Password and two-factor changes, and API keys being revoked." },
  { key: "emailProduct", title: "Product updates", description: "New models, features and occasional offers. No more than a few a month." },
];

export function NotificationsCard({ user }: { user: User }) {
  const qc = useQueryClient();
  const prefs: Prefs = { ...DEFAULT_PREFS, ...(user.notificationPrefs as Partial<Prefs> | undefined) };

  // Toggle instantly; roll back if the save fails
  const set = async (key: keyof Prefs, value: boolean) => {
    const prev = qc.getQueryData<MeResponse>(["me"]);
    qc.setQueryData<MeResponse>(["me"], (old) => (old ? { ...old, user: { ...old.user, notificationPrefs: { ...prefs, [key]: value } } } : old));
    try {
      const r = await api<{ user: User }>("/api/me", { method: "PATCH", body: { notificationPrefs: { [key]: value } } });
      qc.setQueryData<MeResponse>(["me"], (old) => (old ? { ...old, user: r.user } : old));
    } catch (e) {
      if (prev) qc.setQueryData(["me"], prev);
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Email" description={`Sent to ${user.email}. In-app notifications (the bell) are always on.`} />
        <CardBody>
          <div className="divide-y divide-border">
            {EMAIL_PREFS.map((p) => (
              <SettingRow key={p.key} title={p.title} description={p.description}>
                <Switch checked={Boolean(prefs[p.key])} onCheckedChange={(v) => void set(p.key, v)} id={`np-${p.key}`} />
              </SettingRow>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Telegram" description="Get the same alerts as messages from our Telegram bot." />
        <CardBody>
          <SettingRow
            title="Send alerts to Telegram"
            description={user.telegram.verified ? `To ${user.telegram.username ? `@${user.telegram.username}` : "your linked account"}.` : "Verify your Telegram under Security first."}
          >
            <Switch checked={user.telegram.verified && Boolean(prefs.telegram)} disabled={!user.telegram.verified} onCheckedChange={(v) => void set("telegram", v)} id="np-telegram" />
          </SettingRow>
        </CardBody>
      </Card>
    </div>
  );
}
