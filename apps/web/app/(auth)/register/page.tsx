"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Check, Gift, KeyRound, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { SocialSignIn } from "@/components/auth/social-sign-in";
import { api, errorMessage } from "@/lib/api";
import { useMounted } from "@/lib/hooks";

type AuthConfig = { emailSignup?: boolean };

const PERKS = [
  { icon: Sparkles, text: "Free tokens every month on the free models" },
  { icon: KeyRound, text: "Your API key in under a minute" },
  { icon: Zap, text: "No card and no password to remember" },
];

function RegisterForm() {
  const params = useSearchParams();
  const [ref, setRef] = useState("");
  const { data: config } = useQuery({
    queryKey: ["auth-config"],
    queryFn: () => api<AuthConfig>("/api/auth/config"),
    staleTime: 5 * 60_000,
  });

  // Remember a referral code across the flow (e.g. if they open the link in an in-app browser first)
  useEffect(() => {
    const fromUrl = params.get("ref");
    try {
      if (fromUrl) localStorage.setItem("ref", fromUrl);
      setRef(fromUrl || localStorage.getItem("ref") || "");
    } catch {
      setRef(fromUrl || "");
    }
  }, [params]);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">One click with Google or GitHub. Free tier included.</p>
      {ref && (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-[13px]">
          <Gift className="size-4 text-accent" /> Invited with code <b className="font-mono">{ref}</b>
        </p>
      )}

      <div className="mt-7">
        <SocialSignIn referral={ref || undefined} />
        <ul className="mt-6 space-y-2.5">
          {PERKS.map((p) => (
            <li key={p.text} className="flex items-center gap-2.5 text-[13.5px] text-muted-foreground">
              <span className="flex size-6 items-center justify-center rounded-md bg-accent-soft text-accent">
                <p.icon className="size-3.5" />
              </span>
              {p.text}
            </li>
          ))}
        </ul>

        {config?.emailSignup && <EmailSignup referral={ref} />}

        <p className="mt-7 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </>
  );
}

/** Email + password sign-up. Only shown when the server sets ALLOW_EMAIL_SIGNUP=1 (e.g. local testing). */
function EmailSignup({ referral }: { referral: string }) {
  // Until the page is interactive, Enter would reload the page instead of creating the account
  const ready = useMounted();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const strong = password.length >= 8;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await api<{ devCode?: string }>("/api/auth/register", {
        body: { name, email, password, ref: referral || undefined },
      });
      if (r.devCode) sessionStorage.setItem("devCode", r.devCode);
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <>
      <div className="my-6 flex items-center gap-3 text-xs text-subtle-foreground">
        <span className="h-px flex-1 bg-border" />
        or with email (testing)
        <span className="h-px flex-1 bg-border" />
      </div>
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
