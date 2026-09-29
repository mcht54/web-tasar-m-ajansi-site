"use client";

// Ana sayfanın tek hareket denetleyicisi. İçerik sunucuda tam ve görünür üretilir; bu bileşen
// yalnızca sınıf/özellik ekler (JS kapalıyken ya da hata olursa sayfa statik ama eksiksiz kalır).
//  • [data-reveal]  görünür olunca .is-in (bir kez)
//  • [data-live]    ekrandayken "1": sürekli CSS animasyonları yalnızca o sırada çalışır
//  • [data-count]   sayaç: SSR'da gerçek değer yazılıdır; görünür olunca 0'dan o değere sayar
//  • [data-steps]   süreç: ekranın ortasındaki [data-step] ve eşleşen [data-layer] katmanlarına .on
//  • [data-parallax] fare hareketiyle --px/--py (yalnızca ince imleçli cihazlarda, rAF ile)
import { useEffect } from "react";

export function Motion() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const vh = window.innerHeight;
    const reveals = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    // İlk ekrandakiler gizlenmeden önce işaretlenir: yanıp sönme ve CLS yok
    for (const el of reveals) if (el.getBoundingClientRect().top < vh) el.classList.add("is-in");
    if (reduced) {
      for (const el of reveals) el.classList.add("is-in");
      document.querySelectorAll("[data-layer]").forEach((el) => el.classList.add("on"));
      return;
    }
    root.classList.add("motion");
    const cleanups: (() => void)[] = [() => root.classList.remove("motion")];

    const revealIo = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          revealIo.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );
    reveals.filter((el) => !el.classList.contains("is-in")).forEach((el) => revealIo.observe(el));
    cleanups.push(() => revealIo.disconnect());

    const liveIo = new IntersectionObserver((entries) => {
      for (const e of entries) (e.target as HTMLElement).dataset.live = e.isIntersecting ? "1" : "0";
    });
    document.querySelectorAll("[data-live]").forEach((el) => liveIo.observe(el));
    cleanups.push(() => liveIo.disconnect());

    const countIo = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          countIo.unobserve(e.target);
          const el = e.target as HTMLElement;
          const to = Number(el.dataset.count);
          if (!Number.isFinite(to) || to <= 0) continue;
          const start = performance.now();
          const dur = 1400;
          const tick = (t: number) => {
            const k = Math.min(1, (t - start) / dur);
            el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
            if (k < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.6 },
    );
    document.querySelectorAll("[data-count]").forEach((el) => countIo.observe(el));
    cleanups.push(() => countIo.disconnect());

    // Süreç: ekranın orta bandına giren adım etkin olur; o adıma kadarki katmanlar yanar
    document.querySelectorAll<HTMLElement>("[data-steps]").forEach((wrap) => {
      const steps = Array.from(wrap.querySelectorAll<HTMLElement>("[data-step]"));
      const layers = Array.from(wrap.querySelectorAll<HTMLElement>("[data-layer]"));
      const label = wrap.querySelector<HTMLElement>("[data-step-label]");
      const activate = (i: number) => {
        steps.forEach((s, j) => s.classList.toggle("on", j === i));
        layers.forEach((l) => l.classList.toggle("on", Number(l.dataset.layer) <= i));
        if (label) label.textContent = steps[i]?.dataset.title ?? "";
      };
      activate(0);
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) if (e.isIntersecting) activate(steps.indexOf(e.target as HTMLElement));
        },
        { rootMargin: "-45% 0px -45% 0px" },
      );
      steps.forEach((s) => io.observe(s));
      cleanups.push(() => io.disconnect());
    });

    // Fare paralaksı: yalnızca hover destekleyen ince imleçte; olay başına bir rAF
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      document.querySelectorAll<HTMLElement>("[data-parallax]").forEach((el) => {
        let frame = 0;
        let x = 0;
        let y = 0;
        const move = (ev: PointerEvent) => {
          const r = el.getBoundingClientRect();
          x = ((ev.clientX - r.left) / r.width) * 2 - 1;
          y = ((ev.clientY - r.top) / r.height) * 2 - 1;
          if (!frame) frame = requestAnimationFrame(() => {
            frame = 0;
            el.style.setProperty("--px", x.toFixed(3));
            el.style.setProperty("--py", y.toFixed(3));
          });
        };
        const leave = () => { el.style.setProperty("--px", "0"); el.style.setProperty("--py", "0"); };
        el.addEventListener("pointermove", move, { passive: true });
        el.addEventListener("pointerleave", leave);
        cleanups.push(() => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); cancelAnimationFrame(frame); });
      });
    }

    return () => cleanups.forEach((c) => c());
  }, []);
  return null;
}
