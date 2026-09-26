// Görev önceliği: etki yüksek ve zorluk düşükse öncelik yüksek.
// Örnek: Title problemi → Etki: Yüksek, Zorluk: Düşük → Öncelik 95.

export type Level = 1 | 2 | 3;

export const LEVEL_LABEL: Record<Level, string> = { 1: "Düşük", 2: "Orta", 3: "Yüksek" };

const IMPACT_BASE: Record<Level, number> = { 1: 35, 2: 65, 3: 90 };
const DIFFICULTY_ADJ: Record<Level, number> = { 1: 5, 2: -5, 3: -15 };

/**
 * @param boost -10…+10 arası ek (ör. anahtar kelime önceliği, trafik potansiyeli)
 */
export function computePriority(impact: Level, difficulty: Level, boost = 0): number {
  const b = Math.max(-10, Math.min(10, boost));
  return Math.max(1, Math.min(100, Math.round(IMPACT_BASE[impact] + DIFFICULTY_ADJ[difficulty] + b)));
}

export function severityFor(priority: number): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  if (priority >= 90) return "CRITICAL";
  if (priority >= 70) return "HIGH";
  if (priority >= 45) return "MEDIUM";
  return "LOW";
}

/** Pozisyona göre beklenen yaklaşık organik CTR (sektör ortalamaları; kaba ölçüt). */
export function expectedCtr(position: number): number {
  const curve = [0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];
  if (position < 1) return curve[0];
  if (position <= 10) {
    const i = Math.floor(position) - 1;
    const frac = position - Math.floor(position);
    const next = curve[Math.min(i + 1, 9)];
    return curve[i] + (next - curve[i]) * frac;
  }
  if (position <= 20) return 0.01;
  return 0.003;
}

/** Hızlı kazanım skoru (0–100): yalnızca Search Console verisinden. */
export function qwScore(impressions: number, position: number | null, ctr: number | null): number {
  const imp = Math.min(50, Math.log10(impressions + 1) * 16);
  const pos = position == null ? 0 : position >= 4 && position <= 10 ? 30 : position < 4 ? 12 : position <= 20 ? 30 - (position - 10) * 2 : 5;
  const gap = position != null && ctr != null && position <= 20 ? Math.min(20, Math.max(0, (expectedCtr(position) - ctr) * 200)) : 0;
  return Math.round(imp + pos + gap);
}

