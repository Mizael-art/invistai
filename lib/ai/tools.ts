import { z } from "zod";
import { DISCLAIMER, EngineError, scanCrypto, snapshot, type Snapshot } from "@/lib/engine";
import { PENDING_CLASSES, providerFor, guessClass } from "@/lib/engine/providers";
import { ASSET_CLASSES, type AssetClass, type Timeframe } from "@/lib/engine/types";
import { fetchTopCrypto } from "@/services/market/coingecko";
import { fetchForexPairs } from "@/services/market/forex";
import { getAssetNews, getLatestNews } from "@/services/news";
import { listFavorites } from "@/services/favorites";
import { toItems } from "@/lib/favorites";

/** Ferramentas do backend expostas ao modelo. Toda informação de mercado vem daqui (dados reais, com fonte e horário);
 *  o modelo só interpreta. Cada execução devolve `result` (JSON compacto para o modelo) e `blocks` (cartões para a interface). */
export type Block =
  | { type: "asset"; symbol: string; assetClass: AssetClass; price: number | null; changePct24h: number | null; currency: string; score: number; verdict: string; regime: string; confidence: string;
      trends: { tf: Timeframe; trend: string; bias: number; rsi: number | null }[]; favor: string[]; contra: string[]; risks: string[]; reference: Snapshot["summary"]["reference"]; source: string; asOf: string }
  | { type: "chart"; symbol: string; tf: Timeframe; points: { t: number; c: number }[]; changePct: number | null; source: string; asOf: string }
  | { type: "scan"; direction: string; items: { symbol: string; price: number; changePct24h: number; score: number; verdict: string; highlights: string[] }[]; scanned: number; source: string; asOf: string }
  | { type: "compare"; items: { symbol: string; currency: string; price: number | null; changePct24h: number | null; score: number; verdict: string; regime: string }[]; source: string; asOf: string }
  | { type: "news"; items: { title: string; source: string; url: string; publishedAt: string }[]; source: string; asOf: string }
  | { type: "overview"; items: { symbol: string; name: string; price: number; changePct24h: number | null; currency: string }[]; source: string; asOf: string };
export interface ToolCtx { userId: string; lang: "pt" | "en"; kb?: (q: string) => Promise<{ title: string; source: string | null; content: string }[]> }
export interface ToolOut { result: unknown; blocks: Block[] }

