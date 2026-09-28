"use client";

import { useFormStatus } from "react-dom";

/**
 * Gönderim sırasında kilitlenen düğme (çift tıklama koruması). Sunucu tarafı ayrıca
 * idempotenttir; bu yalnızca kullanıcıya anında geri bildirim ve ikinci gönderimi engellemek içindir.
 */
export function SubmitButton({ children, pending, className }: { children: React.ReactNode; pending: string; className?: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <button type="submit" disabled={busy} aria-busy={busy} className={`${className ?? ""} disabled:cursor-wait disabled:opacity-60`}>
      {busy ? pending : children}
    </button>
  );
}
