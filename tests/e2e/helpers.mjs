import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

export const BASE = process.env.E2E_BASE || "http://localhost:3300";
export const TEST_BASE = "http://localhost:3310";

export function adminCreds() {
  const txt = readFileSync(new URL("../../.local/ilk-yonetici.txt", import.meta.url), "utf8");
  return { email: /E-posta: (.+)/.exec(txt)[1].trim(), password: /Şifre: (.+)/.exec(txt)[1].trim() };
}

export async function browser() {
  return chromium.launch({ channel: "chrome", headless: true });
}

export async function login(page, creds = adminCreds()) {
  const base = page.context()._options?.baseURL || BASE;
  await page.goto(`${base}/yonetim`);
  await page.fill('input[name="email"]', creds.email);
  await page.fill('input[name="password"]', creds.password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/yonetim/giris")), page.click('button:has-text("Giriş yap")')]);
}
