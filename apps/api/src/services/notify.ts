import type { Types } from "mongoose";
import type { NotificationType } from "@nova/shared";
import { Notification, User } from "../db/models";
import { sendMail } from "./mail";
import { sendTelegramMessage } from "./telegram";
import { logger } from "../lib/logger";
import { env } from "../config/env";

type Opts = { email?: boolean; telegram?: boolean };

const EMAIL_PREF: Partial<Record<NotificationType, "emailBilling" | "emailUsage" | "emailSecurity" | "emailProduct">> = {
  billing: "emailBilling",
  usage: "emailUsage",
  security: "emailSecurity",
  referral: "emailBilling",
  system: "emailProduct",
};

/** In-app notification, plus optional email / Telegram respecting the user's preferences. */
export async function notify(
  userId: Types.ObjectId | string,
  n: { type: NotificationType; title: string; body?: string; link?: string },
  opts: Opts = {},
) {
  try {
    await Notification.create({ userId, type: n.type, title: n.title, body: n.body ?? "", link: n.link ?? "" });
    if (!opts.email && !opts.telegram) return;
    const user = await User.findById(userId).select("email notificationPrefs telegram status").lean();
    if (!user || user.status !== "active") return;
    const pref = EMAIL_PREF[n.type];
    if (opts.email && (!pref || user.notificationPrefs?.[pref] !== false)) {
      const link = n.link ? `<p><a href="${env.APP_URL}${n.link}" style="color:#a78bfa">Open dashboard →</a></p>` : "";
      await sendMail(user.email, n.title, n.title, `${n.body ?? ""}${link}`);
    }
    if (opts.telegram && user.telegram?.id && user.notificationPrefs?.telegram !== false) {
      await sendTelegramMessage(user.telegram.id, n.title, n.body ?? "");
    }
  } catch (err) {
    logger.warn({ err }, "notify failed");
  }
}

export async function notifyAdmins(n: { type: NotificationType; title: string; body?: string; link?: string }) {
  const admins = await User.find({ role: "admin", status: "active" }).select("_id").lean();
  await Promise.all(admins.map((a) => notify(a._id, n, { telegram: true })));
}
