import { describe, expect, it } from "vitest";
import * as I from "@/lib/engine/indicators";
import { analyzeStructure, swings } from "@/lib/engine/structure";
import { analyzeTf, consolidate } from "@/lib/engine/analyze";
import { cryptoProvider, forexProvider, guessClass, normalizeFxSeries, normalizeKlines, pickUniverse } from "@/lib/engine/providers";
import type { Candle, CandleSeries } from "@/lib/engine/types";

const H = 3_600_000;
/** Série sintética em zigue-zague com deriva: sobe `up` passos e desce `dn`, repetidamente. */
function zigzag(n: number, up: number, dn: number, step = 1, start = 100, t0 = Date.UTC(2026, 0, 1)): Candle[] {
  const out: Candle[] = []; let p = start, i = 0;
  while (out.length < n) { for (let k = 0; k < up && out.length < n; k++, i++) { const o = p; p += step; out.push({ t: t0 + i * H, o, h: p + 0.2, l: o - 0.2, c: p, v: 100 }); }
    for (let k = 0; k < dn && out.length < n; k++, i++) { const o = p; p -= step; out.push({ t: t0 + i * H, o, h: o + 0.2, l: p - 0.2, c: p, v: 100 }); } }
  return out;
}
const series = (candles: Candle[], tf: CandleSeries["tf"] = "1h"): CandleSeries => ({ symbol: "TEST", tf, candles, closeOnly: false, hasVolume: true, source: "teste", fetchedAt: "" });

describe("indicadores", () => {
  it("SMA/EMA corretas e NaN antes do período", () => {
    expect(I.sma([1, 2, 3, 4], 2)).toEqual([NaN, 1.5, 2.5, 3.5]);
    const e = I.ema([1, 2, 3, 4, 5], 3); expect(Number.isNaN(e[1])).toBe(true); expect(e[2]).toBe(2); expect(e[4]).toBeCloseTo(4, 10);
  });
  it("RSI: 100 só com altas, 0 só com quedas, ~50 alternando", () => {
    expect(I.last(I.rsi(Array.from({ length: 30 }, (_, i) => i + 1)))).toBe(100);
    expect(I.last(I.rsi(Array.from({ length: 30 }, (_, i) => 100 - i)))).toBe(0);
    expect(I.last(I.rsi(Array.from({ length: 41 }, (_, i) => (i % 2 ? 101 : 100))))).toBeGreaterThan(40);
  });
  it("RSI de referência (Wilder, 14) confere com valor conhecido", () => {
    const c = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
    expect(I.rsi(c)[14]).toBeCloseTo(70.46, 2);
  });
  it("ATR/ADX/MACD/Bollinger finitos em série longa; volume relativo usa a vela fechada", () => {
    const z = zigzag(120, 6, 3); const h = z.map((x) => x.h), l = z.map((x) => x.l), c = z.map((x) => x.c);
    expect(I.last(I.atr(h, l, c))).toBeGreaterThan(0); expect(Number.isFinite(I.last(I.adx(h, l, c).adx))).toBe(true);
    expect(Number.isFinite(I.last(I.macd(c).hist))).toBe(true); expect(I.last(I.bollinger(c).widthPct)).toBeGreaterThan(0);
    const v = Array(25).fill(10); v[23] = 30; expect(I.volumeRatio(v)).toBe(3);
  });
});

describe("estrutura", () => {
  it("tendência de alta: topos e fundos ascendentes + BOS de alta", () => {
    const z = zigzag(150, 6, 3); const s = analyzeStructure(z, 1);
    expect(s.trend).toBe("up"); expect(s.lastHighs).toContain("HH"); expect(s.lastLows).toContain("HL");
    expect(s.events.at(-1)).toMatchObject({ type: "BOS", dir: "bull" });
  });
  it("tendência de baixa e CHOCH na virada", () => {
    const down = zigzag(90, 3, 6, 1, 300); const lastP = down.at(-1)!.c; const t0 = down.at(-1)!.t + H;
    const up = zigzag(22, 6, 3, 1, lastP, t0); const s = analyzeStructure([...down, ...up], 1);
    expect(analyzeStructure(down, 1).trend).toBe("down");
    expect(s.events.some((e) => e.type === "CHOCH" && e.dir === "bull")).toBe(true);
  });
  it("swings exigem confirmação dos dois lados", () => {
    const z = zigzag(40, 5, 5); const sw = swings(z, 3, 3); expect(sw.every((s) => s.i >= 3 && s.i < z.length - 3)).toBe(true);
  });
});

