import { analyzeTf, consolidate, type MultiTf, type TfAnalysis } from "./analyze";
import { cryptoProvider, cryptoUniverse, guessClass, providerFor } from "./providers";
import { EngineError, type AssetClass, type Quote, type Timeframe } from "./types";

/** API do motor TRADEON: snapshot multi-timeframe de um ativo e scanner de oportunidades.
 *  Cada resposta traz a fonte e o horário dos dados; falhas parciais aparecem em `errors`, nunca como números inventados. */
export interface Snapshot {
  asset: { symbol: string; display: string; assetClass: AssetClass; currency: string };
  quote: Quote | null; timeframes: Partial<Record<Timeframe, TfAnalysis>>; summary: MultiTf;
  source: string; generatedAt: string; errors: { tf: Timeframe | "quote"; code: string }[]; disclaimer: string;
}
export const DISCLAIMER = "Análise técnica automatizada para fins educacionais. Não é recomendação de investimento; resultados passados não garantem resultados futuros.";
const cache = new Map<string, { at: number; v: Snapshot }>();

export async function snapshot(input: string, cls?: AssetClass, tfsWanted?: Timeframe[]): Promise<Snapshot> {
  const assetClass = cls ?? guessClass(input); const prov = providerFor(assetClass);
  const sym = prov.resolve(input); if (!sym) throw new EngineError("unknown_symbol");
  const tfs = (tfsWanted?.length ? tfsWanted : prov.timeframes).filter((t) => prov.timeframes.includes(t));
  const key = `${assetClass}:${sym.symbol}:${tfs.join(",")}`; const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 45_000) return hit.v;
  const errors: Snapshot["errors"] = [];
  const [q, ...series] = await Promise.allSettled([prov.quote(sym), ...tfs.map((t) => prov.candles(sym, t, 300))]);
  if (q.status === "rejected" && q.reason instanceof EngineError && q.reason.code === "unknown_symbol") throw q.reason;
  if (q.status === "rejected") errors.push({ tf: "quote", code: q.reason instanceof EngineError ? q.reason.code : "unavailable" });
  const out: Partial<Record<Timeframe, TfAnalysis>> = {};
  series.forEach((res, i) => {
    if (res.status === "rejected") { errors.push({ tf: tfs[i], code: res.reason instanceof EngineError ? res.reason.code : "unavailable" }); return; }
    const a = analyzeTf(res.value); if (a) out[tfs[i]] = a; else errors.push({ tf: tfs[i], code: "insufficient_data" });
  });
  if (!Object.keys(out).length && q.status === "rejected") throw new EngineError(errors.every((e) => e.code === "unknown_symbol") ? "unknown_symbol" : "unavailable");
  const v: Snapshot = { asset: { symbol: sym.symbol, display: sym.display, assetClass, currency: sym.currency }, quote: q.status === "fulfilled" ? q.value : null,
    timeframes: out, summary: consolidate(out, { minTfs: Math.min(2, prov.timeframes.length), expected: tfs }), source: prov.name, generatedAt: new Date().toISOString(), errors, disclaimer: DISCLAIMER };
  cache.set(key, { at: Date.now(), v }); if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return v;
}

export interface ScanHit { symbol: string; display: string; price: number; changePct24h: number; quoteVolume24h: number; score: number; bias: number; verdict: string; regime: string; highlights: string[]; risks: string[] }
let scanCache: { at: number; key: string; v: { hits: ScanHit[]; scanned: number; failed: number; generatedAt: string; source: string } } | null = null;
/** Varre os pares de maior liquidez (1H + 4H) e ordena pela qualidade técnica do cenário na direção pedida. */
export async function scanCrypto(opts: { direction?: "alta" | "baixa" | "qualquer"; limit?: number; universe?: number } = {}) {
  const direction = opts.direction ?? "qualquer", limit = Math.min(opts.limit ?? 5, 10), uni = Math.min(opts.universe ?? 30, 50);
  const key = `${uni}`; let base = scanCache && scanCache.key === key && Date.now() - scanCache.at < 120_000 ? scanCache.v : null;
  if (!base) {
    const universe = await cryptoUniverse(uni); const hits: ScanHit[] = []; let failed = 0;
    for (let i = 0; i < universe.length; i += 6) {             // lotes pequenos para respeitar limites do provedor
      const batch = universe.slice(i, i + 6);
      const res = await Promise.allSettled(batch.map(async (u) => {
        const sym = cryptoProvider.resolve(u.symbol)!; const [h1, h4] = await Promise.all([cryptoProvider.candles(sym, "1h", 250), cryptoProvider.candles(sym, "4h", 250)]);
        const a1 = analyzeTf(h1), a4 = analyzeTf(h4); if (!a1 || !a4) throw new EngineError("insufficient_data");
        const m = consolidate({ "1h": a1, "4h": a4 }, { expected: ["1h", "4h"] });
        return { symbol: u.symbol, display: sym.display, price: u.price, changePct24h: u.changePct, quoteVolume24h: u.quoteVolume, score: m.score, bias: m.bias, verdict: m.verdict, regime: m.regime,
          highlights: m.evidence.favor.slice(0, 3).map((e) => `${e.tf}: ${e.text}`), risks: m.evidence.risco.slice(0, 2).map((e) => `${e.tf}: ${e.text}`) } satisfies ScanHit;
      }));
      res.forEach((r) => (r.status === "fulfilled" ? hits.push(r.value) : failed++));
    }
    base = { hits, scanned: universe.length, failed, generatedAt: new Date().toISOString(), source: cryptoProvider.name }; scanCache = { at: Date.now(), key, v: base };
  }
  const filtered = base.hits.filter((h) => (direction === "alta" ? h.bias > 0 : direction === "baixa" ? h.bias < 0 : true)).sort((a, b) => b.score - a.score || Math.abs(b.bias) - Math.abs(a.bias));
  return { ...base, direction, hits: filtered.slice(0, limit), disclaimer: DISCLAIMER };
}
export { EngineError } from "./types";
export type { AssetClass, Timeframe } from "./types";
