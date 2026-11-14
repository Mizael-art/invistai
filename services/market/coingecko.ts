import { z } from "zod";
import { ProviderError } from "../types";
import { MIN15, type Asset } from "./types";

const Row = z.object({
  id: z.string(), symbol: z.string(), name: z.string(),
  current_price: z.number().nullable(),
  price_change_percentage_24h: z.number().nullable().optional(),
  last_updated: z.string().nullable().optional(),
  sparkline_in_7d: z.object({ price: z.array(z.number().nullable()) }).nullable().optional(),
});

/** Normaliza a resposta; descarta ativos sem preço (nunca converte indisponível em zero). */
export function normalizeMarkets(json: unknown): Asset[] {
  const parsed = z.array(z.unknown()).safeParse(json);
  if (!parsed.success) throw new ProviderError("invalid_response");
  const out: Asset[] = [];
  for (const raw of parsed.data) {
    const r = Row.safeParse(raw);
    if (!r.success || r.data.current_price === null) continue;
    out.push({
      id: r.data.id, symbol: r.data.symbol.toUpperCase(), name: r.data.name, category: "crypto_spot", staleAfterMs: MIN15,
      price: r.data.current_price, changePct24h: r.data.price_change_percentage_24h ?? null,
      currency: "USD", updatedAt: r.data.last_updated ?? null,
      sparkline: (r.data.sparkline_in_7d?.price ?? []).filter((n): n is number => typeof n === "number"),
      source: "CoinGecko",
    });
  }
  return out;
}

export async function fetchTopCrypto(limit = 10): Promise<Asset[]> {
  const base = process.env.COINGECKO_BASE_URL || "https://api.coingecko.com/api/v3";
  const url = `${base}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=true&price_change_percentage=24h`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
  let res: Response;
  try { res = await fetch(url, { headers, next: { revalidate: 60, tags: ["market"] }, signal: AbortSignal.timeout(8000) }); }
  catch { throw new ProviderError("unavailable"); }
  if (res.status === 429) throw new ProviderError("rate_limited");
  if (!res.ok) throw new ProviderError("unavailable", `status ${res.status}`);
  return normalizeMarkets(await res.json());
}

const base = () => process.env.COINGECKO_BASE_URL || "https://api.coingecko.com/api/v3";
async function cgGet(path: string): Promise<unknown> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
  let res: Response;
  try { res = await fetch(`${base()}${path}`, { headers, next: { revalidate: 60, tags: ["market"] }, signal: AbortSignal.timeout(8000) }); }
  catch { throw new ProviderError("unavailable"); }
  if (res.status === 429) throw new ProviderError("rate_limited");
  if (!res.ok) throw new ProviderError("unavailable", `status ${res.status}`);
  return res.json();
}
/** Lista paginada por capitalização, ou por ids (resultado de busca). Retorna também a contagem bruta (para saber se há próxima página). */
export async function fetchMarkets(opts: { page?: number; perPage?: number; ids?: string[] }): Promise<{ items: Asset[]; rawCount: number }> {
  const perPage = opts.perPage ?? 25;
  const q = `vs_currency=usd&order=market_cap_desc&sparkline=true&price_change_percentage=24h` + (opts.ids ? `&ids=${encodeURIComponent(opts.ids.join(","))}&per_page=${opts.ids.length}&page=1` : `&per_page=${perPage}&page=${opts.page ?? 1}`);
  const json = await cgGet(`/coins/markets?${q}`);
  const raw = Array.isArray(json) ? json.length : 0;
  return { items: normalizeMarkets(json), rawCount: raw };
}
export function parseSearchIds(json: unknown, max = 20): string[] {
  const p = z.object({ coins: z.array(z.object({ id: z.string() })) }).safeParse(json);
  if (!p.success) throw new ProviderError("invalid_response");
  return p.data.coins.slice(0, max).map((c) => c.id);
}
export async function searchCoinIds(query: string): Promise<string[]> {
  return parseSearchIds(await cgGet(`/search?query=${encodeURIComponent(query)}`));
}

const num = z.number().nullable().optional();
const usd = z.object({ usd: num }).partial().nullable().optional();
const Detail = z.object({
  id: z.string(), description: z.object({ en: z.string().optional(), pt: z.string().optional() }).partial().nullable().optional(),
  categories: z.array(z.string().nullable()).nullable().optional(),
  market_data: z.object({ market_cap: usd, total_volume: usd, high_24h: usd, low_24h: usd, ath: usd, circulating_supply: num }).partial().nullable().optional(),
});
export interface CoinDetail { description: string | null; categories: string[]; marketCap: number | null; volume24h: number | null; high24h: number | null; low24h: number | null; ath: number | null; circulating: number | null }

/** Remove HTML/entidades do texto do provedor e limita o tamanho (corte em fim de frase quando possível). */
export function stripHtml(html: string, max = 500): string {
  const t = html.replace(/<\/?(?:br|p|div|li|ul|ol|h[1-6])\b[^>]*>/gi, " ").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max), dot = cut.lastIndexOf(". ");
  return (dot > max * 0.5 ? cut.slice(0, dot + 1) : cut.replace(/\s+\S*$/, "") + "…");
}
export function normalizeCoinDetail(json: unknown): CoinDetail {
  const p = Detail.safeParse(json);
  if (!p.success) throw new ProviderError("invalid_response");
  const m = p.data.market_data, d = p.data.description;
  const text = d?.pt?.trim() || d?.en?.trim() || "";
  return {
    description: text ? stripHtml(text) : null, categories: (p.data.categories ?? []).filter((c): c is string => !!c).slice(0, 4),
    marketCap: m?.market_cap?.usd ?? null, volume24h: m?.total_volume?.usd ?? null, high24h: m?.high_24h?.usd ?? null, low24h: m?.low_24h?.usd ?? null,
    ath: m?.ath?.usd ?? null, circulating: m?.circulating_supply ?? null,
  };
}
export async function fetchCoinDetail(id: string): Promise<CoinDetail> {
  return normalizeCoinDetail(await cgGet(`/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`));
}

const CoinHit = z.object({ id: z.string(), name: z.string(), symbol: z.string(), market_cap_rank: z.number().nullable().optional() });
export interface CoinSearchHit { id: string; name: string; symbol: string; rank: number | null }
/** Normaliza `/search` do CoinGecko: descarta itens malformados, preserva a ordem de relevância do provedor. */
export function parseSearchCoins(json: unknown, max = 20): CoinSearchHit[] {
  const top = z.object({ coins: z.array(z.unknown()) }).safeParse(json);
  if (!top.success) throw new ProviderError("invalid_response");
  const out: CoinSearchHit[] = [];
  for (const raw of top.data.coins) { const c = CoinHit.safeParse(raw); if (c.success) out.push({ id: c.data.id, name: c.data.name, symbol: c.data.symbol.toUpperCase(), rank: c.data.market_cap_rank ?? null }); if (out.length >= max) break; }
  return out;
}
export async function searchCoins(query: string): Promise<CoinSearchHit[]> { return parseSearchCoins(await cgGet(`/search?query=${encodeURIComponent(query)}`)); }