describe("análise e consolidação", () => {
  it("cenário de alta consistente → viés positivo, evidências a favor e níveis de referência", () => {
    const now = Date.UTC(2026, 0, 30);
    const a1 = analyzeTf(series(zigzag(260, 6, 3, 1, 100, now - 262 * H)), now)!; const a4 = analyzeTf(series(zigzag(260, 6, 3, 4, 100, now - 262 * 4 * H), "4h"), now)!;
    expect(a1.bias).toBeGreaterThan(30); expect(a1.structure.trend).toBe("up");
    const m = consolidate({ "1h": a1, "4h": a4 }, { expected: ["1h", "4h"] });
    expect(m.bias).toBeGreaterThan(30); expect(m.evidence.favor.length).toBeGreaterThan(2);
    expect(["alta", "aguardar"]).toContain(m.verdict); expect(m.score).toBeGreaterThanOrEqual(0); expect(m.score).toBeLessThanOrEqual(100);
    if (m.reference) expect(m.reference.note).toMatch(/Não são recomendação/);
  });
  it("descarta a vela aberta e exige histórico mínimo", () => {
    const z = zigzag(80, 6, 3); const now = z.at(-1)!.t + 10_000; const a = analyzeTf(series(z), now)!; expect(a.candles).toBe(79);
    expect(analyzeTf(series(zigzag(40, 3, 2)))).toBeNull();
  });
  it("sem tempos gráficos → insuficiente; conflito entre TFs vira risco", () => {
    expect(consolidate({}).verdict).toBe("insuficiente");
    const now = Date.UTC(2026, 0, 30);
    const upA = analyzeTf(series(zigzag(260, 6, 3, 1, 100, now - 262 * H)), now)!; const dnA = analyzeTf(series(zigzag(260, 3, 6, 4, 2000, now - 262 * 4 * H), "4h"), now)!;
    const m = consolidate({ "1h": upA, "4h": dnA }, { expected: ["1h", "4h"] });
    expect(m.evidence.risco.some((e) => /Conflito/.test(e.text))).toBe(true); expect(m.verdict).not.toBe("alta");
  });
  it("fonte só com fechamento: sem ATR/ADX e com aviso", () => {
    const z = zigzag(260, 6, 3).map((c) => ({ ...c, o: c.c, h: c.c, l: c.c, v: null }));
    const a = analyzeTf({ ...series(z, "1d"), closeOnly: true, hasVolume: false, candles: z.map((c, i) => ({ ...c, t: Date.UTC(2025, 0, 1) + i * 86_400_000 })) }, Date.UTC(2026, 6, 1))!;
    expect(a.atrPct).toBeNull(); expect(a.adx.adx).toBeNull(); expect(a.volumeRatio).toBeNull();
    const m = consolidate({ "1d": a }, { minTfs: 1, expected: ["1d"] }); expect(m.evidence.risco.some((e) => /só com preço de fechamento/.test(e.text))).toBe(true);
  });
});