const cls = z.enum(ASSET_CLASSES as [AssetClass, ...AssetClass[]]).optional();
const sym = z.string().trim().min(1).max(24);
const TF = z.enum(["15m", "1h", "4h", "1d"]);
export const TOOL_SCHEMAS = {
  get_asset_quote: z.object({ symbol: sym, asset_class: cls }),
  get_asset_indicators: z.object({ symbol: sym, asset_class: cls, timeframes: z.array(TF).max(4).optional() }),
  get_asset_history: z.object({ symbol: sym, asset_class: cls, timeframe: TF.default("1d"), periods: z.number().int().min(10).max(500).default(90) }),
  compare_assets: z.object({ symbols: z.array(sym).min(2).max(4), asset_class: cls }),
  scan_opportunities: z.object({ direction: z.enum(["alta", "baixa", "qualquer"]).default("qualquer"), limit: z.number().int().min(1).max(10).default(5) }),
  get_market_overview: z.object({}),
  search_market_news: z.object({ query: z.string().trim().max(80).optional() }),
  search_knowledge_base: z.object({ query: z.string().trim().min(2).max(300) }),
  get_user_portfolio: z.object({}),
  get_economic_calendar: z.object({}),
};
export type ToolName = keyof typeof TOOL_SCHEMAS;
const CLASS_DESC = "Classe do ativo: crypto (cripto, padrão), forex (pares de moedas, ex.: USD/BRL, EUR/USD — só diário). stock_br, stock_intl, fii e etf ainda não têm fonte integrada.";
/** Definições (JSON Schema) enviadas ao modelo. */
export const TOOL_DEFS: { name: ToolName; description: string; parameters: Record<string, unknown> }[] = [
  { name: "get_asset_quote", description: "Cotação atual de um ativo (preço, variação 24h, máxima/mínima, volume) com fonte e horário.", parameters: { type: "object", properties: { symbol: { type: "string", description: "Ex.: BTC, ETHUSDT, SOL, USD/BRL" }, asset_class: { type: "string", enum: ASSET_CLASSES, description: CLASS_DESC } }, required: ["symbol"] } },
  { name: "get_asset_indicators", description: "Snapshot técnico multi-timeframe (15m, 1h, 4h, 1d): EMAs 20/50/200, RSI, MACD, ADX/DMI, ATR, Bollinger, volume relativo, estrutura (HH/HL/LH/LL, BOS/CHOCH), liquidez (topos/fundos iguais, varridas), zona premium/desconto, suportes/resistências, evidências a favor/contra/risco, score de qualidade e níveis técnicos de referência. Use antes de qualquer análise de ativo.", parameters: { type: "object", properties: { symbol: { type: "string" }, asset_class: { type: "string", enum: ASSET_CLASSES, description: CLASS_DESC }, timeframes: { type: "array", items: { type: "string", enum: ["15m", "1h", "4h", "1d"] } } }, required: ["symbol"] } },
  { name: "get_asset_history", description: "Histórico de preços: variação no período, máxima, mínima, maior queda (drawdown) e volatilidade, com série resumida para gráfico.", parameters: { type: "object", properties: { symbol: { type: "string" }, asset_class: { type: "string", enum: ASSET_CLASSES, description: CLASS_DESC }, timeframe: { type: "string", enum: ["15m", "1h", "4h", "1d"] }, periods: { type: "integer", minimum: 10, maximum: 500 } }, required: ["symbol"] } },
  { name: "compare_assets", description: "Compara 2 a 4 ativos da mesma classe: preço, variação, score, viés e regime.", parameters: { type: "object", properties: { symbols: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 }, asset_class: { type: "string", enum: ASSET_CLASSES, description: CLASS_DESC } }, required: ["symbols"] } },
  { name: "scan_opportunities", description: "Varre os pares de cripto em USDT de maior liquidez (1h + 4h) e ordena pela qualidade técnica do cenário na direção pedida. Use para 'quais as melhores moedas agora', 'o que está forte', etc.", parameters: { type: "object", properties: { direction: { type: "string", enum: ["alta", "baixa", "qualquer"] }, limit: { type: "integer", minimum: 1, maximum: 10 } } } },
  { name: "get_market_overview", description: "Panorama: top 10 criptomoedas por capitalização (CoinGecko) e principais pares de moedas contra o dólar (referência diária do BCE).", parameters: { type: "object", properties: {} } },
  { name: "search_market_news", description: "Notícias recentes de mercado (fonte e horário). Sem `query`, traz as últimas gerais.", parameters: { type: "object", properties: { query: { type: "string" } } } },
  { name: "get_user_portfolio", description: "Ativos que o usuário marcou como favoritos na plataforma (lista de acompanhamento; não há quantidades nem preço médio).", parameters: { type: "object", properties: {} } },
  { name: "search_knowledge_base", description: "Busca na base de conhecimento da TRADEON (métodos, playbooks, gestão de risco, glossário e materiais da equipe). Use para conceitos, metodologia e regras da casa.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "get_economic_calendar", description: "Calendário econômico (agenda de indicadores macro).", parameters: { type: "object", properties: {} } },
];

const pending = (c: AssetClass) => ({ error: "unsupported_asset_class", asset_class: c, message: "Esta classe de ativo ainda não tem fonte de dados integrada na TRADEON. Não há cotação nem indicadores disponíveis." });
const engineErr = (e: unknown) => ({ error: e instanceof EngineError ? e.code : "unavailable", message: e instanceof EngineError && e.code === "unknown_symbol" ? "Símbolo não encontrado na fonte de dados." : "Fonte de dados indisponível no momento." });

function compactSnap(s: Snapshot) {
  return { asset: s.asset, quote: s.quote, summary: s.summary,
    timeframes: Object.fromEntries(Object.entries(s.timeframes).map(([k, a]) => [k, { ...a, evidence: undefined }])), source: s.source, generatedAt: s.generatedAt, errors: s.errors, disclaimer: s.disclaimer };
}
export function assetBlock(s: Snapshot): Block {
  const m = s.summary;
  return { type: "asset", symbol: s.asset.display, assetClass: s.asset.assetClass, price: s.quote?.price ?? Object.values(s.timeframes)[0]?.price ?? null, changePct24h: s.quote?.changePct24h ?? null, currency: s.asset.currency,
    score: m.score, verdict: m.verdict, regime: m.regime, confidence: m.confidence,
    trends: (Object.values(s.timeframes) as NonNullable<Snapshot["timeframes"][Timeframe]>[]).map((a) => ({ tf: a.tf, trend: a.structure.trend, bias: a.bias, rsi: a.rsi })),
    favor: m.evidence.favor.slice(0, 4).map((e) => `${e.tf}: ${e.text}`), contra: m.evidence.contra.slice(0, 4).map((e) => `${e.tf}: ${e.text}`), risks: m.evidence.risco.slice(0, 3).map((e) => `${e.tf}: ${e.text}`),
    reference: m.reference, source: s.source, asOf: s.quote?.asOf ?? s.generatedAt };
}

