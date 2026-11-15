"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/auth/otp-input";
import { api, errorMessage } from "@/lib/api";

function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const next = params.get("next") || "/dashboard";
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(45);
  const [devCode, setDevCode] = useState<string | null>(null);

  useEffect(() => {
    setDevCode(sessionStorage.getItem("devCode"));
  }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verify = async (value = code) => {
    if (value.replace(/\s/g, "").length !== 6) return;
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/verify-email", { body: { email, code: value.replace(/\s/g, "") } });
      sessionStorage.removeItem("devCode");
      localStorage.removeItem("ref");
      router.replace(next);
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  const resend = async () => {
    try {
      const r = await api<{ devCode?: string }>("/api/auth/resend-code", { body: { email, purpose: "verify" } });
      if (r.devCode) {
        sessionStorage.setItem("devCode", r.devCode);
        setDevCode(r.devCode);
      }
      setCooldown(45);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <>
      <span className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <MailCheck className="size-6" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Check your email</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        We sent a 6-digit code to <b className="text-foreground">{email || "your email"}</b>.
      </p>
      <div className="mt-8 space-y-5">
        <OtpInput value={code} onChange={setCode} onComplete={(v) => verify(v)} disabled={loading} />
        {devCode && <p className="rounded-lg border border-dashed border-border px-3 py-2 text-center text-xs text-muted-foreground">Development mode — your code is <b className="font-mono text-foreground">{devCode}</b></p>}
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
        <Button variant="primary" size="lg" className="w-full" loading={loading} onClick={() => verify()}>
          Verify email
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Didn&apos;t get it?{" "}
          {cooldown > 0 ? (
            <span className="tabular">Resend in {cooldown}s</span>
          ) : (
            <button onClick={resend} className="font-medium text-foreground hover:underline">
              Resend code
            </button>
          )}
        </p>
        <p className="text-center text-sm">
          <Link href="/register" className="text-muted-foreground hover:text-foreground">
            Use a different email
          </Link>
        </p>
      </div>
    </>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  );
}
