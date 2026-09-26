"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MenuSection } from "./menu";

export function SidebarNav({ sections, badges }: { sections: MenuSection[]; badges: Record<string, number> }) {
  const path = usePathname();
  const active = (href: string) => (href === "/yonetim" ? path === href : path === href || path.startsWith(`${href}/`));
  return (
    <nav className="space-y-5">
      {sections.map((s) => (
        <div key={s.title}>
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{s.title}</p>
          <ul>
            {s.items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  className={`flex items-center justify-between rounded-lg px-3 py-1.5 ${active(i.href) ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper hover:text-ink"}`}
                >
                  {i.label}
                  {badges[i.href] ? <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-ink">{badges[i.href]}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
