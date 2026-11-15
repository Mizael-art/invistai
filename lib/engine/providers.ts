import { z } from "zod";
import { EngineError, type AssetClass, type Candle, type CandleSeries, type Quote, type ResolvedSymbol, type Timeframe } from "./types";

/** Fornecedores de dados de mercado do motor. Cada classe de ativo tem um provedor com capacidades declaradas;
 *  classes ainda sem fonte integrada (ações, FIIs, ETFs) respondem `unsupported_asset_class` — nunca dados inventados. */
export interface MarketProvider {
  assetClass: AssetClass; name: string; timeframes: Timeframe[];
  resolve(input: string): ResolvedSymbol | null;
  candles(sym: ResolvedSymbol, tf: Timeframe, limit?: number): Promise<CandleSeries>;
  quote(sym: ResolvedSymbol): Promise<Quote>;
}

async function getJson(url: string, revalidate: number): Promise<unknown> {
  let res: Response;
  try { res = await fetch(url, { headers: { accept: "application/json" }, next: { revalidate }, signal: AbortSignal.timeout(9000) }); }
  catch { throw new EngineError("unavailable"); }
  if (res.status === 429 || res.status === 418) throw new EngineError("rate_limited");
  if (res.status === 400) throw new EngineError("unknown_symbol");
  if (!res.ok) throw new EngineError("unavailable", `status ${res.status}`);
  try { return await res.json(); } catch { throw new EngineError("invalid_response"); }
}

// ---------------- Cripto: dados públicos de mercado da Binance (endpoint somente-leitura data-api) ----------------
const cryptoBase = () => (process.env.ENGINE_CRYPTO_BASE_URL || "https://data-api.binance.vision/api/v3").replace(/\/$/, "");
const KL = z.array(z.tuple([z.number(), z.string(), z.string(), z.string(), z.string(), z.string()]).rest(z.unknown()));
const T24 = z.object({ symbol: z.string(), lastPrice: z.string(), priceChangePercent: z.string(), highPrice: z.string(), lowPrice: z.string(), quoteVolume: z.string(), closeTime: z.number() });
const QUOTES = ["USDT", "USDC", "FDUSD", "BTC", "BRL"];
export function normalizeKlines(json: unknown): Candle[] {
  const p = KL.safeParse(json); if (!p.success) throw new EngineError("invalid_response");
  return p.data.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] })).filter((c) => [c.o, c.h, c.l, c.c].every((x) => Number.isFinite(x) && x > 0));
}
export const cryptoProvider: MarketProvider = {
  assetClass: "crypto", name: "Binance (dados públicos)", timeframes: ["15m", "1h", "4h", "1d"],
  resolve(input) {
    const s = input.toUpperCase().replace(/[^A-Z0-9]/g, ""); if (s.length < 2 || s.length > 20) return null;
    const sym = QUOTES.some((q) => s.endsWith(q) && s.length > q.length) ? s : `${s}USDT`;
    const q = QUOTES.find((x) => sym.endsWith(x))!; const base = sym.slice(0, -q.length);
    return { assetClass: "crypto", symbol: sym, display: `${base}/${q}`, currency: q === "BRL" ? "BRL" : q === "BTC" ? "BTC" : "USD" };
  },
  async candles(sym, tf, limit = 300) {
    const json = await getJson(`${cryptoBase()}/klines?symbol=${encodeURIComponent(sym.symbol)}&interval=${tf}&limit=${Math.min(limit, 1000)}`, tf === "1d" ? 900 : 60);
    const candles = normalizeKlines(json); if (!candles.length) throw new EngineError("unknown_symbol");
    return { symbol: sym.symbol, tf, candles, closeOnly: false, hasVolume: true, source: this.name, fetchedAt: new Date().toISOString() };
  },
  async quote(sym) {
    const p = T24.safeParse(await getJson(`${cryptoBase()}/ticker/24hr?symbol=${encodeURIComponent(sym.symbol)}`, 30)); if (!p.success) throw new EngineError("invalid_response");
    const d = p.data;
    return { symbol: sym.display, assetClass: "crypto", price: +d.lastPrice, changePct24h: +d.priceChangePercent, high24h: +d.highPrice, low24h: +d.lowPrice, quoteVolume24h: +d.quoteVolume, currency: sym.currency, source: this.name, asOf: new Date(d.closeTime).toISOString() };
  },
};
/** Universo para o scanner: pares em USDT por volume em 24h (exclui stablecoins e tokens alavancados). */
/** Fora do universo de cripto: ouro tokenizado e ações tokenizadas (não são criptoativos para fins de análise). */
const NON_CRYPTO = new Set(["XAUT", "PAXG", "MSTRB", "CRCLB", "TSLAB", "AAPLB", "NVDAB", "COINB", "HOODB", "GOOGLB", "AMZNB", "METAB", "SPYB", "QQQB", "MSFTB"]);
const STABLE = new Set(["USDC", "FDUSD", "TUSD", "BUSD", "DAI", "USDP", "EUR", "AEUR", "USDE", "PYUSD", "XUSD", "USD1", "EURI", "BFUSD", "RLUSD"]);
export function pickUniverse(json: unknown, limit: number): { symbol: string; quoteVolume: number; changePct: number; price: number }[] {
  const p = z.array(z.unknown()).safeParse(json); if (!p.success) throw new EngineError("invalid_response");
  const out: { symbol: string; quoteVolume: number; changePct: number; price: number }[] = [];
  for (const raw of p.data) {
    const t = T24.safeParse(raw); if (!t.success) continue; const s = t.data.symbol; if (!s.endsWith("USDT")) continue;
    const base = s.slice(0, -4); if (STABLE.has(base) || NON_CRYPTO.has(base) || /(UP|DOWN|BULL|BEAR)$/.test(base) || !+t.data.lastPrice) continue;
    out.push({ symbol: s, quoteVolume: +t.data.quoteVolume, changePct: +t.data.priceChangePercent, price: +t.data.lastPrice });
  }
  return out.sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, limit);
}
export async function cryptoUniverse(limit = 40) { return pickUniverse(await getJson(`${cryptoBase()}/ticker/24hr`, 120), limit); }

