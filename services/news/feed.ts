import { cache } from "react";
import { normalizeText } from "@/services/market/query";
import { ProviderError, type ProviderErrorCode } from "../types";
import { fetchNewsPage } from "./newsapi";
import { newsCategory, NEWS_CATEGORIES } from "./categories";
import type { NewsCategory, NewsItem } from "./types";

export const FEED_SINGLE = 20, FEED_MULTI = 10;
export interface Feed { items: NewsItem[]; hasNext: boolean; failed: NewsCategory[]; error?: ProviderErrorCode }

/** Mescla listas por categoria: remove duplicatas (id/URL canônica e título) e ordena pela data real de publicação. */
export function mergeFeeds(lists: { category: NewsCategory; items: NewsItem[] }[]): NewsItem[] {
  const ids = new Set<string>(), titles = new Set<string>(), out: NewsItem[] = [];
  for (const l of lists) for (const it of l.items) {
    const tk = it.title.toLowerCase();
    if (ids.has(it.id) || titles.has(tk)) continue;
    ids.add(it.id); titles.add(tk); out.push({ ...it, category: l.category });
  }
  return out.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}
/** Busca em título e fonte dos itens carregados (sem acento/caixa). */
export function filterNews(items: NewsItem[], q: string): NewsItem[] {
  const n = normalizeText(q); if (!n) return items;
  return items.filter((i) => normalizeText(`${i.title} ${i.source}`).includes(n));
}

async function load(cats: NewsCategory[], lang: "pt" | "en", page: number): Promise<Feed> {
  const size = cats.length === 1 ? FEED_SINGLE : FEED_MULTI;
  const settled = await Promise.allSettled(cats.map((c) => fetchNewsPage({ q: newsCategory(c).query[lang], lang, page, pageSize: size })));
  const ok: { category: NewsCategory; items: NewsItem[]; raw: number }[] = [], failed: NewsCategory[] = [];
  let firstErr: ProviderErrorCode = "unavailable";
  settled.forEach((r, i) => { if (r.status === "fulfilled") ok.push({ category: cats[i], items: r.value.items, raw: r.value.rawCount }); else { failed.push(cats[i]); firstErr = r.reason instanceof ProviderError ? r.reason.code : "unavailable"; } });
  if (ok.length === 0) throw new ProviderError(firstErr);
  return { items: mergeFeeds(ok), hasNext: ok.some((o) => o.raw >= size) && page < 20, failed };
}
const cached = cache(async (key: string): Promise<{ ok: true; data: Feed } | { ok: false; error: ProviderErrorCode }> => {
  const { cats, lang, page } = JSON.parse(key) as { cats: NewsCategory[]; lang: "pt" | "en"; page: number };
  try { return { ok: true, data: await load(cats, lang, page) }; } catch (e) { return { ok: false, error: e instanceof ProviderError ? e.code : "unavailable" }; }
});
export const getFeed = (cats: NewsCategory[], lang: "pt" | "en", page: number) => cached(JSON.stringify({ cats, lang, page }));
export const ALL_CATEGORIES = NEWS_CATEGORIES.map((c) => c.key);
