import "server-only";
// Öğrenme motoru: değişiklik türlerinin geçmiş sonuçları → öncelik çarpanı.
// Bayes düzeltmeli başarı oranı: (olumlu+1)/(değerlendirilen+2). Çarpan 0,7–1,3.
// Yetersiz veri sonucu değerlendirmeye girmez.

import { db } from "../db";

export type LearningStat = { type: string; total: number; positive: number; neutral: number; negative: number; insufficient: number; rate: number; multiplier: number };

export async function learningStats(): Promise<Map<string, LearningStat>> {
  const rows = await db.experiment.groupBy({ by: ["type", "outcome"], where: { status: "evaluated" }, _count: true });
  const m = new Map<string, LearningStat>();
  for (const r of rows) {
    const s = m.get(r.type) ?? { type: r.type, total: 0, positive: 0, neutral: 0, negative: 0, insufficient: 0, rate: 0.5, multiplier: 1 };
    const n = r._count;
    if (r.outcome === "positive") s.positive += n;
    else if (r.outcome === "negative") s.negative += n;
    else if (r.outcome === "neutral") s.neutral += n;
    else s.insufficient += n;
    s.total = s.positive + s.neutral + s.negative;
    m.set(r.type, s);
  }
  for (const s of m.values()) {
    s.rate = (s.positive + 1) / (s.total + 2);
    s.multiplier = s.total >= 3 ? 0.7 + 0.6 * s.rate : 1; // en az 3 sonuçtan sonra etkili
  }
  return m;
}
