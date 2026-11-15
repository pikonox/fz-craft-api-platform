"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";

declare global {
  interface Window {
    google?: any;
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();

/** Google Identity Services button. Renders nothing unless a client id is configured. */
export function GoogleButton({ next = "/dashboard", referral }: { next?: string; referral?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) return;
    const init = () => {
      if (!window.google || !ref.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: async (resp: { credential: string }) => {
          try {
            await api("/api/auth/google", { body: { credential: resp.credential, ref: referral } });
            router.replace(next);
          } catch (e) {
            toast.error(errorMessage(e));
          }
        },
      });
      window.google.accounts.id.renderButton(ref.current, { theme: "filled_black", size: "large", shape: "rectangular", width: ref.current.offsetWidth || 360, text: "continue_with" });
      setReady(true);
    };
    if (window.google) return init();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = init;
    document.head.appendChild(s);
  }, [next, referral, router]);

  if (!CLIENT_ID) return null;
  return (
    <>
      <div ref={ref} className="flex min-h-10 w-full justify-center [color-scheme:normal]" style={{ opacity: ready ? 1 : 0.4 }} />
      <div className="my-5 flex items-center gap-3 text-xs text-subtle-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}
