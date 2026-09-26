"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { hmac } from "@/lib/crypto";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";

export type LeadState = { ok: boolean; message: string; errors?: Record<string, string>; values?: Record<string, string> };

const leadSchema = z.object({
  name: z.string().trim().min(2, "Adınızı yazın").max(120),
  company: z.string().trim().max(160).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s()-]{8,19}$/, "Geçerli bir telefon numarası yazın"),
  email: z.union([z.literal(""), z.email("Geçerli bir e-posta yazın").max(160)]).optional(),
  city: z.string().trim().max(60).optional(),
  service: z.string().trim().max(80).optional(),
  message: z.string().trim().max(3000).optional(),
  consent: z.literal("on", { error: "Aydınlatma metnini onaylamanız gerekiyor" }),
  sourcePath: z.string().max(300).optional(),
});

export async function submitLead(_prev: LeadState, form: FormData): Promise<LeadState> {
  // Bal küpü: gerçek kullanıcı bu gizli alanı doldurmaz.
  if (String(form.get("website") ?? "").length > 0) return { ok: true, message: "Talebiniz alındı." };

  const h = await headers();
  const ip = clientIp(h);
  if (!(await rateLimit(`lead:${hmac(ip)}`, 5, 600))) {
    return { ok: false, message: "Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.", values: Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])) };
  }
  const parsed = leadSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    // React form eylemi sonrası formu sıfırlar; kullanıcının yazdıkları kaybolmasın
    const values = Object.fromEntries([...form.entries()].filter(([k]) => k !== "website").map(([k, v]) => [k, String(v)]));
    return { ok: false, message: "Lütfen işaretli alanları kontrol edin.", errors, values };
  }
  const d = parsed.data;
  await db.lead.create({
    data: {
      name: d.name,
      company: d.company || null,
      phone: d.phone,
      email: d.email || null,
      city: d.city || null,
      service: d.service || null,
      message: d.message || null,
      sourcePath: d.sourcePath || null,
      ipHash: hmac(ip),
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
      consentAt: new Date(),
    },
  });
  return { ok: true, message: "Teşekkürler, talebiniz alındı. En kısa sürede sizinle iletişime geçeceğiz." };
}
