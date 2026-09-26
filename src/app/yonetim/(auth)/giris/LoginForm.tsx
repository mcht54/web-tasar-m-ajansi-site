"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, { error: "" });
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="sonra" value={next} />
      <label className="block text-sm font-medium">E-posta veya kullanıcı adı
        <input name="email" type="text" required autoComplete="username" autoCapitalize="none" spellCheck={false} className="mt-1.5 w-full rounded-xl border border-line bg-card px-4 py-3 outline-none focus:border-ink" />
      </label>
      <label className="block text-sm font-medium">Şifre
        <input name="password" type="password" required autoComplete="current-password" className="mt-1.5 w-full rounded-xl border border-line bg-card px-4 py-3 outline-none focus:border-ink" />
      </label>
      {state.error && <p role="alert" className="text-sm text-bad">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-full bg-ink py-3 font-semibold text-paper disabled:opacity-60">
        {pending ? "Giriş yapılıyor…" : "Giriş yap"}
      </button>
    </form>
  );
}
