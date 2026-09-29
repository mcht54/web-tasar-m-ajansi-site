// Yalnızca CSS ile çizilen cihaz ve tarayıcı çerçeveleri. Görsel/video yok; ölçüler oranla sabit
// (CLS yok). İçerikleri süslemedir: aria-hidden ve gerçek olmayan hiçbir sayı/iddia taşımaz.

export function BrowserFrame({ url, dark = false, className = "", children }: { url: string; dark?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={`browser ${dark ? "dark" : ""} ${className}`}>
      <div className="browser-bar">
        <i /><i /><i />
        <span className="browser-url">{url}</span>
      </div>
      {children}
    </div>
  );
}

export function Phone({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`phone ${className}`}>
      <div className="phone-screen aspect-[9/19.5] [container-type:inline-size]">
        <span className="phone-notch" />
        {children}
      </div>
    </div>
  );
}

export function Laptop({ url, className = "", children }: { url: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <div className="laptop-lid">
        <BrowserFrame url={url} className="!rounded-[8px] !shadow-none">
          <div className="aspect-[16/10] overflow-hidden [container-type:inline-size]">{children}</div>
        </BrowserFrame>
      </div>
      <div className="laptop-base" />
    </div>
  );
}

// ─── Sanat ilkelleri: yalnızca CSS gradyanı (görsel dosyası yok, ağ isteği yok) ───────────

const PALETTES = {
  signal: ["#ffe1cf", "#ff9a5c", "#ff4d1f", "#6e1605"],
  ultra: ["#e4e7ff", "#a3acff", "#5b67f0", "#171a5c"],
  volt: ["#f8ffe0", "#dcff6b", "#86c21f", "#223a05"],
  rose: ["#ffe3ef", "#ff9cc4", "#e2457f", "#4d0b26"],
} as const;
export type Hue = keyof typeof PALETTES;

/** Parlak, hacimli küre (radyal gradyan + iç gölge + yansıma). */
export function Orb({ hue = "signal", className = "", style }: { hue?: Hue; className?: string; style?: React.CSSProperties }) {
  const g = PALETTES[hue];
  return (
    <div
      className={`relative aspect-square rounded-full ${className}`}
      style={{ background: `radial-gradient(circle at 32% 28%, ${g[0]} 0%, ${g[1]} 20%, ${g[2]} 52%, ${g[3]} 100%)`, boxShadow: `0 1.6em 3em -1em ${g[2]}99, inset -0.5em -0.8em 1.6em rgba(0,0,0,.35)`, ...style }}
    >
      <span className="absolute left-[17%] top-[12%] h-[22%] w-[32%] rotate-[-20deg] rounded-full bg-white/70 blur-[0.35em]" />
    </div>
  );
}

/** Işıltılı halka (konik gradyan + maske). */
export function Ring({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`aspect-square rounded-full ${className}`}
      style={{ background: "conic-gradient(from 210deg, #ff4d1f, #ffb38a, #7482ff, #d9ff5c, #ff4d1f)", WebkitMask: "radial-gradient(circle, transparent 58%, #000 60%, #000 70%, transparent 72%)", mask: "radial-gradient(circle, transparent 58%, #000 60%, #000 70%, transparent 72%)", opacity: 0.9, ...style }}
    />
  );
}

