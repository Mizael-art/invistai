import type { NewsCategory } from "./types";
export interface NewsCategoryDef { key: NewsCategory; label: { pt: string; en: string }; query: { pt: string; en: string } }
/** Consultas por categoria (NewsAPI /everything). Ajustáveis sem tocar na UI. */
export const NEWS_CATEGORIES: NewsCategoryDef[] = [
  { key: "crypto", label: { pt: "Criptomoedas", en: "Crypto" }, query: { pt: "(bitcoin OR criptomoedas OR ethereum OR cripto)", en: "(bitcoin OR crypto OR ethereum OR cryptocurrency)" } },
  { key: "stocks", label: { pt: "Bolsa e ações", en: "Stocks" }, query: { pt: "(bolsa OR ações OR Ibovespa OR \"mercado de ações\")", en: "(stocks OR \"stock market\" OR Nasdaq OR \"Wall Street\")" } },
  { key: "economy", label: { pt: "Economia global", en: "Global economy" }, query: { pt: "(economia OR inflação OR \"taxa de juros\" OR PIB)", en: "(economy OR inflation OR \"interest rates\" OR GDP)" } },
  { key: "forex", label: { pt: "Forex e moedas", en: "Forex" }, query: { pt: "(câmbio OR forex OR \"dólar\" OR euro)", en: "(forex OR \"exchange rate\" OR dollar OR euro)" } },
];
export const NEWS_CATEGORY_KEYS = NEWS_CATEGORIES.map((c) => c.key) as [NewsCategory, ...NewsCategory[]];
export const newsCategory = (k: NewsCategory) => NEWS_CATEGORIES.find((c) => c.key === k)!;
