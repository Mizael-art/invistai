import { createHash } from "node:crypto";
import { z } from "zod";
import { ProviderError } from "../types";
import type { NewsItem } from "./types";

/** Só links http(s): descarta javascript:, data: e afins vindos do provedor (defesa contra XSS). */
export const isHttpUrl = (u: unknown): u is string => { if (typeof u !== "string") return false; try { const p = new URL(u).protocol; return p === "https:" || p === "http:"; } catch { return false; } };
const Article = z.object({
  title: z.string().nullable(), url: z.string().url().refine(isHttpUrl), publishedAt: z.string().nullable(),
  urlToImage: z.string().nullable().optional(), source: z.object({ name: z.string().nullable() }).optional(),
});

export function canonicalUrl(u: string): string {
  try { const x = new URL(u); x.hash = ""; for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(k)) x.searchParams.delete(k); return x.origin + x.pathname.replace(/\/$/, "") + x.search; }
  catch { return u; }
}

/** Normaliza, remove itens sem título/data/URL válida e deduplica por URL canônica e título. */
export function normalizeArticles(json: unknown, opts: { maxAgeMs?: number; now?: number } = {}): NewsItem[] {
  const top = z.object({ status: z.string().optional(), articles: z.array(z.unknown()) }).safeParse(json);
  if (!top.success) throw new ProviderError("invalid_response");
  const seenUrl = new Set<string>(), seenTitle = new Set<string>(), out: NewsItem[] = [];
  for (const raw of top.data.articles) {
    const a = Article.safeParse(raw);
    if (!a.success || !a.data.title || !a.data.publishedAt || a.data.title === "[Removed]") continue;
    const ts = Date.parse(a.data.publishedAt);
    if (Number.isNaN(ts)) continue;
    if (opts.maxAgeMs !== undefined && (opts.now ?? Date.now()) - ts > opts.maxAgeMs) continue;   // não apresentar conteúdo antigo como recente
    const cu = canonicalUrl(a.data.url), tk = a.data.title.trim().toLowerCase();
    if (seenUrl.has(cu) || seenTitle.has(tk)) continue;
    seenUrl.add(cu); seenTitle.add(tk);
    out.push({ id: createHash("sha1").update(cu).digest("hex").slice(0, 16), title: a.data.title.trim(), source: a.data.source?.name ?? "—", url: a.data.url, publishedAt: new Date(a.data.publishedAt).toISOString(), imageUrl: isHttpUrl(a.data.urlToImage) && a.data.urlToImage.startsWith("https://") ? a.data.urlToImage : null });
  }
  return out.sort((x, y) => Date.parse(y.publishedAt) - Date.parse(x.publishedAt));
}

export async function fetchLatestNews(lang: "pt" | "en", limit = 5, query?: string): Promise<NewsItem[]> {
  const key = process.env.NEWS_API_KEY;
  if (!key) throw new ProviderError("not_configured");
  const base = process.env.NEWS_API_BASE_URL || "https://newsapi.org/v2";
  const custom = query?.replace(/[\u0000-\u001f"]/g, " ").trim().slice(0, 80);
  const q = encodeURIComponent(custom ? `"${custom}"` : lang === "pt" ? "(bitcoin OR criptomoedas OR bolsa OR economia OR dólar)" : "(bitcoin OR crypto OR stocks OR economy OR forex)");
  const url = `${base}/everything?q=${q}&language=${lang}&sortBy=publishedAt&pageSize=${Math.min(limit * 3, 30)}`;
  let res: Response;
  try { res = await fetch(url, { headers: { "X-Api-Key": key }, next: { revalidate: 600, tags: ["news"] }, signal: AbortSignal.timeout(8000) }); }
  catch { throw new ProviderError("unavailable"); }
  if (res.status === 429) throw new ProviderError("rate_limited");
  if (!res.ok) throw new ProviderError("unavailable", `status ${res.status}`);
  return normalizeArticles(await res.json()).slice(0, limit);
}

export const NEWS_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
/** Uma página de uma consulta (a chave do provedor nunca sai do servidor). Cache de 30 min por consulta/página (plano Developer: 100 req/dia). */
export async function fetchNewsPage(o: { q: string; lang: "pt" | "en"; page: number; pageSize: number }): Promise<{ items: NewsItem[]; rawCount: number }> {
  const key = process.env.NEWS_API_KEY;
  if (!key) throw new ProviderError("not_configured");
  const base = process.env.NEWS_API_BASE_URL || "https://newsapi.org/v2";
  const from = new Date(Date.now() - NEWS_MAX_AGE_MS).toISOString().slice(0, 10);
  const url = `${base}/everything?q=${encodeURIComponent(o.q)}&language=${o.lang}&sortBy=publishedAt&from=${from}&pageSize=${o.pageSize}&page=${o.page}`;
  let res: Response;
  try { res = await fetch(url, { headers: { "X-Api-Key": key }, next: { revalidate: 1800, tags: ["news"] }, signal: AbortSignal.timeout(8000) }); }
  catch { throw new ProviderError("unavailable"); }
  if (res.status === 429) throw new ProviderError("rate_limited");
  if (!res.ok) throw new ProviderError("unavailable", `status ${res.status}`);
  const json = await res.json();
  const raw = Array.isArray((json as { articles?: unknown[] })?.articles) ? (json as { articles: unknown[] }).articles.length : 0;
  return { items: normalizeArticles(json, { maxAgeMs: NEWS_MAX_AGE_MS }), rawCount: raw };
}