/** Başlığın son kelimesi gradyanlı (vurgu). */
function Headline({ text, className }: { text: string; className: string }) {
  const words = text.trim().split(" ");
  const last = words.pop();
  return (
    <p className={className}>
      {words.join(" ")}{" "}
      <span style={{ background: "linear-gradient(95deg, #ffd0b5, #ff7a3d 45%, #ff4d1f)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{last}</span>
    </p>
  );
}

const Check = () => (
  <svg viewBox="0 0 16 16" className="h-[1em] w-[1em] shrink-0" aria-hidden><circle cx="8" cy="8" r="8" fill="currentColor" opacity=".2" /><path d="M4.5 8.3l2.2 2.2 4.8-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/** Masaüstü mini site: koyu, ışıltılı açılış sayfası (sitenin kendi hizmet adlarıyla; sayı/iddia yok). */
export function MiniSite({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#0a0b0f] p-[3.6cqw] text-[#f4f2ec]">
      <div className="pointer-events-none absolute -right-[12%] -top-[35%] h-[85%] w-[65%] rounded-full bg-[#ff4d1f]/40 blur-[5cqw]" />
      <div className="pointer-events-none absolute -bottom-[45%] -left-[12%] h-[75%] w-[55%] rounded-full bg-[#7482ff]/35 blur-[5cqw]" />
      <div className="pointer-events-none absolute inset-0 opacity-[.07]" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "6cqw 6cqw" }} />

      <div className="relative flex items-center justify-between">
        <span className="flex items-center gap-[1cqw] text-[2cqw] font-bold tracking-tight">
          <span className="grid h-[3.2cqw] w-[3.2cqw] place-items-center rounded-[.9cqw] bg-gradient-to-br from-[#ff8a4c] to-[#ff4d1f] text-[1.8cqw] font-black text-white">M</span>
          MCHT
        </span>
        <span className="flex items-center gap-[2.4cqw] text-[1.55cqw] text-white/60">
          <span>Hizmetler</span><span>Projeler</span><span>Süreç</span>
          <span className="rounded-full bg-white px-[1.8cqw] py-[.5cqw] font-semibold text-[#0a0b0f]">Teklif al</span>
        </span>
      </div>

      <div className="relative mt-[4cqw] grid flex-1 grid-cols-[1.1fr_1fr] gap-[2cqw]">
        <div className="flex flex-col">
          <span className="flex w-max items-center gap-[.8cqw] rounded-full border border-white/15 bg-white/5 px-[1.6cqw] py-[.5cqw] text-[1.4cqw] text-white/75">
            <span className="h-[.9cqw] w-[.9cqw] rounded-full bg-[#d9ff5c]" /> Yeni nesil web deneyimi
          </span>
          <Headline text={title} className="mt-[2.4cqw] font-display text-[5.6cqw] leading-[.98] tracking-[-0.02em]" />
          <p className="mt-[2cqw] max-w-[92%] text-[1.55cqw] leading-[1.5] text-white/60">Hızlı açılan, Google&apos;ın anladığı ve ziyaretçiyi teklif formuna taşıyan siteler.</p>
          <div className="mt-[2.6cqw] flex gap-[1.2cqw]">
            <span className="rounded-full bg-gradient-to-r from-[#ff8a4c] to-[#ff4d1f] px-[2.4cqw] py-[1.1cqw] text-[1.55cqw] font-semibold text-white shadow-[0_0.6cqw_2cqw_-0.4cqw_#ff4d1f]">Projenizi Başlatalım →</span>
            <span className="rounded-full border border-white/20 px-[2.2cqw] py-[1.1cqw] text-[1.55cqw] font-semibold text-white/85">Çalışmalar</span>
          </div>
          <div className="mt-auto flex gap-[1.4cqw] text-[1.35cqw] text-white/70">
            {["Mobil öncelikli", "Hızlı", "SEO altyapısı"].map((t) => <span key={t} className="flex items-center gap-[.6cqw] text-[#d9ff5c]"><Check /><span className="text-white/70">{t}</span></span>)}
          </div>
        </div>

        <div className="relative">
          <Ring className="absolute left-[4%] top-[2%] w-[92%]" />
          <Orb hue="signal" className="absolute left-[18%] top-[12%] w-[62%] text-[1.4cqw]" />
          <Orb hue="ultra" className="absolute right-[4%] top-[4%] w-[18%] text-[1cqw]" />
          <Orb hue="volt" className="absolute bottom-[18%] left-[2%] w-[12%] text-[.8cqw]" />
          {/* Cam kart: teklif formu */}
          <div className="absolute bottom-[4%] right-[0%] w-[58%] rounded-[1.6cqw] border border-white/20 bg-white/10 p-[1.6cqw] shadow-[0_2cqw_4cqw_-1cqw_rgba(0,0,0,.6)] backdrop-blur-md">
            <p className="text-[1.45cqw] font-semibold">Teklif formu</p>
            <div className="mt-[1cqw] h-[2.6cqw] rounded-[.8cqw] bg-white/15" />
            <div className="mt-[.8cqw] h-[2.6cqw] rounded-[.8cqw] bg-white/15" />
            <div className="mt-[1cqw] rounded-[.8cqw] bg-white py-[.8cqw] text-center text-[1.35cqw] font-semibold text-[#0a0b0f]">Gönder</div>
          </div>
          <div className="absolute left-[0%] top-[46%] flex items-center gap-[.8cqw] rounded-full border border-white/15 bg-[#0a0b0f]/70 px-[1.4cqw] py-[.7cqw] text-[1.3cqw] backdrop-blur">
            <span className="text-[#d9ff5c]"><Check /></span> Mobil uyumlu
          </div>
        </div>
      </div>

      <div className="relative mt-[2.4cqw] grid grid-cols-3 gap-[1.4cqw]">
        {items.slice(0, 3).map((t, i) => (
          <div key={t} className="flex items-center gap-[1.2cqw] rounded-[1.4cqw] border border-white/10 bg-white/[.04] p-[1.2cqw]">
            <Orb hue={(["signal", "ultra", "volt"] as const)[i]} className="w-[3.4cqw] shrink-0 text-[.5cqw]" />
            <p className="text-[1.45cqw] font-semibold leading-tight text-white/85">{t}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Telefon ekranları: ana ekran → hizmetler → iletişim (üçü alt alta; .screens-track kaydırır). */
export function PhoneScreens({ title, items }: { title: string; items: string[] }) {
  const screen = "relative flex h-1/3 flex-col overflow-hidden px-[7cqw] pb-[8cqw] pt-[15cqw]";
  const hues = ["signal", "ultra", "volt", "rose", "signal"] as const;
  return (
    <div className="screens-track absolute inset-x-0 top-0 h-[300%]">
      {/* 1) Açılış */}
      <div className={`${screen} bg-[#0a0b0f] text-[#f4f2ec]`}>
        <div className="pointer-events-none absolute -right-[30%] -top-[10%] h-[60%] w-[110%] rounded-full bg-[#ff4d1f]/45 blur-[10cqw]" />
        <div className="pointer-events-none absolute -bottom-[10%] -left-[30%] h-[45%] w-[90%] rounded-full bg-[#7482ff]/40 blur-[10cqw]" />
        <div className="relative mx-auto mt-[2cqw] w-[74%]">
          <Ring className="absolute -inset-[12%] w-[124%]" />
          <Orb hue="signal" className="w-full text-[4cqw]" />
          <Orb hue="ultra" className="absolute -right-[8%] bottom-[2%] w-[26%] text-[2cqw]" />
        </div>
        <span className="relative mt-[8cqw] flex w-max items-center gap-[1.6cqw] rounded-full border border-white/15 bg-white/10 px-[3cqw] py-[1cqw] text-[3.4cqw]"><span className="h-[2cqw] w-[2cqw] rounded-full bg-[#d9ff5c]" />Web tasarım</span>
        <Headline text={title} className="relative mt-[3.4cqw] font-display text-[10.5cqw] leading-[.98] tracking-[-0.02em]" />
        <span className="relative mt-auto rounded-full bg-gradient-to-r from-[#ff8a4c] to-[#ff4d1f] py-[3.6cqw] text-center text-[4.2cqw] font-semibold text-white shadow-[0_3cqw_8cqw_-2cqw_#ff4d1f]">Projenizi Başlatalım →</span>
      </div>

      {/* 2) Hizmetler */}
      <div className={`${screen} bg-[#f4f2ec] text-[#14161a]`}>
        <p className="text-[3.4cqw] font-semibold uppercase tracking-[.2em] text-[#ff4d1f]">Hizmetler</p>
        <p className="mt-[1.4cqw] font-display text-[8.4cqw] leading-none">Ne yapıyoruz?</p>
        <div className="relative mt-[4cqw] overflow-hidden rounded-[5cqw] bg-[#0a0b0f] p-[4cqw] text-white">
          <Orb hue="signal" className="absolute -right-[10%] -top-[30%] w-[55%] text-[2cqw]" />
          <p className="relative max-w-[70%] text-[4.4cqw] font-semibold leading-tight">{items[0] ?? "Web Tasarım"}</p>
          <span className="relative mt-[3cqw] inline-block rounded-full bg-white px-[3cqw] py-[1.2cqw] text-[3.2cqw] font-semibold text-[#0a0b0f]">İncele →</span>
        </div>
        <div className="mt-[3cqw] space-y-[2.4cqw]">
          {items.slice(1, 5).map((t, i) => (
            <div key={t} className="flex items-center gap-[3cqw] rounded-[4cqw] bg-white p-[3cqw] shadow-[0_2cqw_5cqw_-3cqw_rgba(0,0,0,.25)]">
              <Orb hue={hues[i + 1]} className="w-[9cqw] shrink-0 text-[1cqw]" />
              <span className="flex-1 text-[3.9cqw] font-semibold leading-tight">{t}</span>
              <span className="text-[4cqw] text-[#ff4d1f]">›</span>
            </div>
          ))}
        </div>
      </div>

      {/* 3) İletişim */}
      <div className={`${screen} text-white`} style={{ background: "linear-gradient(160deg, #ff4d1f 0%, #c2366a 45%, #5b67f0 100%)" }}>
        <Orb hue="volt" className="absolute -right-[12%] top-[8%] w-[42%] text-[2cqw]" />
        <p className="relative font-display text-[9.4cqw] leading-[.98]">Projenizi<br />konuşalım</p>
        <div className="relative mt-[6cqw] rounded-[5cqw] border border-white/30 bg-white/15 p-[4cqw] backdrop-blur-md">
          {["Adınız", "Telefon", "Hangi hizmet?"].map((l) => (
            <div key={l} className="mb-[3cqw]">
              <p className="text-[3cqw] text-white/80">{l}</p>
              <div className="mt-[1cqw] h-[9cqw] rounded-[2.6cqw] bg-white/90" />
            </div>
          ))}
          <div className="rounded-full bg-[#0a0b0f] py-[3.2cqw] text-center text-[4cqw] font-semibold">Gönder</div>
        </div>
        <div className="relative mt-auto flex gap-[2.4cqw]">
          <span className="flex-1 rounded-full bg-[#25d366] py-[3cqw] text-center text-[3.6cqw] font-semibold text-[#06361d]">WhatsApp</span>
          <span className="flex-1 rounded-full bg-white py-[3cqw] text-center text-[3.6cqw] font-semibold text-[#0a0b0f]">Ara</span>
        </div>
      </div>
    </div>
  );
}

/** Sektör ekranı: gradyan küçük resimli kutucuklar (sitenin sektör adlarıyla). */
export function SectorScreen({ items }: { items: string[] }) {
  const hues = ["signal", "ultra", "volt", "rose", "ultra", "signal"] as const;
  const bgs = ["linear-gradient(140deg,#1a0d08,#3a1407)", "linear-gradient(140deg,#0c0e2a,#1d2170)", "linear-gradient(140deg,#0f1a05,#2c4a0a)", "linear-gradient(140deg,#2a0716,#5a0f30)", "linear-gradient(140deg,#0c0e2a,#2a1d70)", "linear-gradient(140deg,#1a0d08,#4a1a07)"];
  return (
    <div className="flex h-full flex-col bg-[#f4f2ec] px-[6cqw] pb-[7cqw] pt-[15cqw] text-[#14161a]">
      <p className="text-[3.4cqw] font-semibold uppercase tracking-[.2em] text-[#ff4d1f]">Sektörler</p>
      <p className="mt-[1.4cqw] font-display text-[8cqw] leading-none">Size özel</p>
      <div className="mt-[4cqw] grid grid-cols-2 gap-[3cqw]">
        {items.slice(0, 6).map((t, i) => (
          <div key={t} className="overflow-hidden rounded-[4cqw] bg-white shadow-[0_2cqw_5cqw_-3cqw_rgba(0,0,0,.25)]">
            <div className="relative grid aspect-[4/3] place-items-center overflow-hidden" style={{ background: bgs[i] }}>
              <Orb hue={hues[i]} className="w-[46%] text-[1.4cqw]" />
            </div>
            <p className="px-[2.4cqw] py-[2cqw] text-[3.2cqw] font-semibold leading-tight">{t}</p>
          </div>
        ))}
      </div>
      <span className="mt-auto rounded-full bg-[#0a0b0f] py-[3.2cqw] text-center text-[3.8cqw] font-semibold text-white">Tüm sektörler →</span>
    </div>
  );
}