describe("provedores", () => {
  it("normaliza klines e rejeita resposta inválida", () => {
    expect(normalizeKlines([[1, "1", "2", "0.5", "1.5", "10", 2, "x"]])).toEqual([{ t: 1, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }]);
    expect(() => normalizeKlines({ code: -1121 })).toThrow();
  });
  it("resolve símbolos de cripto e forex; classes sem fonte não são tratadas como cripto", () => {
    expect(cryptoProvider.resolve("btc")).toMatchObject({ symbol: "BTCUSDT", display: "BTC/USDT" });
    expect(cryptoProvider.resolve("ETH/BRL")).toMatchObject({ symbol: "ETHBRL", currency: "BRL" });
    expect(forexProvider.resolve("EUR/BRL")).toMatchObject({ symbol: "EURBRL", display: "EUR/BRL" });
    expect(forexProvider.resolve("USDT")).toBeNull(); expect(guessClass("USD/BRL")).toBe("forex"); expect(guessClass("SOLUSDT")).toBe("crypto");
  });
  it("universo do scanner: só USDT, sem stablecoins/alavancados/ouro e ações tokenizadas, por volume", () => {
    const row = (symbol: string, qv: string) => ({ symbol, lastPrice: "1", priceChangePercent: "1", highPrice: "1", lowPrice: "1", quoteVolume: qv, closeTime: 1 });
    const u = pickUniverse([row("BTCUSDT", "9"), row("USDCUSDT", "99"), row("ETHUPUSDT", "50"), row("ETHBTC", "70"), row("SOLUSDT", "20"), row("XAUTUSDT", "80"), row("MSTRBUSDT", "60"), row("RWUSDUSDT", "95"), row("USDSUSDT", "94"), row("EURUSDT", "93")], 5);
    expect(u.map((x) => x.symbol)).toEqual(["SOLUSDT", "BTCUSDT"]);
  });
  it("série de forex: só fechamento, ordenada", () => {
    const s = normalizeFxSeries({ rates: { "2026-01-02": { BRL: 5.1 }, "2026-01-01": { BRL: 5 } } }, "BRL"); expect(s.map((c) => c.c)).toEqual([5, 5.1]); expect(s[0].v).toBeNull();
  });
});

describe("calibração conservadora", () => {
  const mk = (tf: "1h" | "4h", rsi: number, bias: number, pos: number) => ({ tf, candles: 300, lastClosedAt: "", price: 100, closeOnly: false, ema: { e20: 1, e50: 1, e200: 1 }, rsi, macd: { hist: -1, rising: false }, adx: { adx: 40, plusDI: 5, minusDI: 30 },
    atrPct: 1, bbWidthPct: 5, realizedVolPct: 1, volumeRatio: 1, changePct: { last: 0, n20: -5 },
    structure: { trend: "down" as const, highs: ["LH"], lows: ["LL"], lastEvent: null, equalHighs: [], equalLows: [], sweep: null, supports: [], resistances: [110], zone: "discount" as const, positionPct: pos },
    bias, evidence: [{ tf, side: "bear" as const, weight: 25, text: "Estrutura de baixa" }] });
  it("tendência forte porém esticada (RSI extremo em 2 TFs, preço no fundo do range) → aguardar, confiança baixa, score limitado", () => {
    const m = consolidate({ "1h": mk("1h", 19, -82, 4), "4h": mk("4h", 19, -82, 5) }, { expected: ["1h", "4h"] });
    expect(m.verdict).toBe("aguardar"); expect(m.confidence).toBe("baixa"); expect(m.score).toBeLessThanOrEqual(55);
    expect(m.evidence.risco.some((e) => /esticado/.test(e.text))).toBe(true); expect(m.regime).toMatch(/esticada/); expect(m.reference).toBeNull();
  });
  it("mesma tendência sem esticamento → viés de baixa com níveis de referência", () => {
    const m = consolidate({ "1h": mk("1h", 38, -82, 30), "4h": mk("4h", 40, -82, 30) }, { expected: ["1h", "4h"] });
    expect(m.verdict).toBe("baixa"); expect(m.reference).not.toBeNull();
  });
  it("um único tempo gráfico: score ≤ 65, confiança nunca alta e regime explica a falta de confirmação", () => {
    const a = { ...mk("1h", 40, -82, 30), tf: "1d" as const, closeOnly: true };
    const m = consolidate({ "1d": a }, { minTfs: 1, expected: ["1d"] });
    expect(m.score).toBeLessThanOrEqual(65); expect(m.confidence).not.toBe("alta"); expect(m.regime).toMatch(/sem confirmação/);
  });
});
