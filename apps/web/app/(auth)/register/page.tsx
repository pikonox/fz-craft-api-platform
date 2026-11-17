"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { GoogleButton } from "@/components/auth/google-button";
import { api, errorMessage } from "@/lib/api";
import { useMounted } from "@/lib/hooks";

function RegisterForm() {
  // Until the page is interactive, Enter would reload the page instead of creating the account
  const ready = useMounted();
  const router = useRouter();
  const params = useSearchParams();
  const [ref, setRef] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Remember a referral code across the flow (e.g. if they open the link in an in-app browser first)
  useEffect(() => {
    const fromUrl = params.get("ref");
    if (fromUrl) localStorage.setItem("ref", fromUrl);
    setRef(fromUrl || localStorage.getItem("ref") || "");
  }, [params]);

  const strong = password.length >= 8;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await api<{ devCode?: string }>("/api/auth/register", { body: { name, email, password, ref: ref || undefined } });
      if (r.devCode) sessionStorage.setItem("devCode", r.devCode);
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Free tier included — no card required.</p>
      {ref && (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-[13px]">
          <Gift className="size-4 text-accent" /> Invited with code <b className="font-mono">{ref}</b>
        </p>
      )}
      <div className="mt-7">
        <GoogleButton referral={ref || undefined} />
        <form onSubmit={submit} className="space-y-4">
          <Field label="Full name">
            <Input autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" className="h-11" />
          </Field>
          <Field label="Email">
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="h-11" />
          </Field>
          <Field label="Password" hint={<span className={strong ? "text-success" : ""}>{strong ? <Check className="mr-1 inline size-3" /> : null}At least 8 characters</span>}>
            <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
          </Field>
          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading} disabled={!strong || !ready}>
            Create account
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
