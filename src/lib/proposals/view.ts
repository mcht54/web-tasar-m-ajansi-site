// Panel gösterimi: öneri değişikliklerini okunur önce/sonra metnine çevirir (saf).

import { FIELD_LABELS } from "../admin/pages";

type Link = { path: string; anchor: string };
export type ChangeView = { path: string; field: string; label: string; before: string; after: string };

function show(v: unknown): string {
  if (v == null || v === "") return "(boş)";
  if (typeof v === "string") return v;
  return JSON.stringify(v, null, 1);
}

/** İç link listesi: yalnızca eklenen/çıkarılan bağlantılar; gövde: yalnızca eklenen kısım. */
export function describeChanges(changes: unknown): ChangeView[] {
  const pages = ((changes as { pages?: { path: string; changes: { field: string; before: unknown; after: unknown }[] }[] } | null)?.pages) ?? [];
  return pages.flatMap((p) =>
    p.changes.map((c) => {
      const label = FIELD_LABELS[c.field] ?? c.field;
      if (c.field === "relatedLinks") {
        const b = (c.before as Link[] | null) ?? [];
        const a = (c.after as Link[] | null) ?? [];
        const added = a.filter((l) => !b.some((x) => x.path === l.path));
        const removed = b.filter((l) => !a.some((x) => x.path === l.path));
        return {
          path: p.path, field: c.field, label,
          before: b.length ? b.map((l) => `${l.path} (“${l.anchor}”)`).join("\n") : "(bağlantı yok)",
          after: [...added.map((l) => `+ ${l.path} (“${l.anchor}”)`), ...removed.map((l) => `− ${l.path}`)].join("\n") || "(değişiklik yok)",
        };
      }
      if (c.field === "body" && typeof c.before === "string" && typeof c.after === "string" && c.after.startsWith(c.before.trimEnd())) {
        return { path: p.path, field: c.field, label, before: `(${c.before.split(/\s+/).length} kelimelik mevcut içerik korunur)`, after: `Eklenecek bölüm:\n${c.after.slice(c.before.trimEnd().length).trim()}` };
      }
      if (c.field === "status") return { path: p.path, field: c.field, label, before: c.before === "DRAFT" ? "Taslak (ziyaretçiye kapalı)" : show(c.before), after: c.after === "PUBLISHED" ? "Yayında" : show(c.after) };
      return { path: p.path, field: c.field, label, before: show(c.before), after: show(c.after) };
    }),
  );
}
