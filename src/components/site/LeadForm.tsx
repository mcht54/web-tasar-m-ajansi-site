"use client";

import { useActionState } from "react";
import Link from "next/link";
import { submitLead, type LeadState } from "@/app/(site)/actions";

type Props = { cities: string[]; services: string[]; sourcePath: string };

const field = "mt-1.5 w-full rounded-xl border border-line bg-card px-4 py-3 text-[15px] outline-none transition-colors focus:border-ink";

export function LeadForm({ cities, services, sourcePath }: Props) {
  const [state, action, pending] = useActionState<LeadState, FormData>(submitLead, { ok: false, message: "" });
  if (state.ok) {
    return (
      <div role="status" className="rounded-2xl border border-ok/40 bg-card p-6">
        <p className="font-display text-2xl">Talebiniz alındı</p>
        <p className="mt-2 text-ink-soft">{state.message}</p>
      </div>
    );
  }
  const err = (k: string) =>
    state.errors?.[k] ? <span id={`${k}-hata`} className="mt-1 block text-sm text-bad">{state.errors[k]}</span> : null;
  const v = (k: string) => state.values?.[k] ?? "";
  const aria = (k: string) => (state.errors?.[k] ? { "aria-invalid": true, "aria-describedby": `${k}-hata` } : {});
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <input type="hidden" name="sourcePath" value={sourcePath} />
      <div aria-hidden className="absolute left-[-9999px]">
        <label>Web sitesi <input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <label className="text-sm font-medium">Ad Soyad *
        <input name="name" defaultValue={v("name")} required autoComplete="name" className={field} {...aria("name")} />{err("name")}
      </label>
      <label className="text-sm font-medium">Firma
        <input name="company" defaultValue={v("company")} autoComplete="organization" className={field} />
      </label>
      <label className="text-sm font-medium">Telefon *
        <input name="phone" defaultValue={v("phone")} type="tel" required autoComplete="tel" inputMode="tel" className={field} {...aria("phone")} />{err("phone")}
      </label>
      <label className="text-sm font-medium">E-posta
        <input name="email" defaultValue={v("email")} type="email" autoComplete="email" className={field} {...aria("email")} />{err("email")}
      </label>
      <label className="text-sm font-medium">Şehir
        <select name="city" className={field} defaultValue={v("city")}>
          <option value="">Seçin</option>
          {cities.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">Hizmet
        <select name="service" className={field} defaultValue={v("service")}>
          <option value="">Seçin</option>
          {services.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium sm:col-span-2">Mesajınız
        <textarea name="message" defaultValue={v("message")} rows={5} className={field} placeholder="Varsa mevcut sitenizin adresini ve hedeflerinizi yazın." />
      </label>
      <label className="flex items-start gap-3 text-sm text-ink-soft sm:col-span-2">
        <input type="checkbox" name="consent" defaultChecked={v("consent") === "on"} className="mt-1 h-4 w-4 accent-[var(--accent)]" {...aria("consent")} />
        <span>
          <Link href="/kvkk-aydinlatma-metni" className="underline underline-offset-2">Aydınlatma metnini</Link> okudum; talebime yanıt verilmesi için bilgilerimin işlenmesini kabul ediyorum. *
          {err("consent")}
        </span>
      </label>
      {state.message && !state.ok && <p role="alert" className="text-sm text-bad sm:col-span-2">{state.message}</p>}
      <div className="sm:col-span-2">
        <button disabled={pending} className="rounded-full bg-accent px-6 py-3 font-semibold text-accent-ink disabled:opacity-60">
          {pending ? "Gönderiliyor…" : "Gönder"}
        </button>
      </div>
    </form>
  );
}
