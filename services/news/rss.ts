import { createHash } from "node:crypto";
import { ProviderError } from "../types";
import { canonicalUrl, isHttpUrl, NEWS_MAX_AGE_MS } from "./newsapi";
import type { NewsCategory, NewsItem } from "./types";
import { normalizeText } from "@/services/market/query";

/** Fontes RSS públicas (manchete + link para a matéria original; o conteúdo nunca é copiado).
 *  `match` restringe um feed amplo a uma categoria por palavras do título. */
export interface RssSource { url: string; source: string; cat: NewsCategory; lang: "pt" | "en"; match?: RegExp }
export const RSS_SOURCES: RssSource[] = [
  { url: "https://livecoins.com.br/feed/", source: "Livecoins", cat: "crypto", lang: "pt" },
  { url: "https://www.moneytimes.com.br/tag/criptomoedas/feed/", source: "Money Times", cat: "crypto", lang: "pt" },
  { url: "https://www.moneytimes.com.br/mercados/feed/", source: "Money Times", cat: "stocks", lang: "pt" },
  { url: "https://www.moneytimes.com.br/economia/feed/", source: "Money Times", cat: "economy", lang: "pt" },
  { url: "https://www.moneytimes.com.br/tag/cambio/feed/", source: "Money Times", cat: "forex", lang: "pt" },
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", source: "CoinDesk", cat: "crypto", lang: "en" },
  { url: "https://cointelegraph.com/rss", source: "Cointelegraph", cat: "crypto", lang: "en" },
  { url: "https://investinglive.com/feed/news", source: "investingLive", cat: "stocks", lang: "en", match: /\b(stocks?|shares|equit|nasdaq|s&p|dow|earnings|ipo|wall street|index|nvidia|apple|tesla)\b/i },
  { url: "https://investinglive.com/feed/news", source: "investingLive", cat: "economy", lang: "en", match: /\b(cpi|ppi|gdp|inflation|fed|fomc|ecb|boe|boj|jobs|payrolls|unemployment|retail sales|pmi|rates?|economy|treasur)/i },
  { url: "https://investinglive.com/feed/news", source: "investingLive", cat: "forex", lang: "en", match: /\b(usd|eur|jpy|gbp|chf|aud|nzd|cad|cny|dollar|yen|euro|sterling|forex|fx|yuan)\b|\/(usd|jpy|eur)/i },
];

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; }
    return ENT[e.toLowerCase()] ?? m;
  });
}
const text = (s: string | undefined) => s ? decodeEntities(s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim() : "";
const tag = (block: string, name: string) => block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1];

/** Interpreta RSS 2.0 e Atom sem dependências. Itens sem título, link http(s) ou data válida são descartados. */
/** Imagem da matéria, quando o próprio feed a fornece (media:content/thumbnail, enclosure de imagem ou 1ª <img> do resumo). Só https. */
export function feedImage(b: string): string | null {
  const cands = [
    b.match(/<media:content[^>]*url="([^"]+)"[^>]*(?:medium="image"|type="image\/[^"]+")/i)?.[1], b.match(/<media:content[^>]*(?:medium="image"|type="image\/[^"]+")[^>]*url="([^"]+)"/i)?.[1],
    b.match(/<media:thumbnail[^>]*url="([^"]+)"/i)?.[1], b.match(/<media:content[^>]*url="([^"]+\.(?:jpe?g|png|webp)(?:\?[^"]*)?)"/i)?.[1],
    b.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image\/[^"]+"/i)?.[1], b.match(/<enclosure[^>]*type="image\/[^"]+"[^>]*url="([^"]+)"/i)?.[1],
    decodeEntities(b).match(/<img[^>]+src="(https:\/\/[^"]+)"/i)?.[1],
  ];
  for (const c of cands) { if (!c) continue; const u = decodeEntities(c).trim(); if (u.startsWith("https://") && isHttpUrl(u) && u.length < 1000) return u; }
  return null;
}

