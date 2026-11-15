"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/queries";
import type { AdminModel, AdminPaymentMethod, AdminPlan, AdminSettings, AdminStats, Provider, ProviderTest } from "./types";

/** All admin query keys start with "admin" so a mutation can refresh the whole panel if needed. */
export const qk = {
  stats: (range = "30d") => ["admin", "stats", range] as const,
  payments: ["admin", "payments"] as const,
  payment: (id: string) => ["admin", "payments", "one", id] as const,
  users: ["admin", "users"] as const,
  user: (id: string) => ["admin", "users", "one", id] as const,
  providers: ["admin", "providers"] as const,
  providerTest: (id: string) => ["admin", "provider-test", id] as const,
  models: ["admin", "models"] as const,
  plans: ["admin", "plans"] as const,
  methods: ["admin", "payment-methods"] as const,
  settings: ["admin", "settings"] as const,
  tickets: ["admin", "tickets"] as const,
  ticket: (id: string) => ["admin", "tickets", "one", id] as const,
  feedback: ["admin", "feedback"] as const,
  logs: ["admin", "logs"] as const,
  audit: ["admin", "audit"] as const,
};

export function useIsAdmin() {
  const { data } = useMe();
  return data?.user.role === "admin";
}

export function useAdminStats(range = "30d") {
  const isAdmin = useIsAdmin();
  return useQuery({ queryKey: qk.stats(range), queryFn: () => api<AdminStats>(`/api/admin/stats?range=${range}`), enabled: isAdmin, refetchInterval: 60_000 });
}

export function useAdminProviders() {
  return useQuery({ queryKey: qk.providers, queryFn: () => api<{ providers: Provider[] }>("/api/admin/providers").then((r) => r.providers) });
}

export function useAdminModels() {
  return useQuery({ queryKey: qk.models, queryFn: () => api<{ models: AdminModel[] }>("/api/admin/models").then((r) => r.models) });
}

export function useAdminPlans() {
  return useQuery({ queryKey: qk.plans, queryFn: () => api<{ plans: AdminPlan[] }>("/api/admin/plans").then((r) => r.plans) });
}

export function useAdminMethods() {
  return useQuery({ queryKey: qk.methods, queryFn: () => api<{ methods: AdminPaymentMethod[] }>("/api/admin/payment-methods").then((r) => r.methods) });
}

export function useAdminSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: () => api<{ settings: AdminSettings; defaults: AdminSettings }>("/api/admin/settings") });
}

/**
 * "Test connection" result for a provider. Shared between the Providers page and the
 * model routes editor (upstream model suggestions); only runs when refetch() is called.
 */
export function useProviderTest(providerId: string) {
  return useQuery({
    queryKey: qk.providerTest(providerId),
    queryFn: () => api<ProviderTest>(`/api/admin/providers/${providerId}/test`, { method: "POST" }),
    enabled: false,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
  });
}
