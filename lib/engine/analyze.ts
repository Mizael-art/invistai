import * as I from "./indicators";
import { analyzeStructure, type Structure } from "./structure";
import { TF_MS, type CandleSeries, type Timeframe } from "./types";

/** Análise de um tempo gráfico e consolidação multi-timeframe com evidências a favor, contra e de risco.
 *  O score mede QUALIDADE/CLAREZA do cenário técnico — não é probabilidade de lucro nem recomendação. */
export type Side = "bull" | "bear" | "risk";
export interface Evidence { tf: Timeframe | "mtf"; side: Side; weight: number; text: string }
const r = (n: number, d = 2) => (Number.isFinite(n) ? Number(n.toFixed(d)) : null);
const sig = (n: number) => (Number.isFinite(n) ? Number(n.toPrecision(6)) : null);

export interface TfAnalysis {
  tf: Timeframe; candles: number; lastClosedAt: string; price: number; closeOnly: boolean;
  ema: { e20: number | null; e50: number | null; e200: number | null }; rsi: number | null;
  macd: { hist: number | null; rising: boolean | null }; adx: { adx: number | null; plusDI: number | null; minusDI: number | null };
  atrPct: number | null; bbWidthPct: number | null; realizedVolPct: number | null; volumeRatio: number | null; changePct: { last: number | null; n20: number | null };
  structure: { trend: Structure["trend"]; highs: string[]; lows: string[]; lastEvent: { type: string; dir: string; level: number | null; at: string } | null;
    equalHighs: (number | null)[]; equalLows: (number | null)[]; sweep: { dir: string; level: number | null; at: string } | null;
    supports: (number | null)[]; resistances: (number | null)[]; zone: Structure["zone"]; positionPct: number | null };
  bias: number; evidence: Evidence[];
}

