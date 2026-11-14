import { cache } from "react";
import { toResult } from "../types";
import { fetchLatestNews } from "./newsapi";
import { fetchRssItems, matchQuery } from "./rss";

/** Provedor de notícias: NEWS_PROVIDER ("rss" | "newsapi"); sem ele, NewsAPI quando há NEWS_API_KEY, senão RSS público (sem chave). */
export const newsProvider = (): "rss" | "newsapi" => { const p = process.env.NEWS_PROVIDER; return p === "rss" || p === "newsapi" ? p : process.env.NEWS_API_KEY ? "newsapi" : "rss"; };
const latest = async (lang: "pt" | "en", limit: number, query?: string) => {
  if (newsProvider() === "newsapi") return fetchLatestNews(lang, limit, query);
  const { items } = await fetchRssItems({ lang });
  return (query ? matchQuery(items, query) : items).slice(0, limit);
};
export const getLatestNews = cache((lang: "pt" | "en") => toResult(() => latest(lang, 5)));
export const getAssetNews = cache((query: string, lang: "pt" | "en") => toResult(() => latest(lang, 5, query)));
