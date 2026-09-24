export interface WeightRecord {
  recordDate: string;
  averageWeightKg?: string | null;
}

export interface WeightPoint {
  date: string;
  weightKg: number | null;
}

/**
 * Latest 7-day weight curve: the most recent up-to-7 records, ordered
 * oldest → newest for left-to-right charting. Records without a weight map to
 * a null point (rendered as a gap); non-finite values are treated as missing.
 */
export function latestSevenDayWeights(records: WeightRecord[]): WeightPoint[] {
  const sorted = [...records].sort((a, b) =>
    a.recordDate < b.recordDate ? 1 : a.recordDate > b.recordDate ? -1 : 0,
  );
  const latest = sorted.slice(0, 7);
  return latest.reverse().map((record) => {
    const raw = record.averageWeightKg;
    if (raw === null || raw === undefined) return { date: record.recordDate, weightKg: null };
    const parsed = Number(raw);
    return { date: record.recordDate, weightKg: Number.isFinite(parsed) ? parsed : null };
  });
}