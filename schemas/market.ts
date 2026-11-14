import { z } from "zod";
import { CATEGORY_KEYS } from "@/services/market/categories";

export const SORT_KEYS = ["rank", "name", "price", "change"] as const;
export const FILTER_KEYS = ["all", "up", "down"] as const;
const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

export const marketParams = z.object({
  cat: z.enum(CATEGORY_KEYS).catch("crypto_spot"),
  q: z.string().transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60)).catch(""),
  sort: z.enum(SORT_KEYS).catch("rank"),
  dir: z.enum(["asc", "desc"]).catch("desc"),
  filter: z.enum(FILTER_KEYS).catch("all"),
  page: z.coerce.number().int().min(1).max(200).catch(1),
});
export type MarketParams = z.infer<typeof marketParams>;
/** Valida e saneia a query string. Qualquer valor inválido cai no padrão (nunca lança). */
export function parseMarketParams(raw: Record<string, unknown>): MarketParams {
  return marketParams.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, first(v)])));
}
