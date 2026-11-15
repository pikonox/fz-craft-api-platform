import { Setting } from "../db/models";
import { env } from "../config/env";
import { REFERRAL_REWARD_TOKENS } from "@nova/shared";

export const QUICK_INTENTS = ["greeting", "salam", "howAreYou", "identity", "thanks"] as const;
export type QuickIntent = (typeof QUICK_INTENTS)[number];
export type QuickReplySettings = { enabled: boolean } & Record<QuickIntent, string[]>;

/**
 * Instant answers for messages that are only a greeting, "which model are you?" or thanks — no
 * upstream call, so they cost no provider tokens. One answer is picked at random per intent; an
 * empty list turns that intent off. Placeholders: {model} {vendor} {brand}.
 */
export const QUICK_REPLY_DEFAULTS: QuickReplySettings = {
  enabled: true,
  greeting: [
    "Hello! 👋 I'm {model} on {brand}. How can I help you today?",
    "Hi there! 👋 What can I help you with today?",
    "Hey! 👋 Ask me anything: code, writing, research, or an idea you want to explore.",
  ],
  salam: ["Wa Alaikum Assalam! 👋 I'm {model} on {brand}. How can I help you today?"],
  howAreYou: ["I'm doing great, thanks for asking! 😊 I'm {model} on {brand}. What can I help you with today?"],
  identity: ["I'm {model}, running on {brand}, the AI platform created by Mr Fahad. How can I help you today?"],
  thanks: ["You're welcome! 😊 Let me know if there's anything else I can help with.", "Happy to help! Is there anything else you'd like to do?"],
};

/** Admin-editable runtime settings with defaults. */
export const SETTING_DEFAULTS = {
  pkrPerUsd: 280,
  statusBanner: { level: "none" as "none" | "info" | "warning" | "outage", message: "" },
  /** When the Telegram bot is configured, free-tier API usage requires a verified Telegram account */
  requireTelegramForFree: true,
  referralRewardTokens: REFERRAL_REWARD_TOKENS,
  signupBonusTokens: 0,
  /** Chat model used for titles and the image prompt enhancer ("" = first enabled free chat model) */
  utilityModel: "",
  /** Default model in Image Studio */
  imageDefaultModel: "",
  supportEmail: "support@example.com",
  announcement: "",
  quickReplies: QUICK_REPLY_DEFAULTS,
};
export type Settings = typeof SETTING_DEFAULTS;
export type SettingKey = keyof Settings;

let cache: { at: number; value: Settings } | null = null;
let loading: Promise<Settings> | null = null;
const TTL = 15_000;

function load(): Promise<Settings> {
  if (!loading) {
    loading = Setting.find()
      .lean()
      .then((rows) => {
        const value = { ...SETTING_DEFAULTS } as Settings;
        for (const r of rows) {
          if (r.key in value) (value as Record<string, unknown>)[r.key] = r.value;
        }
        cache = { at: Date.now(), value };
        return value;
      })
      .finally(() => (loading = null));
  }
  return loading;
}

/** Stale-while-revalidate: only the first load waits on the database; later refreshes happen in the background. */
export async function getSettings(): Promise<Settings> {
  if (!cache) return load();
  if (Date.now() - cache.at >= TTL) load().catch(() => {});
  return cache.value;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<Settings[K]> {
  return (await getSettings())[key];
}

export async function updateSettings(patch: Partial<Settings>) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in SETTING_DEFAULTS)) continue;
    await Setting.updateOne({ key }, { $set: { value } }, { upsert: true });
  }
  cache = null;
  return getSettings();
}

export const telegramEnabled = () => Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_USERNAME);