export function parseFeed(xml: string): { title: string; url: string; publishedAt: string; imageUrl?: string | null }[] {
  const out: { title: string; url: string; publishedAt: string; imageUrl?: string | null }[] = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const b of blocks.slice(0, 100)) {
    const title = text(tag(b, "title"));
    let url = text(tag(b, "link"));
    if (!url) url = decodeEntities(b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "");
    const date = text(tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "dc:date"));
    const ts = Date.parse(date.includes(" ") && /^\d{4}-\d\d-\d\d \d/.test(date) ? date.replace(" ", "T") + "Z" : date);
    if (!title || !isHttpUrl(url) || Number.isNaN(ts)) continue;
    out.push({ title: title.slice(0, 300), url, publishedAt: new Date(ts).toISOString(), imageUrl: feedImage(b) });
  }
  return out;
}

/** Só para testes: NEWS_RSS_TEST_PREFIX redireciona as fontes para um servidor local (o endereço original vai codificado no caminho). */
const sourceUrl = (u: string) => { const p = process.env.NEWS_RSS_TEST_PREFIX; const allow = !!p && (process.env.NODE_ENV !== "production" || process.env.NEWS_RSS_TEST_PREFIX_ALLOW === "1"); return allow ? p + encodeURIComponent(u) : u; };
async function fetchSource(s: RssSource): Promise<NewsItem[]> {
  let res: Response;
  try { res = await fetch(sourceUrl(s.url), { headers: { "User-Agent": "TRADEON/2.0 (+news headlines; links to original source)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" }, next: { revalidate: 900, tags: ["news"] }, signal: AbortSignal.timeout(8000) }); }
  catch { throw new ProviderError("unavailable"); }
  if (res.status === 429) throw new ProviderError("rate_limited");
  if (!res.ok) throw new ProviderError("unavailable", `status ${res.status}`);
  const items = parseFeed((await res.text()).slice(0, 2_000_000));
  return items.filter((i) => !s.match || s.match.test(i.title)).map((i) => ({ id: createHash("sha1").update(canonicalUrl(i.url)).digest("hex").slice(0, 16), title: i.title, source: s.source, url: i.url, publishedAt: i.publishedAt, imageUrl: i.imageUrl ?? null, category: s.cat }));
}

/** Itens de uma ou mais categorias, mesclados, sem duplicatas, mais recentes primeiro e com até 7 dias. Falha só se TODAS as fontes falharem. */
export async function fetchRssItems(o: { lang: "pt" | "en"; cats?: NewsCategory[]; now?: number }): Promise<{ items: NewsItem[]; failed: NewsCategory[] }> {
  const srcs = RSS_SOURCES.filter((s) => s.lang === o.lang && (!o.cats || o.cats.includes(s.cat)));
  const settled = await Promise.allSettled(srcs.map(fetchSource));
  const ok = settled.filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === "fulfilled");
  if (srcs.length && ok.length === 0) { const r = settled[0] as PromiseRejectedResult; throw r.reason instanceof ProviderError ? r.reason : new ProviderError("unavailable"); }
  const failed = [...new Set(srcs.map((s) => s.cat))].filter((c) => srcs.every((s, i) => s.cat !== c || settled[i].status === "rejected"));
  const now = o.now ?? Date.now(), seenU = new Set<string>(), seenT = new Set<string>(), out: NewsItem[] = [];
  for (const it of ok.flatMap((r) => r.value).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))) {
    const t = normalizeText(it.title);
    if (seenU.has(it.id) || seenT.has(t) || now - Date.parse(it.publishedAt) > NEWS_MAX_AGE_MS || Date.parse(it.publishedAt) - now > 3600_000) continue;
    seenU.add(it.id); seenT.add(t); out.push(it);
  }
  return { items: out, failed };
}

/** Filtra por termos (nome/símbolo do ativo) no título, sem acento/caixa. */
export function matchQuery(items: NewsItem[], query: string): NewsItem[] {
  const terms = normalizeText(query).split(/\s+/).filter((w) => w.length >= 3);
  if (!terms.length) return items;
  return items.filter((i) => { const t = ` ${normalizeText(i.title)} `; return terms.some((w) => t.includes(` ${w}`)); });
}
