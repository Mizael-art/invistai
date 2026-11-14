/** Indicadores simples calculados a partir da série do provedor. NÃO é IA e NÃO é recomendação. */
export interface Insights {
  enough: boolean; points: number; changePeriodPct: number; high: number; low: number; positionInRangePct: number;
  aboveAverage: boolean; average: number; volatilityPct: number; trend: "up" | "down" | "mixed";
}
export function computeInsights(series: number[], minPoints: number): Insights | null {
  const v = series.filter((n) => Number.isFinite(n));
  if (v.length < minPoints) return null;
  const first = v[0], last = v[v.length - 1], hi = Math.max(...v), lo = Math.min(...v), avg = v.reduce((a, b) => a + b, 0) / v.length;
  const rets = v.slice(1).map((x, i) => (v[i] === 0 ? 0 : (x - v[i]) / v[i]));
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const vol = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1)) * 100;
  const change = first === 0 ? 0 : ((last - first) / first) * 100;
  const above = last > avg;
  return {
    enough: true, points: v.length, changePeriodPct: change, high: hi, low: lo, positionInRangePct: hi === lo ? 50 : ((last - lo) / (hi - lo)) * 100,
    aboveAverage: above, average: avg, volatilityPct: vol, trend: change > 0 && above ? "up" : change < 0 && !above ? "down" : "mixed",
  };
}