export async function runTool(name: string, rawArgs: unknown, ctx: ToolCtx): Promise<ToolOut> {
  const schema = (TOOL_SCHEMAS as Record<string, z.ZodTypeAny>)[name];
  if (!schema) return { result: { error: "unknown_tool" }, blocks: [] };
  const p = schema.safeParse(rawArgs ?? {}); if (!p.success) return { result: { error: "invalid_arguments", issues: p.error.issues.slice(0, 3).map((i) => i.message) }, blocks: [] };
  const a = p.data as Record<string, unknown>;
  const classOf = (s: string) => (a.asset_class as AssetClass | undefined) ?? guessClass(s);
  try {
    switch (name as ToolName) {
      case "get_asset_quote": {
        const c = classOf(a.symbol as string); if (PENDING_CLASSES.includes(c)) return { result: pending(c), blocks: [] };
        const prov = providerFor(c); const r = prov.resolve(a.symbol as string); if (!r) return { result: { error: "unknown_symbol" }, blocks: [] };
        return { result: await prov.quote(r), blocks: [] };
      }
      case "get_asset_indicators": {
        const c = classOf(a.symbol as string); if (PENDING_CLASSES.includes(c)) return { result: pending(c), blocks: [] };
        const s = await snapshot(a.symbol as string, c, a.timeframes as Timeframe[] | undefined); return { result: compactSnap(s), blocks: [assetBlock(s)] };
      }
      case "get_asset_history": {
        const c = classOf(a.symbol as string); if (PENDING_CLASSES.includes(c)) return { result: pending(c), blocks: [] };
        const prov = providerFor(c); const r = prov.resolve(a.symbol as string); if (!r) return { result: { error: "unknown_symbol" }, blocks: [] };
        const tf = (prov.timeframes.includes(a.timeframe as Timeframe) ? a.timeframe : prov.timeframes[prov.timeframes.length - 1]) as Timeframe;
        const ser = await prov.candles(r, tf, a.periods as number); const cs = ser.candles.slice(-(a.periods as number)); if (cs.length < 2) return { result: { error: "insufficient_data" }, blocks: [] };
        let peak = cs[0].c, mdd = 0; for (const x of cs) { peak = Math.max(peak, x.c); mdd = Math.min(mdd, (x.c - peak) / peak); }
        const lr = cs.slice(1).map((x, i) => Math.log(x.c / cs[i].c)); const mean = lr.reduce((s, v) => s + v, 0) / lr.length;
        const sd = Math.sqrt(lr.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, lr.length - 1));
        const change = ((cs[cs.length - 1].c - cs[0].c) / cs[0].c) * 100; const step = Math.max(1, Math.ceil(cs.length / 80));
        const points = cs.filter((_, i) => i % step === 0 || i === cs.length - 1).map((x) => ({ t: x.t, c: x.c }));
        const res = { symbol: r.display, timeframe: tf, periods: cs.length, from: new Date(cs[0].t).toISOString(), to: new Date(cs[cs.length - 1].t).toISOString(), first: cs[0].c, last: cs[cs.length - 1].c,
          changePct: Number(change.toFixed(2)), high: Math.max(...cs.map((x) => x.h)), low: Math.min(...cs.map((x) => x.l)), maxDrawdownPct: Number((mdd * 100).toFixed(2)), volatilityPerPeriodPct: Number((sd * 100).toFixed(3)),
          closeOnly: ser.closeOnly, source: ser.source, fetchedAt: ser.fetchedAt };
        return { result: res, blocks: [{ type: "chart", symbol: r.display, tf, points, changePct: res.changePct, source: ser.source, asOf: res.to }] };
      }
      case "compare_assets": {
        const list = a.symbols as string[]; const c = (a.asset_class as AssetClass | undefined) ?? guessClass(list[0]); if (PENDING_CLASSES.includes(c)) return { result: pending(c), blocks: [] };
        const res = await Promise.allSettled(list.map((x) => snapshot(x, c)));
        const items = res.map((r, i) => (r.status === "fulfilled" ? { symbol: r.value.asset.display, price: r.value.quote?.price ?? null, changePct24h: r.value.quote?.changePct24h ?? null, score: r.value.summary.score, verdict: r.value.summary.verdict, regime: r.value.summary.regime, bias: r.value.summary.bias }
          : { symbol: list[i], error: engineErr(r.reason).error }));
        const ok = res.filter((r): r is PromiseFulfilledResult<Snapshot> => r.status === "fulfilled");
        return { result: { items, source: ok[0]?.value.source ?? null, generatedAt: new Date().toISOString(), disclaimer: DISCLAIMER },
          blocks: ok.length ? [{ type: "compare", items: ok.map((r) => ({ symbol: r.value.asset.display, currency: r.value.asset.currency, price: r.value.quote?.price ?? null, changePct24h: r.value.quote?.changePct24h ?? null, score: r.value.summary.score, verdict: r.value.summary.verdict, regime: r.value.summary.regime })), source: ok[0].value.source, asOf: new Date().toISOString() }] : [] };
      }
      case "scan_opportunities": {
        const s = await scanCrypto({ direction: a.direction as "alta" | "baixa" | "qualquer", limit: a.limit as number });
        return { result: s, blocks: [{ type: "scan", direction: s.direction, items: s.hits.map((h) => ({ symbol: h.display, price: h.price, changePct24h: h.changePct24h, score: h.score, verdict: h.verdict, highlights: h.highlights })), scanned: s.scanned, source: s.source, asOf: s.generatedAt }] };
      }
      case "get_market_overview": {
        const [cr, fx] = await Promise.allSettled([fetchTopCrypto(10), fetchForexPairs()]);
        const items = [...(cr.status === "fulfilled" ? cr.value : []), ...(fx.status === "fulfilled" ? fx.value.slice(0, 4) : [])].map((x) => ({ symbol: x.symbol, name: x.name, price: x.price, changePct24h: x.changePct24h, currency: x.currency, updatedAt: x.updatedAt, source: x.source }));
        const unavailable = [...(cr.status === "rejected" ? ["crypto"] : []), ...(fx.status === "rejected" ? ["forex"] : [])];
        return { result: { items, unavailable, generatedAt: new Date().toISOString() }, blocks: items.length ? [{ type: "overview", items: items.map(({ symbol, name, price, changePct24h, currency }) => ({ symbol, name, price, changePct24h, currency })), source: "CoinGecko · Frankfurter (BCE)", asOf: new Date().toISOString() }] : [] };
      }
      case "search_market_news": {
        const r = a.query ? await getAssetNews(a.query as string, ctx.lang) : await getLatestNews(ctx.lang);
        if (!r.ok) return { result: { error: r.error, message: "Notícias indisponíveis no momento." }, blocks: [] };
        const items = r.data.slice(0, 6).map((n) => ({ title: n.title, source: n.source, url: n.url, publishedAt: n.publishedAt }));
        return { result: { items, fetchedAt: r.fetchedAt }, blocks: items.length ? [{ type: "news", items, source: "Feeds de notícias", asOf: r.fetchedAt }] : [] };
      }
      case "get_user_portfolio": {
        const f = await listFavorites(ctx.userId); if (!f.ok) return { result: { error: "unavailable" }, blocks: [] };
        const assets = toItems(f.rows).filter((x) => x.kind === "asset").map((x) => ({ id: x.id, symbol: x.kind === "asset" ? x.symbol : null, name: x.kind === "asset" ? x.name : null, addedAt: x.createdAt }));
        return { result: { kind: "watchlist", assets, note: "Lista de favoritos do usuário. A plataforma ainda não registra quantidades, preço médio ou rentabilidade de carteira." }, blocks: [] };
      }
      case "search_knowledge_base": {
        if (!ctx.kb) return { result: { available: false, message: "Base de conhecimento indisponível." }, blocks: [] };
        const hits = await ctx.kb(a.query as string);
        return { result: hits.length ? { items: hits.map((h) => ({ document: h.title, source: h.source, text: h.content })) } : { items: [], message: "Nada encontrado na base para essa busca." }, blocks: [] };
      }
      case "get_economic_calendar":
        return { result: { available: false, message: "O calendário econômico ainda não está integrado a uma fonte de dados. Não informe datas ou valores de indicadores sem fonte." }, blocks: [] };
    }
  } catch (e) { return { result: engineErr(e), blocks: [] }; }
  return { result: { error: "unknown_tool" }, blocks: [] };
}
