import type { CategoryKey } from "./types";
export interface CategoryDef { key: CategoryKey; provider: "coingecko" | "frankfurter" | null; label: { pt: string; en: string }; pendingHint: string }
/** Provedor por categoria. `null` = nenhuma fonte configurada (estado "pendente", sem dados inventados). */
export const CATEGORIES: CategoryDef[] = [
  { key: "crypto_spot", provider: "coingecko", label: { pt: "Criptomoedas (spot)", en: "Crypto (spot)" }, pendingHint: "" },
  { key: "crypto_futures", provider: null, label: { pt: "Criptomoedas (futuros)", en: "Crypto (futures)" }, pendingHint: "Provedor de derivativos (consulta informativa) a definir." },
  { key: "stocks_br", provider: null, label: { pt: "Ações brasileiras", en: "Brazilian stocks" }, pendingHint: "Fonte de cotações B3 (ex.: brapi, com token) a contratar." },
  { key: "stocks_intl", provider: null, label: { pt: "Ações internacionais", en: "International stocks" }, pendingHint: "Fonte de cotações internacionais a contratar." },
  { key: "funds", provider: null, label: { pt: "FIIs e ETFs", en: "REITs and ETFs" }, pendingHint: "Fonte de cotações de FIIs/ETFs a contratar." },
  { key: "forex", provider: "frankfurter", label: { pt: "Forex e moedas", en: "Forex and currencies" }, pendingHint: "" },
];
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as [CategoryKey, ...CategoryKey[]];
export const categoryOf = (k: CategoryKey) => CATEGORIES.find((c) => c.key === k)!;