// ---------------- Forex: taxas de referência diárias do BCE (Frankfurter) — só fechamento, só 1D ----------------
const FX = ["USD", "BRL", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "MXN", "CNY", "ZAR", "ARS"].filter((x) => x !== "ARS");
const fxBase = () => (process.env.FOREX_BASE_URL || "https://api.frankfurter.dev/v1").replace(/\/$/, "");
const FXR = z.object({ rates: z.record(z.string(), z.record(z.string(), z.number())) });
export function normalizeFxSeries(json: unknown, quote: string): Candle[] {
  const p = FXR.safeParse(json); if (!p.success) throw new EngineError("invalid_response");
  return Object.keys(p.data.rates).sort().map((d) => ({ d, v: p.data.rates[d][quote] })).filter((x) => typeof x.v === "number" && x.v > 0)
    .map(({ d, v }) => ({ t: Date.parse(`${d}T00:00:00Z`), o: v, h: v, l: v, c: v, v: null }));
}
export const forexProvider: MarketProvider = {
  assetClass: "forex", name: "Frankfurter (taxas de referência do BCE)", timeframes: ["1d"],
  resolve(input) {
    const s = input.toUpperCase().replace(/[^A-Z]/g, "");
    const [b, q] = s.length === 6 ? [s.slice(0, 3), s.slice(3)] : s.length === 3 ? ["USD", s] : [null, null];
    if (!b || !q || b === q || !FX.includes(b) || !FX.includes(q)) return null;
    return { assetClass: "forex", symbol: `${b}${q}`, display: `${b}/${q}`, currency: q };
  },
  async candles(sym, tf) {
    if (tf !== "1d") throw new EngineError("insufficient_data", "forex_daily_only");
    const from = new Date(Date.now() - 420 * 86_400_000).toISOString().slice(0, 10);
    const json = await getJson(`${fxBase()}/${from}..?base=${sym.symbol.slice(0, 3)}&symbols=${sym.symbol.slice(3)}`, 3600);
    // A taxa de referência é publicada ~16h CET; o "dia" é considerado fechado no fim do dia UTC.
    return { symbol: sym.symbol, tf, candles: normalizeFxSeries(json, sym.symbol.slice(3)), closeOnly: true, hasVolume: false, source: this.name, fetchedAt: new Date().toISOString() };
  },
  async quote(sym) {
    const s = await this.candles(sym, "1d"); const c = s.candles; if (c.length < 2) throw new EngineError("insufficient_data");
    const a = c[c.length - 2].c, b = c[c.length - 1].c;
    return { symbol: sym.display, assetClass: "forex", price: b, changePct24h: ((b - a) / a) * 100, high24h: null, low24h: null, quoteVolume24h: null, currency: sym.currency, source: this.name, asOf: new Date(c[c.length - 1].t).toISOString() };
  },
};

export const PROVIDERS: Partial<Record<AssetClass, MarketProvider>> = { crypto: cryptoProvider, forex: forexProvider };
export const PENDING_CLASSES: AssetClass[] = ["stock_br", "stock_intl", "fii", "etf"];
export function providerFor(cls: AssetClass): MarketProvider { const p = PROVIDERS[cls]; if (!p) throw new EngineError("unsupported_asset_class"); return p; }
/** Detecta a classe quando não informada: par de moedas fiduciárias conhecido → forex; caso contrário cripto. */
export function guessClass(input: string): AssetClass { return forexProvider.resolve(input) && /^[A-Z]{3}[/ ]?[A-Z]{3}$/i.test(input.trim()) && !/USDT|USDC/i.test(input) ? "forex" : "crypto"; }
