import nodemailer from "nodemailer";
import { env } from "../config/env";
import { logger } from "../lib/logger";

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

/** The full HTML of an email (also used to preview emails). */
export function layout(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#0b0b0f;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e4e4e7">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px">
    <div style="font-weight:700;font-size:18px;margin-bottom:24px;color:#fff">${env.BRAND_NAME}</div>
    <div style="background:#131318;border:1px solid #26262d;border-radius:14px;padding:28px">
      <h1 style="margin:0 0 12px;font-size:20px;color:#fff">${title}</h1>
      <div style="font-size:14px;line-height:1.6;color:#a1a1aa">${body}</div>
    </div>
    <p style="font-size:12px;color:#52525b;margin-top:24px">You received this because you have an account at ${env.APP_URL}.</p>
  </div></body></html>`;
}

/** Never throws. "logged" = no SMTP is configured, so the email was printed to the log instead. */
export async function sendMail(to: string, subject: string, title: string, bodyHtml: string): Promise<"sent" | "logged" | "failed"> {
  if (!transport) {
    logger.info({ to, subject }, `📧 [dev mail] ${title}: ${bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`);
    return "logged";
  }
  try {
    await transport.sendMail({ from: env.MAIL_FROM, to, subject, html: layout(title, bodyHtml) });
    return "sent";
  } catch (err) {
    logger.error({ err, to, subject }, "Failed to send email");
    return "failed";
  }
}

export function sendOtpEmail(to: string, code: string, purpose: "verify" | "reset") {
  const title = purpose === "verify" ? "Verify your email" : "Reset your password";
  const body = `Your code is<div style="font-size:32px;letter-spacing:8px;font-weight:700;color:#fff;margin:16px 0">${code}</div>It expires in 10 minutes. If you didn't request this, you can ignore this email.`;
  return sendMail(to, `${code} is your ${env.BRAND_NAME} code`, title, body);
}
