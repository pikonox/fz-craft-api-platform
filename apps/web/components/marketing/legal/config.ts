import { BRAND, IMAGE_RETENTION_HOURS, SITE_URL } from "@/lib/utils";

/**
 * Facts the policies rely on. The operator, country and email come from LEGAL_* in .env;
 * the retention numbers mirror what the API actually does — keep them in sync if you change it.
 */
// Treat "fz-craft" and "FZ-craft" as the same name, and always show the brand's spelling
const RAW_ENTITY = process.env.NEXT_PUBLIC_LEGAL_ENTITY || BRAND;
const ENTITY = RAW_ENTITY.toLowerCase() === BRAND.toLowerCase() ? BRAND : RAW_ENTITY;

export const LEGAL = {
  brand: BRAND,
  entity: ENTITY,
  /** How the operator is introduced: "Acme Ltd (“FZ-craft”)" — or just "FZ-craft" when they're the same. */
  who: ENTITY === BRAND ? BRAND : `${ENTITY} (“${BRAND}”)`,
  /** True when a separate legal entity runs the brand. */
  hasEntity: ENTITY !== BRAND,
  country: process.env.NEXT_PUBLIC_LEGAL_COUNTRY || "Pakistan",
  email: process.env.NEXT_PUBLIC_LEGAL_EMAIL || `support@${new URL(SITE_URL).hostname}`,
  site: SITE_URL,
  host: new URL(SITE_URL).hostname,
  effective: "14 November 2026",
  updated: "14 November 2026",
  /** apps/api: IMAGE_RETENTION_HOURS */
  imageHours: IMAGE_RETENTION_HOURS,
  /** apps/api: RequestLog TTL index */
  logDays: 90,
  /** apps/api: Notification TTL index */
  notificationDays: 180,
  /** apps/api: session cookie lifetime (sliding) */
  sessionDays: 30,
  sessionCookie: "nv_session",
  /** apps/api: one-time email codes */
  otpMinutes: 10,
  /** apps/api: first paid monthly plan refund window */
  refundHours: 24,
  /** apps/api: unpaid order expiry */
  autoOrderHours: 2,
  manualOrderHours: 72,
};

export type LegalSlug = "terms" | "privacy" | "refunds" | "acceptable-use" | "cookies" | "disclaimer";

export const LEGAL_PAGES: { slug: LegalSlug; title: string; summary: string }[] = [
  { slug: "terms", title: "Terms of Service", summary: "The agreement that covers your account, plans, payments and responsibilities." },
  { slug: "privacy", title: "Privacy Policy", summary: "What we collect, why, who processes it, how long we keep it and your choices." },
  { slug: "refunds", title: "Refund Policy", summary: "When plans, passes and wallet top-ups can be refunded, and how to ask." },
  { slug: "acceptable-use", title: "Acceptable Use Policy", summary: "What the API, Playground and Image Studio may not be used for." },
  { slug: "cookies", title: "Cookie Policy", summary: "The few cookies and browser storage items we use — none of them track you." },
  { slug: "disclaimer", title: "Disclaimer", summary: "AI output, third-party models and trademarks, payments and other limits." },
];
