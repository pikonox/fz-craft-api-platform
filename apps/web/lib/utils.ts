import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME || "FZ-craft";
/** Public OpenAI-compatible base URL users put in their SDKs (docs, snippets, dashboard). */
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "https://fzcraft.pikonox.com/v1").replace(/\/+$/, "");
/** Public site origin, derived from the API base URL. */
export const SITE_URL = API_BASE_URL.replace(/\/v1$/, "");
/** Prefix every API key starts with, e.g. "fz_live_". */
export const KEY_PREFIX = process.env.NEXT_PUBLIC_KEY_PREFIX || "fz_live_";
/** Generated images (and their history) are deleted after this many hours. */
export const IMAGE_RETENTION_HOURS = Number(process.env.NEXT_PUBLIC_IMAGE_RETENTION_HOURS) || 48;

export function relativeTime(date: string | number | Date | null | undefined): string {
  if (!date) return "never";
  const d = new Date(date).getTime();
  const diff = Date.now() - d;
  const abs = Math.abs(diff);
  const future = diff < 0;
  const fmt = (n: number, unit: string) => (future ? `in ${n}${unit}` : `${n}${unit} ago`);
  if (abs < 45_000) return future ? "soon" : "just now";
  if (abs < 3_600_000) return fmt(Math.round(abs / 60_000), "m");
  if (abs < 86_400_000) return fmt(Math.round(abs / 3_600_000), "h");
  if (abs < 30 * 86_400_000) return fmt(Math.round(abs / 86_400_000), "d");
  return formatDate(date);
}

export function formatDate(date: string | number | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", ...opts });
}

export function formatDateTime(date: string | number | Date | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function daysUntil(date: string | Date | null | undefined): number {
  if (!date) return 0;
  return Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000));
}

export function initials(name: string, email = ""): string {
  const src = (name || email.split("@")[0] || "?").trim();
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export const appOrigin = () => (typeof window !== "undefined" ? window.location.origin : "");
