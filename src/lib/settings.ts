import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { db } from "./db";
import { decrypt, encrypt } from "./crypto";
import { type AllSettings, type SettingKey, parseSetting, settingSchemas } from "./settings-schema";

export const SETTINGS_TAG = "settings";

async function loadAll(): Promise<AllSettings> {
  const rows = await db.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    site: parseSetting("site", map.get("site")),
    seo: parseSetting("seo", map.get("seo")),
    business: parseSetting("business", map.get("business")),
    integrations: parseSetting("integrations", map.get("integrations")),
    robots: parseSetting("robots", map.get("robots")),
    email: parseSetting("email", map.get("email")),
    autopilot: parseSetting("autopilot", map.get("autopilot")),
  };
}

/** Herkese açık sayfalar için önbellekli okuma (ayar kaydında etiketle tazelenir). */
export const getSettings = cache(
  unstable_cache(loadAll, ["settings-all"], { tags: [SETTINGS_TAG], revalidate: 3600 }),
);

/** Yönetim paneli ve işler için önbelleksiz okuma. */
export const getSettingsFresh = loadAll;

export async function saveSetting<K extends SettingKey>(key: K, value: unknown): Promise<AllSettings[K]> {
  const parsed = settingSchemas[key].parse(value) as AllSettings[K];
  await db.setting.upsert({
    where: { key },
    create: { key, value: parsed as object },
    update: { value: parsed as object },
  });
  return parsed;
}

export async function getSecret(key: string): Promise<string | null> {
  const row = await db.secret.findUnique({ where: { key } });
  if (!row) return null;
  try {
    return decrypt(row);
  } catch {
    // APP_SECRET değiştiyse eski sır okunamaz; bağlantı yeniden kurulmalı.
    return null;
  }
}

export async function hasSecret(key: string): Promise<boolean> {
  return (await db.secret.count({ where: { key } })) > 0;
}

export async function setSecret(key: string, plain: string): Promise<void> {
  const box = encrypt(plain);
  await db.secret.upsert({ where: { key }, create: { key, ...box }, update: box });
}

export async function deleteSecret(key: string): Promise<void> {
  await db.secret.deleteMany({ where: { key } });
}
