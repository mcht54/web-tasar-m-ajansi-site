import { type PageInput, pageInputSchema } from "./pages";

function lines(v: FormDataEntryValue | null): string[] {
  return String(v ?? "").split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
}

/** Tarayıcılar textarea'ları CRLF ile gönderir; kayıtta LF'ye normalize edilir (hayalet diff olmasın). */
const nl = (v: FormDataEntryValue | null) => String(v ?? "").replace(/\r\n?/g, "\n");

export function formToInput(form: FormData): { input?: PageInput; error?: string } {
  const qs = form.getAll("faq_q").map(String);
  const as = form.getAll("faq_a").map(nl);
  const raw = {
    path: String(form.get("path") ?? ""),
    status: String(form.get("status") ?? "DRAFT"),
    name: String(form.get("name") ?? ""),
    breadcrumbLabel: String(form.get("breadcrumbLabel") ?? ""),
    seoTitle: String(form.get("seoTitle") ?? ""),
    metaDescription: nl(form.get("metaDescription")),
    h1: String(form.get("h1") ?? ""),
    intro: nl(form.get("intro")),
    body: nl(form.get("body")),
    faq: qs.map((q, i) => ({ q, a: as[i] ?? "" })).filter((f) => f.q.trim() || f.a.trim()),
    canonical: String(form.get("canonical") ?? ""),
    robotsIndex: form.get("robotsIndex") === "on",
    robotsFollow: form.get("robotsFollow") === "on",
    ogTitle: String(form.get("ogTitle") ?? ""),
    ogDescription: String(form.get("ogDescription") ?? ""),
    ogImageId: String(form.get("ogImageId") ?? ""),
    schemaDisabled: form.getAll("schemaDisabled").map(String),
    primaryKeyword: String(form.get("primaryKeyword") ?? ""),
    secondaryKeywords: lines(form.get("secondaryKeywords")),
    excerpt: String(form.get("excerpt") ?? ""),
    category: String(form.get("category") ?? ""),
    authorName: String(form.get("authorName") ?? ""),
  };
  const p = pageInputSchema.safeParse(raw);
  if (!p.success) return { error: p.error.issues.map((i) => i.message).join("; ") };
  return { input: p.data };
}

