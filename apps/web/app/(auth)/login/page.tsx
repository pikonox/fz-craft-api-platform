"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { GoogleButton } from "@/components/auth/google-button";
import { api, errorMessage } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  // Filled in when the no-JavaScript sign-in sends you back with a message
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [need2fa, setNeed2fa] = useState(false);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await api<{ needsVerification?: boolean; requires2fa?: boolean; devCode?: string }>("/api/auth/login", { body: { email, password, totp: need2fa ? totp : undefined } });
      if (r.needsVerification) {
        if (r.devCode) sessionStorage.setItem("devCode", r.devCode);
        router.push(`/verify-email?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
        return;
      }
      if (r.requires2fa) {
        setNeed2fa(true);
        setLoading(false);
        return;
      }
      router.replace(next);
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{need2fa ? "Two-factor authentication" : "Welcome back"}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{need2fa ? "Enter the 6-digit code from your authenticator app." : "Sign in to your dashboard."}</p>
      <div className="mt-8">
        {!need2fa && <GoogleButton next={next} />}
        {/* With JavaScript, submit() signs in. Without it (e.g. a browser extension blocks the page's scripts),
            the browser posts the form to /api/auth/login-form, which signs in and redirects. */}
        <form onSubmit={submit} method="post" action="/api/auth/login-form" className="space-y-4">
          <input type="hidden" name="next" value={next} />
          {need2fa ? (
            <Field label="Authentication code">
              <Input autoFocus inputMode="numeric" value={totp} onChange={(e) => setTotp(e.target.value)} placeholder="123 456" className="h-11 text-center font-mono text-lg tracking-[0.3em]" />
            </Field>
          ) : (
            <>
              <Field label="Email">
                <Input type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="h-11" />
              </Field>
              <Field
                label={
                  <span className="flex justify-between">
                    Password
                    <Link href="/forgot-password" className="font-normal text-muted-foreground hover:text-foreground">
                      Forgot?
                    </Link>
                  </span>
                }
              >
                <div className="relative">
                  <Input type={show ? "text" : "password"} name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 pr-10" />
                  <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={show ? "Hide password" : "Show password"}>
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>
            </>
          )}
          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
            {need2fa ? <><ShieldCheck /> Verify</> : "Sign in"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/register" className="font-medium text-foreground hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
