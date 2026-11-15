import Link from "next/link";
import { Logo } from "@/components/brand";
import { API_BASE_URL, KEY_PREFIX } from "@/lib/utils";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px] animate-slide-up">{children}</div>
        </div>
        <p className="text-xs text-subtle-foreground">
          By continuing you agree to our{" "}
          <Link href="/legal/terms" className="underline underline-offset-2 hover:text-foreground">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-border bg-card lg:block">
        <div className="bg-grid absolute inset-0 opacity-50 [mask-image:radial-gradient(70%_60%_at_60%_40%,black,transparent)]" />
        <div className="absolute -right-40 -top-40 size-[520px] rounded-full bg-accent/25 blur-[120px]" />
        <div className="absolute -bottom-40 left-10 size-[420px] rounded-full bg-sky-400/15 blur-[120px]" />
        <div className="relative flex h-full flex-col justify-center px-14">
          <p className="max-w-md text-[34px] font-semibold leading-[1.15] tracking-tight">
            One API key.
            <br />
            <span className="bg-gradient-to-r from-accent to-sky-400 bg-clip-text text-transparent">Every model you need.</span>
          </p>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            Drop-in OpenAI-compatible endpoint for chat, reasoning, embeddings and images — with a generous free tier, live usage analytics and spend caps per key.
          </p>
          <div className="mt-10 max-w-md overflow-hidden rounded-xl border border-border bg-background/70 shadow-2xl backdrop-blur">
            <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
              <span className="size-2.5 rounded-full bg-danger/70" />
              <span className="size-2.5 rounded-full bg-warning/70" />
              <span className="size-2.5 rounded-full bg-success/70" />
              <span className="ml-2 font-mono text-[11px] text-subtle-foreground">quickstart.py</span>
            </div>
            <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-relaxed text-muted-foreground">
              <span className="text-accent">from</span> openai <span className="text-accent">import</span> OpenAI{"\n\n"}
              client = OpenAI({"\n"}
              {"    "}base_url=<span className="text-success">&quot;{API_BASE_URL}&quot;</span>,{"\n"}
              {"    "}api_key=<span className="text-success">&quot;{KEY_PREFIX}…&quot;</span>,{"\n"}
              ){"\n"}
              client.chat.completions.create(model=<span className="text-success">&quot;deepseek-v4.1-flash&quot;</span>, …)
            </pre>
          </div>
        </div>
      </aside>
    </div>
  );
}
