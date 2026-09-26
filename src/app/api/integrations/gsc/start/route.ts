import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { authUrl } from "@/lib/gsc/oauth";

export const dynamic = "force-dynamic";

// "Google Search Console'u Bağla" → Google izin ekranı (yalnızca Ayarlar yetkisi)
export async function GET() {
  const user = await currentUser();
  if (!user || !can(user.role, "settings")) return new Response("Yetkisiz", { status: 403 });
  let url: string;
  try {
    url = await authUrl(user.id);
  } catch (e) {
    redirect(`/yonetim/ayarlar?sekme=entegrasyon&hata=${encodeURIComponent((e as Error).message)}`);
  }
  redirect(url);
}