export function analyzeTf(s: CandleSeries, now = Date.now()): TfAnalysis | null {
  let cs = s.candles.filter((c) => [c.o, c.h, c.l, c.c].every(Number.isFinite) && c.c > 0);
  if (cs.length && cs[cs.length - 1].t + TF_MS[s.tf] > now) cs = cs.slice(0, -1);       // descarta a vela ainda aberta
  if (cs.length < 60) return null;
  const c = cs.map((x) => x.c), h = cs.map((x) => x.h), l = cs.map((x) => x.l);
  const px = I.last(c);
  const e20 = I.last(I.ema(c, 20)), e50 = I.last(I.ema(c, 50)), e200 = cs.length >= 200 ? I.last(I.ema(c, 200)) : NaN;
  const rsiNow = I.last(I.rsi(c)); const m = I.macd(c); const hist = I.last(m.hist), histPrev = m.hist[m.hist.length - 2];
  const ohlc = !s.closeOnly;
  const atrNow = ohlc ? I.last(I.atr(h, l, c)) : NaN; const dmi = ohlc ? I.adx(h, l, c) : null;
  const adxNow = dmi ? I.last(dmi.adx) : NaN, pdi = dmi ? I.last(dmi.plusDI) : NaN, ndi = dmi ? I.last(dmi.minusDI) : NaN;
  const bb = I.bollinger(c); const vr = s.hasVolume ? I.volumeRatio(cs.map((x) => x.v)) : NaN;
  const st = analyzeStructure(cs, Number.isFinite(atrNow) ? atrNow : px * (I.realizedVol(c) / 100 || 0.01));
  const ev: Evidence[] = []; const tf = s.tf; let b = 0;
  const add = (side: Side, w: number, text: string) => { ev.push({ tf, side, weight: w, text }); if (side === "bull") b += w; else if (side === "bear") b -= w; };
  if (st.trend === "up") add("bull", 25, `Estrutura de alta (${st.lastHighs.join("/")} · ${st.lastLows.join("/")})`);
  else if (st.trend === "down") add("bear", 25, `Estrutura de baixa (${st.lastHighs.join("/")} · ${st.lastLows.join("/")})`);
  else add("risk", 6, "Estrutura lateral/indefinida");
  if (Number.isFinite(e50)) add(px > e50 ? "bull" : "bear", 10, `Preço ${px > e50 ? "acima" : "abaixo"} da EMA 50`);
  if (Number.isFinite(e20) && Number.isFinite(e50)) add(e20 > e50 ? "bull" : "bear", 8, `EMA 20 ${e20 > e50 ? "acima" : "abaixo"} da EMA 50`);
  if (Number.isFinite(e200)) add(e50 > e200 ? "bull" : "bear", 10, `EMA 50 ${e50 > e200 ? "acima" : "abaixo"} da EMA 200`);
  if (Number.isFinite(hist)) add(hist > 0 ? "bull" : "bear", 8, `MACD ${hist > 0 ? "positivo" : "negativo"}${Number.isFinite(histPrev) ? (hist > histPrev ? " e ganhando força" : " e perdendo força") : ""}`);
  if (Number.isFinite(rsiNow)) {
    if (rsiNow >= 72) add("risk", 10, `RSI ${rsiNow.toFixed(0)}: sobrecompra (risco de esticamento)`);
    else if (rsiNow <= 28) add("risk", 10, `RSI ${rsiNow.toFixed(0)}: sobrevenda (risco de esticamento)`);
    else if (rsiNow > 55) add("bull", 6, `RSI ${rsiNow.toFixed(0)} acima de 55`);
    else if (rsiNow < 45) add("bear", 6, `RSI ${rsiNow.toFixed(0)} abaixo de 45`);
  }
  if (Number.isFinite(adxNow)) { if (adxNow < 18) add("risk", 8, `ADX ${adxNow.toFixed(0)}: tendência fraca`); else if (adxNow > 25) add(pdi > ndi ? "bull" : "bear", 6, `ADX ${adxNow.toFixed(0)} com ${pdi > ndi ? "+DI" : "−DI"} dominante`); }
  const le = st.events[st.events.length - 1];
  if (le && cs.length - 1 - le.i <= 20) add(le.dir === "bull" ? "bull" : "bear", le.type === "CHOCH" ? 12 : 10, `${le.type} ${le.dir === "bull" ? "de alta" : "de baixa"} recente em ${sig(le.level)}`);
  if (st.sweep) add(st.sweep.dir === "bull" ? "bull" : "bear", 8, `Varrida de liquidez ${st.sweep.dir === "bull" ? "abaixo de fundo (reação compradora)" : "acima de topo (reação vendedora)"} em ${sig(st.sweep.level)}`);
  if (Number.isFinite(vr) && vr >= 1.8) add(c[c.length - 1] >= c[c.length - 2] ? "bull" : "bear", 5, `Volume da última vela ${vr.toFixed(1)}× a média`);
  const atrPct = Number.isFinite(atrNow) ? (atrNow / px) * 100 : NaN;
  return {
    tf, candles: cs.length, lastClosedAt: new Date(cs[cs.length - 1].t + TF_MS[tf]).toISOString(), price: px, closeOnly: s.closeOnly,
    ema: { e20: sig(e20), e50: sig(e50), e200: sig(e200) }, rsi: r(rsiNow, 1), macd: { hist: sig(hist), rising: Number.isFinite(histPrev) && Number.isFinite(hist) ? hist > histPrev : null },
    adx: { adx: r(adxNow, 1), plusDI: r(pdi, 1), minusDI: r(ndi, 1) }, atrPct: r(atrPct), bbWidthPct: r(I.last(bb.widthPct)), realizedVolPct: r(I.realizedVol(c)),
    volumeRatio: r(vr), changePct: { last: r(I.pctChange(c[c.length - 2], px)), n20: r(I.pctChange(c[c.length - 21], px)) },
    structure: { trend: st.trend, highs: st.lastHighs, lows: st.lastLows, lastEvent: le ? { type: le.type, dir: le.dir, level: sig(le.level), at: new Date(le.t).toISOString() } : null,
      equalHighs: st.equalHighs.map(sig), equalLows: st.equalLows.map(sig), sweep: st.sweep ? { dir: st.sweep.dir, level: sig(st.sweep.level), at: new Date(st.sweep.t).toISOString() } : null,
      supports: st.supports.map(sig), resistances: st.resistances.map(sig), zone: st.zone, positionPct: r(st.positionPct, 0) },
    bias: Math.max(-100, Math.min(100, Math.round(b))), evidence: ev,
  };
}

