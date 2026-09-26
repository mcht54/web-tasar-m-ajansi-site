import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Giriş" };

export default async function LoginPage(props: PageProps<"/yonetim/giris">) {
  if (await currentUser()) redirect("/yonetim");
  const sp = await props.searchParams;
  const next = typeof sp.sonra === "string" ? sp.sonra : "/yonetim";
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-card p-8">
        <p className="font-display text-3xl">Yönetim paneli</p>
        <p className="mb-6 mt-1 text-muted">webtasarimajansi.net</p>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
