import { CATEGORIES } from "@/services/market/categories";
import { normalizeText } from "@/services/market/query";
import { forexCatalog } from "@/services/market/forex";
import { searchCoins, type CoinSearchHit } from "@/services/market/coingecko";
import { bybitSpotBases, rankSearch } from "@/services/market/bybit";
import { ProviderError, type ProviderErrorCode } from "@/services/types";
import type { CategoryKey } from "@/services/market/types";

export interface SearchMarket { key: CategoryKey; label: string; pending: boolean; href: string }
export interface SearchAsset { id: string; symbol: string; name: string; category: CategoryKey; categoryLabel: string; href: string; rank: number | null }
export interface SearchResponse { q: string; markets: SearchMarket[]; assets: SearchAsset[]; errors: { source: "crypto"; code: ProviderErrorCode }[] }

export const MIN_QUERY = 2, MAX_QUERY = 60, MAX_CRYPTO = 8, MAX_FOREX = 4, MAX_TOTAL = 10;
/** Saneia a consulta: remove controles, colapsa espaços, limita o tamanho. */
export const normalizeQuery = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);

const ALIASES: Record<CategoryKey, string[]> = {
  crypto_spot: ["cripto", "crypto", "criptomoedas", "cryptocurrency", "spot"], crypto_futures: ["futuros", "futures", "derivativos", "cripto futuros"],
  stocks_br: ["acoes", "acoes brasileiras", "bolsa", "b3", "brasil", "stocks"], stocks_intl: ["internacionais", "internacional", "nasdaq", "nyse", "wall street", "international"],
  funds: ["fii", "fiis", "etf", "etfs", "fundos", "reit"], forex: ["forex", "cambio", "moedas", "currency", "currencies", "dolar", "real"],
};
export function matchMarkets(q: string, lang: "pt" | "en"): SearchMarket[] {
  const n = normalizeText(q); if (n.length < MIN_QUERY) return [];
  return CATEGORIES.filter((c) => normalizeText(`${c.label.pt} ${c.label.en} ${c.key.replace("_", " ")} ${ALIASES[c.key].join(" ")}`).includes(n))
    .map((c) => ({ key: c.key, label: c.label[lang], pending: c.provider === null, href: c.key === "crypto_spot" ? "/mercado" : `/mercado?cat=${c.key}` }));
}
export function matchForex(q: string, lang: "pt" | "en"): SearchAsset[] {
  const n = normalizeText(q); if (n.length < MIN_QUERY) return [];
  const label = CATEGORIES.find((c) => c.key === "forex")!.label[lang];
  return forexCatalog().filter((p) => normalizeText(`${p.symbol} ${p.name} ${p.id} ${p.quote}`).includes(n)).slice(0, MAX_FOREX)
    .map((p) => ({ id: p.id, symbol: p.symbol, name: p.name, category: "forex" as const, categoryLabel: label, href: `/mercado/${p.id}`, rank: null }));
}
/** Ordem: símbolo exato primeiro; depois cripto por ranking de mercado (sem ranking por último); depois forex. */
export function rankAssets(q: string, crypto: SearchAsset[], forex: SearchAsset[]): SearchAsset[] {
  const n = normalizeText(q).replace("/", "");
  const exact = (a: SearchAsset) => normalizeText(a.symbol).replace("/", "") === n;
  const byRank = [...crypto].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  const all = [...byRank, ...forex];
  return [...all.filter(exact), ...all.filter((a) => !exact(a))].slice(0, MAX_TOTAL);
}
const ID = /^[a-z0-9][a-z0-9-]{0,80}$/;
export interface SearchDeps { crypto: (q: string) => Promise<CoinSearchHit[]> }
/** Cripto da busca global: só moedas negociadas na Bybit (par USDT), um resultado por símbolo. Sem a lista da Bybit, busca sem filtro. */
const bybitCrypto = async (q: string) => { const [hits, bases] = await Promise.all([searchCoins(q, 100), bybitSpotBases()]); return rankSearch(hits, q, bases); };
/** Busca SOMENTE ativos e mercados (nunca notícias, conteúdos ou sinais). Falha de um provedor não derruba o resto. */
export async function runSearch(rawQ: string, lang: "pt" | "en", deps: SearchDeps = { crypto: bybitCrypto }): Promise<SearchResponse> {
  const q = normalizeQuery(rawQ);
  if (normalizeText(q).length < MIN_QUERY) return { q, markets: [], assets: [], errors: [] };
  const errors: SearchResponse["errors"] = []; let cryptoAssets: SearchAsset[] = [];
  const label = CATEGORIES.find((c) => c.key === "crypto_spot")!.label[lang];
  try {
    const hits = await deps.crypto(q);
    cryptoAssets = hits.filter((h) => ID.test(h.id)).slice(0, MAX_CRYPTO).map((h) => ({ id: h.id, symbol: h.symbol, name: h.name, category: "crypto_spot" as const, categoryLabel: label, href: `/mercado/${h.id}`, rank: h.rank }));
  } catch (e) { errors.push({ source: "crypto", code: e instanceof ProviderError ? e.code : "unavailable" }); }
  return { q, markets: matchMarkets(q, lang), assets: rankAssets(q, cryptoAssets, matchForex(q, lang)), errors };
}
