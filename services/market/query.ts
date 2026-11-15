import { cache } from "react";
import { z } from "zod";
import { toResult, type Result } from "../types";
import type { MarketParams } from "@/schemas/market";
import type { Asset } from "./types";
import { categoryOf } from "./categories";
import { fetchMarkets, searchCoins } from "./coingecko";
import { bybitSpotBases, rankSearch } from "./bybit";
import { fetchForexPairs } from "./forex";
import { ProviderError } from "../types";

export const PER_PAGE = 25;
export interface MarketPage { items: Asset[]; hasNext: boolean }

export const normalizeText = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
export const matches = (a: Asset, q: string) => { const n = normalizeText(q); return !n || normalizeText(`${a.symbol} ${a.name} ${a.id}`).includes(n); };

/** Filtro e ordenação sobre os resultados já carregados (itens sem variação ficam sempre por último ao ordenar por variação). */
export function applyFilterSort(items: Asset[], filter: MarketParams["filter"], sort: MarketParams["sort"], dir: MarketParams["dir"]): Asset[] {
  let out = items.filter((a) => filter === "all" || (a.changePct24h !== null && (filter === "up" ? a.changePct24h > 0 : a.changePct24h < 0)));
  if (sort === "rank") return dir === "asc" ? [...out].reverse() : out;
  const m = dir === "asc" ? 1 : -1;
  out = [...out].sort((x, y) => {
    if (sort === "name") return m * x.name.localeCompare(y.name, "pt");
    if (sort === "price") return m * (x.price - y.price);
    if (x.changePct24h === null) return y.changePct24h === null ? 0 : 1;
    if (y.changePct24h === null) return -1;
    return m * (x.changePct24h - y.changePct24h);
  });
  return out;
}

async function load(p: MarketParams): Promise<MarketPage> {
  const def = categoryOf(p.cat);
  if (def.provider === "coingecko") {
    if (p.q) {
      // Busca restrita às moedas negociadas na Bybit (par USDT); se a lista da Bybit falhar, busca sem o filtro.
      const [coins, bases] = await Promise.all([searchCoins(p.q, 100), bybitSpotBases()]);
      const ids = rankSearch(coins, p.q, bases).map((c) => c.id);
      if (ids.length === 0) return { items: [], hasNext: false };
      const items = (await fetchMarkets({ ids })).items, pos = new Map(ids.map((id, i) => [id, i]));
      return { items: items.sort((a, b) => (pos.get(a.id) ?? 99) - (pos.get(b.id) ?? 99)), hasNext: false };
    }
    const r = await fetchMarkets({ page: p.page, perPage: PER_PAGE });
    return { items: r.items, hasNext: r.rawCount >= PER_PAGE && p.page < 200 };
  }
  if (def.provider === "frankfurter") return { items: (await fetchForexPairs()).filter((a) => matches(a, p.q)), hasNext: false };
  throw new ProviderError("not_configured");
}
const cached = cache((key: string) => toResult(() => load(JSON.parse(key) as MarketParams)));
/** Uma consulta por renderização por combinação de categoria/busca/página. Sort/filter não entram na chave. */
export const queryMarket = (p: MarketParams): Promise<Result<MarketPage>> => cached(JSON.stringify({ cat: p.cat, q: p.q, page: p.page, sort: "rank", dir: "desc", filter: "all" }));
void z;