export type Verdict = "alta" | "baixa" | "aguardar" | "insuficiente";
export interface MultiTf {
  bias: number; score: number; verdict: Verdict; confidence: "baixa" | "média" | "alta"; aligned: number; available: Timeframe[]; missing: Timeframe[];
  regime: string; evidence: { favor: Evidence[]; contra: Evidence[]; risco: Evidence[] };
  reference: { invalidation: number | null; targets: number[]; rr: (number | null)[]; note: string } | null;
}
const W: Record<Timeframe, number> = { "1d": 0.35, "4h": 0.3, "1h": 0.2, "15m": 0.15 };

export function consolidate(tfs: Partial<Record<Timeframe, TfAnalysis>>, opts: { minTfs?: number; expected?: Timeframe[] } = {}): MultiTf {
  const minTfs = opts.minTfs ?? 2; const expected = opts.expected ?? (Object.keys(W) as Timeframe[]);
  const avail = (Object.keys(W) as Timeframe[]).filter((k) => tfs[k]); const missing = expected.filter((k) => !tfs[k]);
  if (!avail.length) return { bias: 0, score: 0, verdict: "insuficiente", confidence: "baixa", aligned: 0, available: [], missing, regime: "Indefinido", evidence: { favor: [], contra: [], risco: [] }, reference: null };
  const wsum = avail.reduce((a, k) => a + W[k], 0);
  const bias = Math.round(avail.reduce((a, k) => a + tfs[k]!.bias * W[k], 0) / wsum);
  const dir = Math.sign(bias); const aligned = avail.filter((k) => Math.sign(tfs[k]!.bias) === dir && Math.abs(tfs[k]!.bias) >= 15).length;
  const all = avail.flatMap((k) => tfs[k]!.evidence);
  const risk: Evidence[] = all.filter((e) => e.side === "risk");
  const hi = tfs["4h"] ?? tfs["1d"] ?? tfs["1h"]!; const lo = tfs["1h"] ?? tfs["15m"] ?? hi;
  if (avail.length >= 2 && avail.some((k) => Math.sign(tfs[k]!.bias) !== dir && Math.abs(tfs[k]!.bias) >= 25)) risk.push({ tf: "mtf", side: "risk", weight: 12, text: "Conflito entre tempos gráficos" });
  if (dir > 0 && hi.structure.zone === "premium") risk.push({ tf: hi.tf, side: "risk", weight: 8, text: `Preço na zona premium do range (${hi.structure.positionPct}%) — entrada comprada mais cara` });
  if (dir < 0 && hi.structure.zone === "discount") risk.push({ tf: hi.tf, side: "risk", weight: 8, text: `Preço na zona de desconto do range (${hi.structure.positionPct}%) — venda perto de fundo` });
  if (hi.atrPct !== null && hi.atrPct > 6) risk.push({ tf: hi.tf, side: "risk", weight: 8, text: `Volatilidade elevada (ATR ${hi.atrPct}% no ${hi.tf})` });
  if (avail.some((k) => tfs[k]!.closeOnly)) risk.push({ tf: "mtf", side: "risk", weight: 6, text: "Fonte só com preço de fechamento: sem máximas/mínimas, volume e ATR" });
  if (missing.length) risk.push({ tf: "mtf", side: "risk", weight: 4, text: `Sem dados para ${missing.join(", ")}` });
  const favor = all.filter((e) => (dir >= 0 ? e.side === "bull" : e.side === "bear")).sort((a, b) => b.weight - a.weight);
  const contra = all.filter((e) => (dir >= 0 ? e.side === "bear" : e.side === "bull")).sort((a, b) => b.weight - a.weight);
  // Movimento esticado: momentum extremo NA direção da tendência e/ou preço no extremo do range. Não se persegue preço: vira "aguardar".
  const extreme = avail.filter((k) => { const r = tfs[k]!.rsi; return r !== null && (dir > 0 ? r >= 72 : dir < 0 ? r <= 28 : false); }).length;
  const pos = hi.structure.positionPct ?? 50; const zoneAgainst = dir > 0 ? pos >= 85 : dir < 0 ? pos <= 15 : false;
  const stretched = extreme >= 2 || (extreme >= 1 && (zoneAgainst || avail.length === 1));
  if (stretched) risk.push({ tf: "mtf", side: "risk", weight: 10, text: `Movimento esticado (${dir > 0 ? "sobrecompra" : "sobrevenda"} perto do ${dir > 0 ? "topo" : "fundo"} do range): risco de repique contra a tendência — melhor aguardar correção/confirmação` });
  const closeOnly = avail.some((k) => tfs[k]!.closeOnly);
  const penalty = risk.reduce((a, e) => a + e.weight, 0);
  let score = Math.max(0, Math.min(100, Math.round(Math.abs(bias) * 0.7 + (aligned / avail.length) * 30 - penalty * 0.6 + 15)));
  if (stretched) score = Math.min(score, 55);
  if (avail.length < 2) score = Math.min(score, 65);                           // um único tempo gráfico nunca gera leitura forte
  const directional = Math.abs(bias) >= 35 && aligned >= Math.ceil(avail.length / 2) && score >= 50 && !stretched;
  const verdict: Verdict = avail.length < minTfs ? "insuficiente" : directional ? (dir > 0 ? "alta" : "baixa") : "aguardar";
  let confidence: MultiTf["confidence"] = score >= 72 && aligned === avail.length ? "alta" : score >= 55 ? "média" : "baixa";
  if ((avail.length < 2 || closeOnly) && confidence === "alta") confidence = "média";
  if (stretched) confidence = "baixa";
  const dirTxt = bias > 0 ? "Alta" : "Baixa";
  const regime = Math.abs(bias) < 20 ? "Lateral / sem direção clara"
    : avail.length === 1 ? `${dirTxt} no ${avail[0]}${stretched ? " (esticada)" : ""} — sem confirmação de outros tempos gráficos`
    : `${dirTxt}${aligned === avail.length ? " alinhada" : " com divergências"}${stretched ? " e esticada" : ""}`;
  let reference: MultiTf["reference"] = null;
  if (verdict === "alta" || verdict === "baixa") {
    const atrAbs = ((lo.atrPct ?? hi.realizedVolPct ?? 1) / 100) * lo.price;
    const lvl = verdict === "alta" ? (lo.structure.supports[0] ?? hi.structure.supports[0]) : (lo.structure.resistances[0] ?? hi.structure.resistances[0]);
    const inv = lvl !== null && lvl !== undefined ? (verdict === "alta" ? lvl - 0.5 * atrAbs : lvl + 0.5 * atrAbs) : null;
    const tg = (verdict === "alta" ? [...lo.structure.resistances, ...hi.structure.resistances].filter((x): x is number => x !== null && x > lo.price).sort((a, b) => a - b)
      : [...lo.structure.supports, ...hi.structure.supports].filter((x): x is number => x !== null && x < lo.price).sort((a, b) => b - a)).filter((x, i, a) => a.indexOf(x) === i).slice(0, 3);
    const risk1 = inv !== null ? Math.abs(lo.price - inv) : NaN;
    reference = { invalidation: inv !== null ? Number(inv.toPrecision(6)) : null, targets: tg, rr: tg.map((t) => (Number.isFinite(risk1) && risk1 > 0 ? Number((Math.abs(t - lo.price) / risk1).toFixed(2)) : null)),
      note: "Níveis técnicos de referência calculados por estrutura e ATR. Não são recomendação de compra ou venda." };
  }
  return { bias, score, verdict, confidence, aligned, available: avail, missing, regime, evidence: { favor: favor.slice(0, 6), contra: contra.slice(0, 6), risco: risk.sort((a, b) => b.weight - a.weight).slice(0, 6) }, reference };
}
