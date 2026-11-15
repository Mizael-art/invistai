import { z } from "zod";

/** Moedas negociadas na Bybit (spot, par USDT, status Trading). API pública, sem chave. Cache de 6 h.
 *  Usada para restringir a busca do Mercado a ativos que existem na Bybit. Falha → null (a busca segue sem o filtro). */
const Resp = z.object({ retCode: z.number(), result: z.object({ list: z.array(z.object({ baseCoin: z.string(), quoteCoin: z.string(), status: z.string() })), nextPageCursor: z.string().optional() }) });
export async function bybitSpotBases(): Promise<Set<string> | null> {
  const base = process.env.BYBIT_PUBLIC_URL || "https://api.bybit.com";
  try {
    const out = new Set<string>(); let cursor = "";
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${base}/v5/market/instruments-info?category=spot&limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { next: { revalidate: 21600, tags: ["bybit-spot"] }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) return null;
      const p = Resp.safeParse(await res.json()); if (!p.success || p.data.retCode !== 0) return null;
      for (const x of p.data.result.list) if (x.quoteCoin === "USDT" && x.status === "Trading") out.add(x.baseCoin.toUpperCase());
      cursor = p.data.result.nextPageCursor ?? ""; if (!cursor) break;
    }
    return out.size ? out : null;
  } catch { return null; }
}

export interface SearchCoin { id: string; symbol: string; name: string; rank: number | null }
/** Ordena e filtra resultados da busca: só símbolos listados na Bybit (quando a lista existe), um por símbolo (o de maior
 *  capitalização — evita clones com o mesmo ticker), símbolo exato primeiro, depois prefixo, depois ranking. */
export function rankSearch<T extends SearchCoin>(coins: T[], q: string, bases: Set<string> | null, max = 20): T[] {
  const Q = q.trim().toUpperCase(); const best = new Map<string, T>();
  const rank = (c: SearchCoin) => c.rank ?? Number.MAX_SAFE_INTEGER;
  for (const c of coins) {
    const s = c.symbol.toUpperCase(); if (bases && !bases.has(s)) continue;
    const cur = best.get(s); if (!cur || rank(c) < rank(cur)) best.set(s, c);
  }
  const score = (c: SearchCoin) => { const s = c.symbol.toUpperCase(), n = c.name.toUpperCase(); return s === Q ? 0 : n === Q ? 1 : s.startsWith(Q) ? 2 : n.startsWith(Q) ? 3 : 4; };
  return [...best.values()].sort((a, b) => score(a) - score(b) || rank(a) - rank(b)).slice(0, max);
}
