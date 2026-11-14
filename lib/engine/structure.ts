import type { Candle } from "./types";

/** Estrutura de mercado (implementação própria): swings confirmados por fractal, rótulos HH/HL/LH/LL,
 *  rompimentos (BOS = continuação, CHOCH = mudança de caráter), liquidez (topos/fundos iguais, varridas) e zona premium/desconto. */
export interface Swing { i: number; t: number; price: number; kind: "high" | "low"; label: "HH" | "LH" | "HL" | "LL" | null }
export interface BreakEvent { i: number; t: number; type: "BOS" | "CHOCH"; dir: "bull" | "bear"; level: number }
export type Trend = "up" | "down" | "range";
export interface Structure {
  swings: Swing[]; trend: Trend; lastHighs: string[]; lastLows: string[]; events: BreakEvent[];
  equalHighs: number[]; equalLows: number[]; sweep: { dir: "bull" | "bear"; level: number; t: number } | null;
  resistances: number[]; supports: number[]; rangeHigh: number; rangeLow: number; positionPct: number; zone: "premium" | "discount" | "equilibrium";
}

export function swings(c: Candle[], left = 3, right = 3): Swing[] {
  const out: Swing[] = [];
  for (let i = left; i < c.length - right; i++) {
    let hi = true, lo = true;
    for (let j = i - left; j <= i + right; j++) {          // empate só é aceito à direita (fica o primeiro de topos/fundos iguais)
      if (j === i) continue; const before = j < i;
      if (before ? c[j].h >= c[i].h : c[j].h > c[i].h) hi = false; if (before ? c[j].l <= c[i].l : c[j].l < c[i].l) lo = false; }
    if (hi) out.push({ i, t: c[i].t, price: c[i].h, kind: "high", label: null });
    if (lo) out.push({ i, t: c[i].t, price: c[i].l, kind: "low", label: null });
  }
  let ph: Swing | null = null, pl: Swing | null = null;
  for (const s of out) {
    if (s.kind === "high") { if (ph) s.label = s.price > ph.price ? "HH" : "LH"; ph = s; }
    else { if (pl) s.label = s.price > pl.price ? "HL" : "LL"; pl = s; }
  }
  return out;
}

export function analyzeStructure(c: Candle[], atrNow: number, right = 3): Structure {
  const sw = swings(c, 3, right);
  const highs = sw.filter((s) => s.kind === "high"), lows = sw.filter((s) => s.kind === "low");
  const lh = highs.slice(-2).map((s) => s.label ?? "—"), ll = lows.slice(-2).map((s) => s.label ?? "—");
  // Rompimentos: percorre as velas; um swing só pode ser rompido depois de confirmado (i + right).
  const events: BreakEvent[] = []; let state: Trend = "range"; let hiRef: Swing | null = null, loRef: Swing | null = null; let k = 0;
  const confirmed = [...sw].sort((a, b) => a.i + right - (b.i + right));
  for (let i = 0; i < c.length; i++) {
    while (k < confirmed.length && confirmed[k].i + right <= i) { const s = confirmed[k++]; if (s.kind === "high") hiRef = s; else loRef = s; }
    if (hiRef && c[i].c > hiRef.price) { events.push({ i, t: c[i].t, type: state === "down" ? "CHOCH" : "BOS", dir: "bull", level: hiRef.price }); state = "up"; hiRef = null; }
    else if (loRef && c[i].c < loRef.price) { events.push({ i, t: c[i].t, type: state === "up" ? "CHOCH" : "BOS", dir: "bear", level: loRef.price }); state = "down"; loRef = null; }
  }
  const labelTrend: Trend = lh.includes("HH") && ll.includes("HL") && !lh.includes("LH") ? "up" : lh.includes("LH") && ll.includes("LL") && !ll.includes("HL") ? "down" : "range";
  const trend: Trend = labelTrend !== "range" ? labelTrend : state;
  const px = c[c.length - 1].c, tol = Math.max(0.15 * (Number.isFinite(atrNow) ? atrNow : 0), px * 0.0005);
  const maxClose = (from: number) => Math.max(...c.slice(from).map((x) => x.c)), minClose = (from: number) => Math.min(...c.slice(from).map((x) => x.c));
  const pairs = (arr: Swing[], up: boolean) => {
    const res: number[] = []; const r = arr.slice(-6);
    for (let a = 0; a < r.length; a++) for (let b = a + 1; b < r.length; b++)
      if (Math.abs(r[a].price - r[b].price) <= tol) { const lvl = (r[a].price + r[b].price) / 2; const intact = up ? maxClose(r[b].i + 1) < lvl : minClose(r[b].i + 1) > lvl; if (intact && !res.some((x) => Math.abs(x - lvl) <= tol)) res.push(lvl); }
    return res;
  };
  // Varrida de liquidez nas últimas 5 velas: pavio além de um swing e fechamento de volta para dentro.
  let sweep: Structure["sweep"] = null;
  for (let i = Math.max(0, c.length - 5); i < c.length; i++) {
    const ph = highs.filter((s) => s.i + right < i).slice(-1)[0], pl = lows.filter((s) => s.i + right < i).slice(-1)[0];
    if (ph && c[i].h > ph.price && c[i].c < ph.price) sweep = { dir: "bear", level: ph.price, t: c[i].t };
    if (pl && c[i].l < pl.price && c[i].c > pl.price) sweep = { dir: "bull", level: pl.price, t: c[i].t };
  }
  const win = c.slice(-60); const rangeHigh = Math.max(...win.map((x) => x.h)), rangeLow = Math.min(...win.map((x) => x.l));
  const positionPct = rangeHigh > rangeLow ? ((px - rangeLow) / (rangeHigh - rangeLow)) * 100 : 50;
  const uniq = (v: number[]) => v.filter((x, i, a) => a.findIndex((y) => Math.abs(y - x) <= tol) === i);
  const resistances = uniq(highs.filter((s) => s.price > px && maxClose(s.i + 1) < s.price).map((s) => s.price).sort((a, b) => a - b)).slice(0, 3);
  const supports = uniq(lows.filter((s) => s.price < px && minClose(s.i + 1) > s.price).map((s) => s.price).sort((a, b) => b - a)).slice(0, 3);
  return { swings: sw, trend, lastHighs: lh, lastLows: ll, events: events.slice(-3), equalHighs: pairs(highs, true), equalLows: pairs(lows, false), sweep,
    resistances, supports, rangeHigh, rangeLow, positionPct, zone: positionPct > 60 ? "premium" : positionPct < 40 ? "discount" : "equilibrium" };
}
