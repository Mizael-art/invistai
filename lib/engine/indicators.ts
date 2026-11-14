/** Indicadores técnicos (implementação própria). Todas as funções devolvem séries alinhadas ao input, com `NaN` onde não há dados suficientes. */
export const last = (a: number[]) => a[a.length - 1];
export const lastFinite = (a: number[]) => { for (let i = a.length - 1; i >= 0; i--) if (Number.isFinite(a[i])) return a[i]; return NaN; };

export function sma(v: number[], n: number): number[] {
  const out = new Array<number>(v.length).fill(NaN); let s = 0;
  for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; if (i >= n - 1) out[i] = s / n; }
  return out;
}
export function ema(v: number[], n: number): number[] {
  const out = new Array<number>(v.length).fill(NaN); if (v.length < n) return out;
  const k = 2 / (n + 1); let e = v.slice(0, n).reduce((a, b) => a + b, 0) / n; out[n - 1] = e;
  for (let i = n; i < v.length; i++) { e = v[i] * k + e * (1 - k); out[i] = e; }
  return out;
}
/** Média de Wilder (RMA). */
function rma(v: number[], n: number, start = 0): number[] {
  const out = new Array<number>(v.length).fill(NaN); if (v.length - start < n) return out;
  let a = 0; for (let i = start; i < start + n; i++) a += v[i]; a /= n; out[start + n - 1] = a;
  for (let i = start + n; i < v.length; i++) { a = (a * (n - 1) + v[i]) / n; out[i] = a; }
  return out;
}
export function rsi(c: number[], n = 14): number[] {
  const g = [0], l = [0];
  for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g.push(Math.max(d, 0)); l.push(Math.max(-d, 0)); }
  const ag = rma(g, n, 1), al = rma(l, n, 1);
  return c.map((_, i) => (Number.isFinite(ag[i]) ? (al[i] === 0 ? (ag[i] === 0 ? 50 : 100) : 100 - 100 / (1 + ag[i] / al[i])) : NaN));
}
export function macd(c: number[], fast = 12, slow = 26, sig = 9) {
  const f = ema(c, fast), s = ema(c, slow);
  const line = c.map((_, i) => f[i] - s[i]);
  const firstIdx = line.findIndex(Number.isFinite);
  const sigLine = new Array<number>(c.length).fill(NaN);
  if (firstIdx >= 0) { const e = ema(line.slice(firstIdx), sig); e.forEach((x, j) => (sigLine[firstIdx + j] = x)); }
  return { line, signal: sigLine, hist: line.map((x, i) => x - sigLine[i]) };
}
export function trueRange(h: number[], l: number[], c: number[]): number[] {
  return h.map((_, i) => (i === 0 ? h[0] - l[0] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]))));
}
export const atr = (h: number[], l: number[], c: number[], n = 14) => rma(trueRange(h, l, c), n);
export function adx(h: number[], l: number[], c: number[], n = 14) {
  const pdm = [0], ndm = [0];
  for (let i = 1; i < h.length; i++) { const up = h[i] - h[i - 1], dn = l[i - 1] - l[i]; pdm.push(up > dn && up > 0 ? up : 0); ndm.push(dn > up && dn > 0 ? dn : 0); }
  const tr = rma(trueRange(h, l, c), n, 1), p = rma(pdm, n, 1), m = rma(ndm, n, 1);
  const pdi = h.map((_, i) => (100 * p[i]) / tr[i]), ndi = h.map((_, i) => (100 * m[i]) / tr[i]);
  const dx = h.map((_, i) => { const s = pdi[i] + ndi[i]; return Number.isFinite(s) && s > 0 ? (100 * Math.abs(pdi[i] - ndi[i])) / s : NaN; });
  const first = dx.findIndex(Number.isFinite); const adxS = new Array<number>(h.length).fill(NaN);
  if (first >= 0) { const r = rma(dx.slice(first), n); r.forEach((x, j) => (adxS[first + j] = x)); }
  return { adx: adxS, plusDI: pdi, minusDI: ndi };
}
export function bollinger(c: number[], n = 20, k = 2) {
  const mid = sma(c, n);
  const sd = c.map((_, i) => { if (i < n - 1) return NaN; let s = 0; for (let j = i - n + 1; j <= i; j++) s += (c[j] - mid[i]) ** 2; return Math.sqrt(s / n); });
  return { mid, upper: mid.map((m, i) => m + k * sd[i]), lower: mid.map((m, i) => m - k * sd[i]), widthPct: mid.map((m, i) => (m ? (200 * k * sd[i]) / m : NaN)) };
}
/** Volatilidade realizada (desvio dos log-retornos) das últimas n velas, em % por vela. */
export function realizedVol(c: number[], n = 30): number {
  const r: number[] = []; for (let i = Math.max(1, c.length - n); i < c.length; i++) if (c[i - 1] > 0 && c[i] > 0) r.push(Math.log(c[i] / c[i - 1]));
  if (r.length < 5) return NaN; const m = r.reduce((a, b) => a + b, 0) / r.length;
  return 100 * Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
}
/** Volume da última vela FECHADA em relação à média das n anteriores. */
export function volumeRatio(v: (number | null)[], n = 20): number {
  const vals = v.map((x) => (typeof x === "number" ? x : NaN)); const i = vals.length - 2; if (i < n) return NaN;
  const base = vals.slice(i - n, i); if (base.some((x) => !Number.isFinite(x))) return NaN;
  const avg = base.reduce((a, b) => a + b, 0) / n; return avg > 0 ? vals[i] / avg : NaN;
}
export const pctChange = (from: number, to: number) => (from ? ((to - from) / from) * 100 : NaN);
