import { Telegraf } from "telegraf";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { User } from "../db/models";
import { completeTelegramVerification } from "./referrals";
import { formatTokens, formatUsd } from "@nova/shared";

let bot: Telegraf | null = null;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function sendTelegramMessage(chatId: string, title: string, body = "") {
  if (!bot) return;
  try {
    await bot.telegram.sendMessage(chatId, `<b>${esc(title)}</b>${body ? `\n${esc(body)}` : ""}`, { parse_mode: "HTML" });
  } catch (err) {
    logger.warn({ err }, "telegram send failed");
  }
}

export function telegramDeepLink(token: string) {
  return `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${token}`;
}

export async function startTelegramBot() {
  if (!env.TELEGRAM_BOT_TOKEN) {
    logger.info("Telegram bot disabled (no TELEGRAM_BOT_TOKEN)");
    return;
  }
  bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

  bot.start(async (ctx) => {
    const token = (ctx.payload ?? "").trim();
    if (!token) {
      await ctx.reply(`👋 Welcome to ${env.BRAND_NAME}! Open Settings → Verify Telegram in your dashboard to link this account.`);
      return;
    }
    const user = await User.findOne({ "telegram.linkToken": token, "telegram.linkTokenExpires": { $gt: new Date() } });
    if (!user) {
      await ctx.reply("⚠️ This verification link has expired. Please generate a new one from your dashboard.");
      return;
    }
    const tgId = String(ctx.from.id);
    const result = await completeTelegramVerification(user._id, tgId, ctx.from.username ?? "");
    if (!result.ok) {
      await ctx.reply(`⚠️ ${result.message}`);
      return;
    }
    await ctx.reply(`✅ Verified! Your ${env.BRAND_NAME} account (${user.email}) is now linked. You'll get billing and usage alerts here.`);
  });

  bot.command("me", async (ctx) => {
    const user = await User.findOne({ "telegram.id": String(ctx.from.id) }).lean();
    if (!user) return void (await ctx.reply("This Telegram account isn't linked yet."));
    await ctx.reply(
      `👤 ${user.email}\n💰 Balance: ${formatUsd(user.mainBalance)}\n🖼 Image balance: ${formatUsd(user.imageBalance)}\n🎁 Bonus tokens: ${formatTokens(user.bonusTokens)}`,
    );
  });

  bot.help((ctx) => ctx.reply("Commands:\n/me – account summary"));

  bot.catch((err) => logger.warn({ err }, "telegram bot error"));
  bot
    .launch({ dropPendingUpdates: true })
    .catch((err) => logger.error({ err }, "Telegram bot failed to start"));
  logger.info({ bot: env.TELEGRAM_BOT_USERNAME }, "Telegram bot started (polling)");
}

export function stopTelegramBot() {
  bot?.stop();
}
