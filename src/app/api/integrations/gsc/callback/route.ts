import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { checkState, exchangeCode } from "@/lib/gsc/oauth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const back = (q: string) => `/yonetim/ayarlar?sekme=entegrasyon&${q}`;

// Google yetkilendirme dönüşü: state doğrulanır (CSRF), kod yenileme token'ına çevrilir, şifreli saklanır.
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || !can(user.role, "settings")) return new Response("Yetkisiz", { status: 403 });
  const u = new URL(req.url);
  const err = u.searchParams.get("error");
  if (err) redirect(back(`hata=${encodeURIComponent(`Google yetkilendirmesi iptal edildi veya reddedildi (${err})`)}`));
  if (!checkState(u.searchParams.get("state"), user.id)) redirect(back(`hata=${encodeURIComponent("Geçersiz veya süresi dolmuş istek (state). Tekrar deneyin.")}`));
  let msg: string;
  try {
    const conn = await exchangeCode(String(u.searchParams.get("code") ?? ""));
    await audit(user.id, "gsc.oauth.connect", "Secret", "gsc.oauth", { email: conn.email });
    msg = `Search Console bağlandı${conn.email ? ` (${conn.email})` : ""}. Şimdi mülkü seçin.`;
  } catch (e) {
    redirect(back(`hata=${encodeURIComponent((e as Error).message)}`));
  }
  redirect(back(`test=${encodeURIComponent(msg)}`));
}
