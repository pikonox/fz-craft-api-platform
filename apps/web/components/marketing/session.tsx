"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SessionUser = { name: string; email: string };

/**
 * Lightweight "am I signed in?" probe for public pages.
 * Uses plain fetch (not `api()`), because `api()` redirects to /login on 401.
 */
export function useSession() {
  const q = useQuery({
    queryKey: ["marketing-session"],
    queryFn: async (): Promise<SessionUser | null> => {
      try {
        const res = await fetch("/api/me", { credentials: "include", headers: { Accept: "application/json" } });
        if (!res.ok) return null;
        const json = await res.json();
        return json?.user ? { name: String(json.user.name ?? ""), email: String(json.user.email ?? "") } : null;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { signedIn: Boolean(q.data), user: q.data ?? null, ready: !q.isPending };
}

/** Primary + secondary call-to-action pair that adapts to the visitor's session. */
export function CtaButtons({
  className,
  secondaryHref = "/docs",
  secondaryLabel = "Read the docs",
  primaryLabel = "Get your free API key",
  size = "lg",
}: {
  className?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  primaryLabel?: string;
  size?: "lg" | "md";
}) {
  const { signedIn } = useSession();
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center", className)}>
      <Button variant="primary" size={size} asChild className="group">
        <Link href={signedIn ? "/dashboard" : "/register"}>
          {signedIn ? "Open dashboard" : primaryLabel}
          <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </Button>
      <Button variant="outline" size={size} asChild className="bg-card/60 backdrop-blur">
        <Link href={secondaryHref}>{secondaryLabel}</Link>
      </Button>
    </div>
  );
}
