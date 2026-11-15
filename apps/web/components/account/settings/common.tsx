"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import type { MeResponse, User } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Body accepted by PATCH /api/me. */
export type MePatch = {
  name?: string;
  phone?: string;
  defaults?: Partial<User["defaults"]>;
  notificationPrefs?: Partial<User["notificationPrefs"]>;
};

/** PATCH /api/me and put the returned user straight into the ["me"] cache. */
export function useSaveMe() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const save = async (patch: MePatch, success?: string) => {
    setSaving(true);
    try {
      const r = await api<{ user: User }>("/api/me", { method: "PATCH", body: patch });
      qc.setQueryData<MeResponse>(["me"], (old) => (old ? { ...old, user: r.user } : old));
      if (success) toast.success(success);
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { save, saving };
}

/** Label + description on the left, control on the right (stacks on phones). */
export function SettingRow({ title, description, children, className }: { title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6", className)}>
      <div className="min-w-0">
        <p className="text-[14px] font-medium">{title}</p>
        {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

/** A short, readable device name from a user-agent string ("Chrome on macOS"). */
export function describeAgent(ua: string | undefined) {
  const s = ua ?? "";
  if (!s) return { browser: "Unknown device", os: "", mobile: false };
  const browser = /Edg\//.test(s)
    ? "Edge"
    : /OPR\/|Opera/.test(s)
      ? "Opera"
      : /Firefox\//.test(s)
        ? "Firefox"
        : /Chrome\//.test(s)
          ? "Chrome"
          : /Safari\//.test(s)
            ? "Safari"
            : /curl|node|python|axios|okhttp/i.test(s)
              ? "API client"
              : "Browser";
  const os = /iPhone|iPad|iPod/.test(s)
    ? "iOS"
    : /Android/.test(s)
      ? "Android"
      : /Mac OS X|Macintosh/.test(s)
        ? "macOS"
        : /Windows/.test(s)
          ? "Windows"
          : /Linux/.test(s)
            ? "Linux"
            : "";
  return { browser, os, mobile: /Mobile|iPhone|Android/.test(s) };
}
