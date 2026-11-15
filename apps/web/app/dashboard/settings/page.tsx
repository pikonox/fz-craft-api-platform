"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, MonitorSmartphone, ShieldCheck, UserRound, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/primitives";
import { UnderlineTabs } from "@/components/ui/controls";
import { DefaultsCard, ProfileCard } from "@/components/account/settings/profile";
import { PasswordCard, TelegramCard, TwoFactorCard } from "@/components/account/settings/security";
import { SessionsCard } from "@/components/account/settings/sessions";
import { NotificationsCard } from "@/components/account/settings/notifications";
import { AccountInfoCard, DangerZoneCard } from "@/components/account/settings/account";
import { useMe } from "@/lib/queries";

const TABS = [
  { value: "profile", label: "Profile", icon: UserRound },
  { value: "security", label: "Security", icon: ShieldCheck },
  { value: "sessions", label: "Sessions", icon: MonitorSmartphone },
  { value: "notifications", label: "Notifications", icon: Bell },
  { value: "account", label: "Account", icon: UserCog },
] as const;
type Tab = (typeof TABS)[number]["value"];
const isTab = (v: string | null | undefined): v is Tab => TABS.some((t) => t.value === v);

function SettingsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { data: me, isLoading, isError, refetch } = useMe();

  const fromQuery = params.get("tab");
  const tab: Tab = isTab(fromQuery) ? fromQuery : "profile";

  // Also accept old-style #security links
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!fromQuery && isTab(hash)) router.replace(`${pathname}?tab=${hash}`, { scroll: false });
  }, [fromQuery, pathname, router]);

  const setTab = (t: Tab) => router.replace(t === "profile" ? pathname : `${pathname}?tab=${t}`, { scroll: false });

  return (
    <div>
      <PageHeader title="Settings" description="Your profile, sign-in security, devices and how we contact you." />
      <UnderlineTabs
        value={tab}
        onChange={setTab}
        className="mb-6"
        options={TABS.map((t) => ({
          value: t.value,
          label: (
            <>
              <t.icon className="size-4" /> {t.label}
            </>
          ),
        }))}
      />

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : isError || !me ? (
        <Card>
          <EmptyState
            title="Couldn't load your settings"
            description="Check your connection and try again."
            action={
              <Button size="sm" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {tab === "profile" && (
            <>
              <ProfileCard user={me.user} />
              <DefaultsCard user={me.user} />
            </>
          )}
          {tab === "security" && (
            <>
              <TelegramCard user={me.user} />
              <TwoFactorCard user={me.user} />
              <PasswordCard user={me.user} />
            </>
          )}
          {tab === "sessions" && <SessionsCard />}
          {tab === "notifications" && <NotificationsCard user={me.user} />}
          {tab === "account" && (
            <>
              <AccountInfoCard me={me} />
              <DangerZoneCard me={me} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <SettingsPage />
    </Suspense>
  );
}
