export type CategoryKey = "crypto_spot" | "crypto_futures" | "stocks_br" | "stocks_intl" | "funds" | "forex";
export interface Asset {
  id: string; symbol: string; name: string; category: CategoryKey;
  price: number; changePct24h: number | null;
  currency: string;            // moeda de referência do preço (USD, BRL, ...)
  quote?: string;              // forex: moeda cotada (1 USD = price QUOTE)
  updatedAt: string | null;
  staleAfterMs: number;        // cadência esperada da fonte (para marcar "desatualizado")
  sparkline: number[]; source: string;
}
export const MIN15 = 15 * 60 * 1000;
export const DAYS4 = 4 * 24 * 3600 * 1000;
