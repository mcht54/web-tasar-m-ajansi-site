"use client";

import { useEffect, useState } from "react";

function text(ms: number): string {
  if (ms <= 0) return "süre doldu";
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return h > 0 ? `${h} sa ${String(m).padStart(2, "0")} dk` : `${m} dk ${String(s).padStart(2, "0")} sn`;
}

/** Onay penceresi geri sayımı. Sunucuda hesaplanan ilk değer JS kapalıyken de görünür. */
export function Countdown({ expiresAt, initial }: { expiresAt: string; initial: string }) {
  const [label, setLabel] = useState(initial);
  useEffect(() => {
    const end = new Date(expiresAt).getTime();
    const tick = () => setLabel(text(end - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  return <time dateTime={expiresAt} className="font-semibold tabular-nums" data-countdown>{label}</time>;
}
