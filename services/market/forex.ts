import { z } from "zod";
import { ProviderError } from "../types";
import { DAYS4, type Asset } from "./types";

export const FOREX_QUOTES = ["BRL", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "MXN", "CNY", "ZAR"] as const;
const NAMES: Record<string, string> = { BRL: "Real brasileiro", EUR: "Euro", GBP: "Libra esterlina", JPY: "Iene", CAD: "Dólar canadense", AUD: "Dólar australiano", CHF: "Franco suíço", MXN: "Peso mexicano", CNY: "Yuan", ZAR: "Rand sul-africano" };
const Resp = z.object({ rates: z.record(z.string(), z.record(z.string(), z.number())) });

/** Taxas de REFERÊNCIA DIÁRIA (BCE via Frankfurter), base USD. Não são cotações em tempo real. */
export function normalizeForex(json: unknown): Asset[] {
  const p = Resp.safeParse(json);
  if (!p.success) throw new ProviderError("invalid_response");
  const dates = Object.keys(p.data.rates).sort();
  if (dates.length === 0) throw new ProviderError("invalid_response");
  const last = dates[dates.length - 1], prev = dates[dates.length - 2];
  const out: Asset[] = [];
  for (const q of FOREX_QUOTES) {
    const price = p.data.rates[last]?.[q];
    if (typeof price !== "number") continue;
    const before = prev ? p.data.rates[prev]?.[q] : undefined;
    out.push({
      id: `usd-${q.toLowerCase()}`, symbol: `USD/${q}`, name: `Dólar / ${NAMES[q]}`, category: "forex",
      price, currency: q, quote: q,
      changePct24h: typeof before === "number" && before !== 0 ? ((price - before) / before) * 100 : null,
      updatedAt: `${last}T16:00:00+01:00`, staleAfterMs: DAYS4,
      sparkline: dates.map((d) => p.data.rates[d]?.[q]).filter((n): n is number => typeof n === "number"),
      source: "Frankfurter (BCE)",
    });
  }
  return out;
}

export async function fetchForexPairs(): Promise<Asset[]> {
  const base = process.env.FOREX_BASE_URL || "https://api.frankfurter.dev/v1";
  const from = new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  let res: Response;
  try { res = await fetch(`${base}/${from}..?base=USD&symbols=${FOREX_QUOTES.join(",")}`, { next: { revalidate: 3600, tags: ["market"] }, signal: AbortSignal.timeout(8000) }); }
  catch { throw new ProviderError("unavailable"); }
  if (res.status === 429) throw new ProviderError("rate_limited");
  if (!res.ok) throw new ProviderError("unavailable", `status ${res.status}`);
  return normalizeForex(await res.json());
}

/** Catálogo fixo dos pares suportados (para busca/sugestões sem consultar cotações). */
export const forexCatalog = () => FOREX_QUOTES.map((q) => ({ id: `usd-${q.toLowerCase()}`, symbol: `USD/${q}`, name: `Dólar / ${NAMES[q]}`, quote: q as string }));
