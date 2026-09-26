import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { Badge, Card, Notice, PageTitle, Table, fmtDate, inputCls } from "@/components/admin/ui";
import { LEAD_STATUS_LABELS } from "@/lib/admin/labels";

export const metadata = { title: "Lead / Teklif Talepleri" };
const STATUSES = ["NEW", "CALLED", "QUOTE_SENT", "FOLLOW_UP", "CUSTOMER", "LOST"] as const;
const TONE = { NEW: "info", CALLED: "muted", QUOTE_SENT: "warn", FOLLOW_UP: "warn", CUSTOMER: "ok", LOST: "bad" } as const;

async function updateLead(form: FormData) {
  "use server";
  const user = await requireUser("leads");
  const id = String(form.get("id"));
  const status = z.enum(STATUSES).parse(form.get("status"));
  const notes = String(form.get("notes") ?? "").slice(0, 5000) || null;
  const before = await db.lead.findUniqueOrThrow({ where: { id }, select: { status: true } });
  await db.lead.update({ where: { id }, data: { status, notes } });
  await audit(user.id, "lead.update", "Lead", id, { from: before.status, to: status });
  redirect(`/yonetim/leadler?id=${id}&kaydedildi=1`);
}

export default async function Leads(props: PageProps<"/yonetim/leadler">) {
  await requireUser("leads");
  const sp = await props.searchParams;
  const status = typeof sp.durum === "string" ? sp.durum : "";
  const [leads, counts] = await Promise.all([
    db.lead.findMany({ where: status ? { status: status as (typeof STATUSES)[number] } : {}, orderBy: { createdAt: "desc" }, take: 300 }),
    db.lead.groupBy({ by: ["status"], _count: true }),
  ]);
  const sel = typeof sp.id === "string" ? await db.lead.findUnique({ where: { id: sp.id } }) : null;
  const history = sel ? await db.auditLog.findMany({ where: { entity: "Lead", entityId: sel.id }, orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } }) : [];
  return (
    <>
      <PageTitle title="Lead / Teklif Talepleri" />
      {sp.kaydedildi && <div className="mb-4"><Notice tone="ok">Kaydedildi.</Notice></div>}
      <div className="mb-4 flex flex-wrap gap-2 text-[13px]">
        <Link href="?" className={`rounded-full px-3 py-1.5 ${!status ? "bg-ink text-paper" : "border border-line"}`}>Tümü</Link>
        {STATUSES.map((s) => <Link key={s} href={`?durum=${s}`} className={`rounded-full px-3 py-1.5 ${status === s ? "bg-ink text-paper" : "border border-line"}`}>{LEAD_STATUS_LABELS[s]} ({counts.find((c) => c.status === s)?._count ?? 0})</Link>)}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <Card>
          <Table head={["Tarih", "Ad", "Firma", "Telefon", "Şehir", "Hizmet", "Kaynak", "Durum"]} empty="Talep yok.">
            {leads.map((l) => (
              <tr key={l.id} className={l.id === sel?.id ? "bg-paper" : ""}>
                <td className="whitespace-nowrap">{fmtDate(l.createdAt, true)}</td>
                <td><Link href={`?id=${l.id}${status ? `&durum=${status}` : ""}`} className="font-medium hover:underline">{l.name}</Link></td>
                <td>{l.company ?? "—"}</td><td className="whitespace-nowrap">{l.phone}</td><td>{l.city ?? "—"}</td><td>{l.service ?? "—"}</td>
                <td className="text-xs">{l.sourcePath ?? "—"}</td>
                <td><Badge tone={TONE[l.status]}>{LEAD_STATUS_LABELS[l.status]}</Badge></td>
              </tr>
            ))}
          </Table>
        </Card>
        {sel && (
          <Card title={sel.name}>
            <dl className="grid grid-cols-[90px_1fr] gap-y-1 text-[13px]">
              <dt className="text-muted">Firma</dt><dd>{sel.company ?? "—"}</dd>
              <dt className="text-muted">Telefon</dt><dd><a href={`tel:${sel.phone.replace(/\s/g, "")}`} className="underline">{sel.phone}</a></dd>
              <dt className="text-muted">E-posta</dt><dd>{sel.email ? <a href={`mailto:${sel.email}`} className="underline">{sel.email}</a> : "—"}</dd>
              <dt className="text-muted">Şehir</dt><dd>{sel.city ?? "—"}</dd>
              <dt className="text-muted">Hizmet</dt><dd>{sel.service ?? "—"}</dd>
              <dt className="text-muted">KVKK onayı</dt><dd>{fmtDate(sel.consentAt, true)}</dd>
            </dl>
            {sel.message && <p className="mt-3 whitespace-pre-line rounded-lg bg-paper p-3 text-[13px]">{sel.message}</p>}
            <form action={updateLead} className="mt-4 space-y-2">
              <input type="hidden" name="id" value={sel.id} />
              <select name="status" defaultValue={sel.status} className={inputCls}>{STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>)}</select>
              <textarea name="notes" defaultValue={sel.notes ?? ""} rows={4} placeholder="Görüşme notları" className={inputCls} />
              <button className="rounded-full bg-ink px-4 py-2 text-paper">Kaydet</button>
            </form>
            {history.length > 0 && (
              <ul className="mt-4 space-y-1 text-xs text-muted">
                {history.map((h) => <li key={h.id}>{fmtDate(h.createdAt, true)} · {h.user?.name ?? "—"} · {(h.detail as { from?: string; to?: string })?.from ? `${LEAD_STATUS_LABELS[(h.detail as { from: string }).from]} → ${LEAD_STATUS_LABELS[(h.detail as { to: string }).to]}` : h.action}</li>)}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
