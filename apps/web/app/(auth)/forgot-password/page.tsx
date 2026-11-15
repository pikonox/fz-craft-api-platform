"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { OtpInput } from "@/components/auth/otp-input";
import { api, errorMessage } from "@/lib/api";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await api<{ devCode?: string }>("/api/auth/forgot-password", { body: { email } });
      setDevCode(r.devCode ?? null);
      setStep("reset");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/reset-password", { body: { email, code: code.replace(/\s/g, ""), password } });
      router.replace("/dashboard");
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <>
      <span className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <KeyRound className="size-6" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">{step === "email" ? "Reset your password" : "Choose a new password"}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {step === "email" ? "We'll email you a code to reset it." : <>Enter the code we sent to <b className="text-foreground">{email}</b>.</>}
      </p>
      {step === "email" ? (
        <form onSubmit={sendCode} className="mt-8 space-y-4">
          <Field label="Email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="h-11" />
          </Field>
          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
            Send reset code
          </Button>
        </form>
      ) : (
        <form onSubmit={reset} className="mt-8 space-y-5">
          <OtpInput value={code} onChange={setCode} />
          {devCode && <p className="rounded-lg border border-dashed border-border px-3 py-2 text-center text-xs text-muted-foreground">Development mode — your code is <b className="font-mono text-foreground">{devCode}</b></p>}
          <Field label="New password" hint="At least 8 characters">
            <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
          </Field>
          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading} disabled={password.length < 8}>
            Reset password & sign in
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-muted-foreground hover:text-foreground">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
