"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { MeResponse, ModelInfo, Notification, Plan } from "./types";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<MeResponse>("/api/me"), staleTime: 15_000 });
}

export function useStatus() {
  return useQuery({
    queryKey: ["status"],
    queryFn: () =>
      api<{ level: "operational" | "degraded" | "outage"; message: string; announcement?: string; contact?: { email: string | null; telegram: string | null } }>("/api/status"),
    refetchInterval: 60_000,
  });
}

export function useModels() {
  return useQuery({ queryKey: ["models"], queryFn: () => api<{ models: ModelInfo[] }>("/api/models").then((r) => r.models), staleTime: 60_000 });
}

export function usePlans() {
  return useQuery({ queryKey: ["plans"], queryFn: () => api<{ plans: Plan[] }>("/api/plans").then((r) => r.plans), staleTime: 60_000 });
}

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ unread: number; notifications: Notification[] }>("/api/notifications?limit=12"),
    refetchInterval: 45_000,
  });
}

/** Refresh everything that shows balances / plan / usage after a mutation. */
export function useRefreshAccount() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["me"] });
    void qc.invalidateQueries({ queryKey: ["billing"] });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  };
}
