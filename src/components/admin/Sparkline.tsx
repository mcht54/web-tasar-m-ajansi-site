// Pozisyon geçmişi için sunucu tarafı SVG grafik (istemci JS yok).
// Pozisyonda küçük değer daha iyidir; bu yüzden eksen ters çizilir.

type Point = { date: string; value: number | null };

export function Sparkline({ points, width = 140, height = 36, invert = true }: { points: Point[]; width?: number; height?: number; invert?: boolean }) {
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length < 2) return <span className="text-xs text-muted">Yetersiz veri</span>;
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * (width - 4) + 2;
  const y = (v: number) => {
    const t = (v - min) / span;
    return 2 + (invert ? t : 1 - t) * (height - 4);
  };
  let d = "";
  points.forEach((p, i) => {
    if (p.value == null) return;
    d += `${d && points[i - 1]?.value != null ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
  });
  const lastIdx = points.map((p) => p.value).lastIndexOf(vals[vals.length - 1]);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Pozisyon geçmişi">
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx={x(lastIdx)} cy={y(vals[vals.length - 1])} r="2.5" fill="var(--accent)" />
    </svg>
  );
}

/** Tarih eksenli, etiketli büyük pozisyon grafiği. */
export function RankChart({ points, height = 220, invert = true }: { points: Point[]; height?: number; invert?: boolean }) {
  const width = 760;
  const pad = { l: 36, r: 12, t: 12, b: 28 };
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length < 2) return <p className="text-muted">Grafik için en az iki günlük veri gerekiyor.</p>;
  const min = invert ? Math.max(1, Math.floor(Math.min(...vals))) : Math.floor(Math.min(...vals)), max = Math.ceil(Math.max(...vals));
  const span = max - min || 1;
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (i / (points.length - 1)) * iw;
  const y = (v: number) => pad.t + (invert ? (v - min) / span : 1 - (v - min) / span) * ih;
  const ticks = Array.from(new Set([min, Math.round(min + span / 2), max]));
  let d = "";
  points.forEach((p, i) => {
    if (p.value == null) return;
    d += `${d && points[i - 1]?.value != null ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
  });
  const labelIdx = [0, Math.floor(points.length / 2), points.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Pozisyon değişimi grafiği">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{t}</text>
        </g>
      ))}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p, i) => p.value != null && <circle key={i} cx={x(i)} cy={y(p.value)} r="2.2" fill="var(--accent)"><title>{`${p.date}: ${p.value.toFixed(1)}`}</title></circle>)}
      {labelIdx.map((i) => <text key={i} x={x(i)} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{points[i].date.slice(5)}</text>)}
    </svg>
  );
}
