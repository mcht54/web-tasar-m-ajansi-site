"use client";

// Header'ın tek istemci parçası: kaydırınca data-scrolled="1" (hap daralır, koyulaşır) ve sayfa
// değişince mobil menüyü kapatır. İçerik sunucuda üretilir; JS yoksa header statik çalışır.
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function HeaderShell({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      el.dataset.scrolled = window.scrollY > 24 ? "1" : "0";
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    ref.current?.querySelectorAll("details[open]").forEach((d) => d.removeAttribute("open"));
  }, [pathname]);

  return <header ref={ref} data-scrolled="0" className="sticky top-0 z-50 h-[76px] px-3 pt-3 sm:px-4">{children}</header>;
}
