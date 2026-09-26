// Güvenli Markdown işleme. İçerik yönetim panelinden gelir; editör hesabı ele
// geçirilse bile sayfaya script sızmasın diye ham HTML hiçbir zaman geçirilmez,
// bağlantı şemaları beyaz listeyle sınırlanır.
//
// Başlık kuralı: sayfanın tek H1'i şablondadır. Gövdedeki "#" başlıklar H2'ye
// indirilir, böylece hiçbir sayfada ikinci H1 oluşmaz.

import { Marked, type Token, type Tokens } from "marked";
import { slugify } from "./slug";

export type MediaInfo = {
  width: number;
  height: number;
  alt?: string | null;
  sources?: { type: string; srcset: string }[];
};

export type RenderOptions = {
  media?: Map<string, MediaInfo>;
  siteHost?: string;
};

const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isInternalHref(href: string, siteHost?: string): boolean {
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  if (!siteHost) return false;
  try {
    return new URL(href).host === siteHost;
  } catch {
    return false;
  }
}

export function renderMarkdown(md: string, opts: RenderOptions = {}): string {
  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    renderer: {
      html({ text }) {
        return escapeHtml(text);
      },
      // Görev listesi kutuları okunmaz form alanı olmasın (erişilebilirlik): sembol olarak
      checkbox({ checked }) {
        return `<span class="task" aria-hidden="true">${checked ? "☑" : "☐"}</span> `;
      },
      heading({ tokens, depth }) {
        const level = Math.min(Math.max(depth, 2), 4);
        const inner = this.parser.parseInline(tokens);
        const id = slugify(plainInline(tokens));
        return `<h${level} id="${id}">${inner}</h${level}>\n`;
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        if (!SAFE_HREF.test(href)) return inner;
        const t = title ? ` title="${escapeHtml(title)}"` : "";
        const external = !isInternalHref(href, opts.siteHost) && /^https?:/i.test(href);
        const rel = external ? ` rel="noopener"` : "";
        return `<a href="${escapeHtml(href)}"${t}${rel}>${inner}</a>`;
      },
      image({ href, title, text }) {
        if (!SAFE_HREF.test(href)) return "";
        const info = opts.media?.get(href);
        const alt = escapeHtml(text || info?.alt || "");
        const dims = info ? ` width="${info.width}" height="${info.height}"` : "";
        const img = `<img src="${escapeHtml(href)}" alt="${alt}"${dims} loading="lazy" decoding="async">`;
        const sources = (info?.sources ?? [])
          .map((s) => `<source type="${s.type}" srcset="${escapeHtml(s.srcset)}" sizes="(min-width: 768px) 720px, 100vw">`)
          .join("");
        const pic = sources ? `<picture>${sources}${img}</picture>` : img;
        const cap = title ? `<figcaption>${escapeHtml(title)}</figcaption>` : "";
        return `<figure>${pic}${cap}</figure>`;
      },
    },
  });
  return marked.parse(md, { async: false }) as string;
}

function plainInline(tokens: Token[] | undefined): string {
  if (!tokens) return "";
  return tokens
    .map((t) => {
      if ("tokens" in t && Array.isArray(t.tokens)) return plainInline(t.tokens);
      if (t.type === "text" || t.type === "codespan" || t.type === "escape") return (t as Tokens.Text).text;
      return "";
    })
    .join("");
}

export type MarkdownFacts = {
  headings: { depth: number; text: string }[];
  links: { href: string; text: string }[];
  images: { src: string; alt: string }[];
  text: string; // düz metin (analiz için)
};

/** Analiz motoru için Markdown'dan yapı çıkarır (render etmeden). */
export function extractMarkdown(md: string | null | undefined): MarkdownFacts {
  const facts: MarkdownFacts = { headings: [], links: [], images: [], text: "" };
  if (!md) return facts;
  const tokens = new Marked({ gfm: true }).lexer(md);
  const parts: string[] = [];

  const walk = (list: Token[]) => {
    for (const t of list) {
      switch (t.type) {
        case "heading": {
          const text = plainInline((t as Tokens.Heading).tokens);
          facts.headings.push({ depth: Math.max((t as Tokens.Heading).depth, 2), text });
          parts.push(text + ".");
          break;
        }
        case "link": {
          const l = t as Tokens.Link;
          facts.links.push({ href: l.href, text: plainInline(l.tokens) });
          parts.push(plainInline(l.tokens));
          break;
        }
        case "image": {
          const im = t as Tokens.Image;
          facts.images.push({ src: im.href, alt: im.text ?? "" });
          break;
        }
        case "text":
        case "codespan":
        case "escape": {
          const tt = t as Tokens.Text;
          if (tt.tokens) walk(tt.tokens);
          else parts.push(tt.text);
          break;
        }
        case "space":
          parts.push("\n");
          break;
        default:
          if ("tokens" in t && Array.isArray(t.tokens)) walk(t.tokens);
          if (t.type === "list") {
            for (const item of (t as Tokens.List).items) walk(item.tokens);
          }
          if (t.type === "table") {
            const tb = t as Tokens.Table;
            for (const h of tb.header) walk(h.tokens);
            for (const row of tb.rows) for (const c of row) walk(c.tokens);
          }
          if (t.type === "paragraph" || t.type === "list_item") parts.push("\n");
      }
    }
  };
  walk(tokens);
  facts.text = parts.join(" ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  return facts;
}
