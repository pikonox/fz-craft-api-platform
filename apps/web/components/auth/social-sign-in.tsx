"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { firebaseConfigured, firebaseErrorMessage, inAppBrowser, isCancelled, loadFirebase, socialSignIn, type SocialProvider } from "@/lib/firebase";
import { cn } from "@/lib/utils";

function GoogleG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

const PROVIDERS: { id: SocialProvider; label: string }[] = [
  { id: "google", label: "Continue with Google" },
  { id: "github", label: "Continue with GitHub" },
];

/** "Continue with Google" and "Continue with GitHub" (Firebase Auth): the only ways to create an account. */
export function SocialSignIn({ next = "/dashboard", referral, className }: { next?: string; referral?: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [app, setApp] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setApp(inAppBrowser(navigator.userAgent));
    // Load the SDK now so the click opens the sign-in window immediately (browsers block late pop-ups)
    if (firebaseConfigured) loadFirebase().catch(() => {});
  }, []);

  const signIn = async (which: SocialProvider) => {
    setBusy(which);
    try {
      const { idToken, githubToken } = await socialSignIn(which);
      // New accounts can start from the login page too: keep an invite code saved earlier
      let ref = referral;
      try {
        ref ||= localStorage.getItem("ref") || undefined;
      } catch {}
      await api("/api/auth/firebase", { body: { idToken, githubToken, ref } });
      try {
        localStorage.removeItem("ref");
      } catch {}
      router.replace(next);
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      if (code.startsWith("auth/")) {
        if (!isCancelled(code)) toast.error(firebaseErrorMessage(code, which));
      } else {
        toast.error(errorMessage(e));
      }
      setBusy(null);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Long-press the address bar instead.");
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      {app && (
        <div className="rounded-xl border border-warning/30 bg-warning-soft px-3.5 py-3 text-[13px] text-warning">
          <p className="flex items-start gap-2 font-medium">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Sign-in doesn&apos;t work inside {app}&apos;s built-in browser.
          </p>
          <p className="mt-1 pl-6 text-foreground/80">
            Tap <b>⋯</b> (or the share icon) and choose <b>Open in browser</b>, or copy this link into Chrome or Safari.
          </p>
          <Button variant="outline" size="sm" className="ml-6 mt-2.5 bg-card" onClick={copyLink}>
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      )}
      {PROVIDERS.map((p) => (
        <Button
          key={p.id}
          type="button"
          variant="outline"
          size="lg"
          className={cn(
            "w-full gap-3 text-[15px] font-medium shadow-sm",
            p.id === "github" ? "border-transparent bg-[#24292f] text-white hover:bg-[#32383f] dark:bg-white dark:text-[#24292f] dark:hover:bg-zinc-200" : "bg-card hover:bg-muted",
          )}
          onClick={() => signIn(p.id)}
          loading={busy === p.id}
          disabled={!firebaseConfigured || busy !== null}
        >
          {busy !== p.id && (p.id === "google" ? <GoogleG className="size-5" /> : <GitHubMark className="size-5" />)}
          {p.label}
        </Button>
      ))}
      {!firebaseConfigured && <p className="text-center text-xs text-muted-foreground">Sign-in isn&apos;t set up on this server yet (FIREBASE_* in .env).</p>}
    </div>
  );
}
