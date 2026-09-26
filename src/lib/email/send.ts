import "server-only";
// E-posta gönderimi (SMTP, nodemailer). SMTP şifresi şifreli sır olarak saklanır
// ve hiçbir ekranda gösterilmez. Her gönderim denemesi EmailLog'a yazılır:
// SMTP yapılandırılmamışsa rapor "not_configured" olarak kaydedilir ve panelde
// okunabilir — sessizce kaybolmaz.
//
// EMAIL_TRANSPORT=log → gönderilmez, yalnızca kaydedilir (test/geliştirme).

import nodemailer from "nodemailer";
import { db } from "../db";
import { getSecret, getSettingsFresh } from "../settings";
import { smtpEncryptionOf } from "../settings-schema";

export const SMTP_SECRET = "smtp.password";

export type MailKind = "weekly" | "daily" | "alarm" | "test";
export type SendResult = { id: string; status: "sent" | "failed" | "not_configured" | "logged"; error: string | null };

export async function sendMail(kind: MailKind, subject: string, html: string, text: string, to?: string): Promise<SendResult> {
  const { email } = await getSettingsFresh();
  const recipient = (to ?? email.recipient).trim();
  const log = (status: SendResult["status"], error: string | null) =>
    db.emailLog.create({ data: { kind, to: recipient || "(alıcı yok)", subject, html, text, status, error } }).then((r) => ({ id: r.id, status, error }));

  if (!recipient) return log("not_configured", "Alıcı e-posta adresi tanımlı değil");
  if (process.env.EMAIL_TRANSPORT === "log") return log("logged", null);
  if (!email.smtpHost) return log("not_configured", "SMTP sunucusu tanımlı değil (Ayarlar → SEO E-posta)");
  const password = await getSecret(SMTP_SECRET);
  try {
    const enc = smtpEncryptionOf(email);
    const transport = nodemailer.createTransport({
      host: email.smtpHost,
      port: email.smtpPort,
      secure: enc === "ssl",
      requireTLS: enc === "starttls",
      ignoreTLS: enc === "none",
      auth: email.smtpUser ? { user: email.smtpUser, pass: password ?? "" } : undefined,
      connectionTimeout: 15_000,
    });
    const fromAddr = email.smtpFrom || email.smtpUser || recipient;
    await transport.sendMail({ from: email.smtpFromName ? { name: email.smtpFromName, address: fromAddr } : fromAddr, to: recipient, subject, html, text });
    return log("sent", null);
  } catch (e) {
    // Hata mesajında şifre bulunmaz; yine de kısaltılarak saklanır
    return log("failed", (e instanceof Error ? e.message : String(e)).slice(0, 500));
  }
}
