import Link from "next/link";

export function PageTitle({ title, desc, actions }: { title: string; desc?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl leading-tight">{title}</h1>
        {desc && <p className="mt-1 max-w-3xl text-muted">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "ok" | "warn" | "bad" }) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "";
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const TONES = {
  ok: "bg-ok/12 text-ok border-ok/30",
  warn: "bg-warn/12 text-warn border-warn/30",
  bad: "bg-bad/12 text-bad border-bad/30",
  info: "bg-accent-soft text-accent border-accent/30",
  muted: "bg-paper text-muted border-line",
} as const;

export function Badge({ tone = "muted", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return <Badge>—</Badge>;
  return <Badge tone={score >= 80 ? "ok" : score >= 60 ? "warn" : "bad"}>{score}</Badge>;
}

export const SEVERITY_TONE = { CRITICAL: "bad", HIGH: "bad", MEDIUM: "warn", LOW: "muted" } as const;
export const SEVERITY_LABEL = { CRITICAL: "Kritik", HIGH: "Yüksek", MEDIUM: "Orta", LOW: "Düşük" } as const;

export function SeverityBadge({ s }: { s: keyof typeof SEVERITY_TONE }) {
  return <Badge tone={SEVERITY_TONE[s]}>{SEVERITY_LABEL[s]}</Badge>;
}

export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: string }) {
  const rows = Array.isArray(children) ? children.flat().filter(Boolean) : children ? [children] : [];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            {head.map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&_td]:px-3 [&_td]:py-2 [&_td]:align-top">{children}</tbody>
      </table>
      {rows.length === 0 && <p className="px-3 py-6 text-center text-muted">{empty ?? "Kayıt yok."}</p>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line p-8 text-center text-muted">{children}</div>;
}

export const inputCls = "mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-ink";

export function Field({ label, hint, children, className = "" }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block text-[13px] font-medium ${className}`}>
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}

export function Button({ children, variant = "primary", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const v = variant === "primary" ? "bg-ink text-paper" : variant === "danger" ? "bg-bad text-white" : "border border-line bg-card hover:border-ink";
  return <button {...rest} className={`rounded-full px-4 py-2 text-[13px] font-semibold disabled:opacity-50 ${v} ${rest.className ?? ""}`}>{children}</button>;
}

export function LinkButton({ href, children, variant = "ghost" }: { href: string; children: React.ReactNode; variant?: "primary" | "ghost" }) {
  const v = variant === "primary" ? "bg-ink text-paper" : "border border-line bg-card hover:border-ink";
  return <Link href={href} className={`inline-block rounded-full px-4 py-2 text-[13px] font-semibold ${v}`}>{children}</Link>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "bad" | "ok"; children: React.ReactNode }) {
  const c = tone === "warn" ? "border-warn/40 bg-warn/10" : tone === "bad" ? "border-bad/40 bg-bad/10" : tone === "ok" ? "border-ok/40 bg-ok/10" : "border-line bg-card";
  return <div className={`rounded-xl border px-4 py-3 ${c}`}>{children}</div>;
}

export function fmtDate(d: Date | string | null | undefined, withTime = false): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("tr-TR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(d));
}

export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}

export function Pagination({ page, total, size, hrefFor }: { page: number; total: number; size: number; hrefFor: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <nav className="mt-4 flex items-center gap-2 text-sm">
      {page > 1 && <Link href={hrefFor(page - 1)} className="rounded-full border border-line px-3 py-1">‹ Önceki</Link>}
      <span className="text-muted">{page} / {pages} · {fmtNum(total)} kayıt</span>
      {page < pages && <Link href={hrefFor(page + 1)} className="rounded-full border border-line px-3 py-1">Sonraki ›</Link>}
    </nav>
  );
}

/** Şu andan n gün öncesi (sunucu bileşenlerinde render dışı zaman hesabı için). */
export function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400_000);
}
