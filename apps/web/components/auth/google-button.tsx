"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { firebaseConfigured, firebaseErrorMessage, googleIdToken, inAppBrowser, isCancelled, loadFirebase } from "@/lib/firebase";
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

/** "Continue with Google" (Firebase Auth). The only way to create an account. */
export function GoogleButton({ next = "/dashboard", referral, className }: { next?: string; referral?: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [app, setApp] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setApp(inAppBrowser(navigator.userAgent));
    // Load the SDK now so the click opens Google's window immediately (browsers block late pop-ups)
    if (firebaseConfigured) loadFirebase().catch(() => {});
  }, []);

  const signIn = async () => {
    setBusy(true);
    try {
      const idToken = await googleIdToken();
      // New accounts can start from the login page too: keep an invite code saved earlier
      let ref = referral;
      try {
        ref ||= localStorage.getItem("ref") || undefined;
      } catch {}
      await api("/api/auth/firebase", { body: { idToken, ref } });
      try {
        localStorage.removeItem("ref");
      } catch {}
      router.replace(next);
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      if (code.startsWith("auth/")) {
        if (!isCancelled(code)) toast.error(firebaseErrorMessage(code));
      } else {
        toast.error(errorMessage(e));
      }
      setBusy(false);
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
            Google doesn&apos;t allow sign-in inside {app}&apos;s built-in browser.
          </p>
          <p className="mt-1 pl-6 text-foreground/80">
            Tap <b>⋯</b> (or the share icon) and choose <b>Open in browser</b>, or copy this link into Chrome or Safari.
          </p>
          <Button variant="outline" size="sm" className="ml-6 mt-2.5 bg-card" onClick={copyLink}>
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full gap-3 bg-card text-[15px] font-medium shadow-sm hover:bg-muted"
        onClick={signIn}
        loading={busy}
        disabled={!firebaseConfigured || busy}
      >
        {!busy && <GoogleG className="size-5" />}
        Continue with Google
      </Button>
      {!firebaseConfigured && <p className="text-center text-xs text-muted-foreground">Google sign-in isn&apos;t set up on this server yet (FIREBASE_* in .env).</p>}
    </div>
  );
}
