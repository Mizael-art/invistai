import { describe, it, expect, vi, afterEach } from "vitest";
import { parseFeed, decodeEntities, matchQuery, fetchRssItems, RSS_SOURCES } from "@/services/news/rss";

const now = Date.parse("2026-11-14T18:00:00Z");
const rss = (items: string) => `<?xml version="1.0"?><rss version="2.0"><channel><title>X</title>${items}</channel></rss>`;
const item = (t: string, l: string, d: string) => `<item><title><![CDATA[${t}]]></title><link>${l}</link><pubDate>${d}</pubDate><description>x</description></item>`;

describe("parser RSS/Atom", () => {
  it("lê RSS 2.0 com CDATA, entidades e datas RFC 822", () => {
    const r = parseFeed(rss(item("Dólar &amp; Bolsa: &#8220;alta&#8221;", "https://a.com/1", "Sat, 14 Nov 2026 15:00:32 +0000")));
    expect(r).toEqual([{ title: "Dólar & Bolsa: “alta”", url: "https://a.com/1", publishedAt: "2026-11-14T15:00:32.000Z" }]);
  });
  it("lê Atom (link href) e datas ISO / 'AAAA-MM-DD hh:mm:ss'", () => {
    const atom = `<feed><entry><title>A</title><link rel="alternate" href="https://b.com/a"/><updated>2026-11-14T10:00:00Z</updated></entry></feed>`;
    expect(parseFeed(atom)[0]).toEqual({ title: "A", url: "https://b.com/a", publishedAt: "2026-11-14T10:00:00.000Z" });
    expect(parseFeed(rss(item("B", "https://b.com/b", "2026-10-03 09:26:02")))[0].publishedAt).toBe("2026-10-03T09:26:02.000Z");
  });
  it("descarta itens sem título, sem data válida ou com link não-http (javascript:, data:)", () => {
    const r = parseFeed(rss(item("", "https://a.com/x", "Sat, 14 Nov 2026 15:00:00 +0000") + item("Sem data", "https://a.com/y", "ontem") + item("XSS", "javascript:alert(1)", "Sat, 14 Nov 2026 15:00:00 +0000") + item("Ok", "https://a.com/z", "Sat, 14 Nov 2026 15:00:00 +0000")));
    expect(r.map((x) => x.title)).toEqual(["Ok"]);
  });
  it("remove tags HTML do título e decodifica entidades", () => { expect(decodeEntities("a &lt;b&gt; &#x41; &quot;")).toBe('a <b> A "'); });
});

describe("busca por ativo", () => {
  const it2 = (title: string) => ({ id: title, title, source: "S", url: "https://x.com", publishedAt: "2026-11-14T10:00:00Z", imageUrl: null });
  it("casa nome do ativo no título, sem acento/caixa e por palavra", () => {
    const list = [it2("Bitcoin cai 5%"), it2("Ethereum sobe"), it2("Antibitcoinismo cresce")];
    expect(matchQuery(list, "Bitcoin").map((x) => x.title)).toEqual(["Bitcoin cai 5%"]);
    expect(matchQuery(list, "ETHEREUM").length).toBe(1);
  });
});

describe("fetchRssItems", () => {
  afterEach(() => vi.unstubAllGlobals());
  const feeds: Record<string, string> = {
    "https://livecoins.com.br/feed/": rss(item("Bitcoin sobe", "https://livecoins.com.br/a?utm_source=x", "Sat, 14 Nov 2026 16:00:00 +0000") + item("Notícia velha", "https://livecoins.com.br/old", "Sat, 01 Nov 2026 16:00:00 +0000")),
    "https://www.moneytimes.com.br/tag/criptomoedas/feed/": rss(item("Bitcoin sobe", "https://moneytimes.com.br/dup", "Sat, 14 Nov 2026 15:00:00 +0000")),
    "https://www.moneytimes.com.br/mercados/feed/": rss(item("Ibovespa fecha em alta", "https://moneytimes.com.br/ibov", "Fri, 13 Nov 2026 21:57:17 +0000")),
  };
  const fetcher = vi.fn(async (u: string) => feeds[u] ? new Response(feeds[u], { status: 200 }) : new Response("x", { status: 503 }));
  it("mescla fontes, remove duplicatas e antigas (> 7 dias), ordena e marca categoria/fonte", async () => {
    vi.stubGlobal("fetch", fetcher);
    const { items, failed } = await fetchRssItems({ lang: "pt", cats: ["crypto", "stocks"], now });
    expect(items.map((i) => [i.title, i.source, i.category])).toEqual([["Bitcoin sobe", "Livecoins", "crypto"], ["Ibovespa fecha em alta", "Money Times", "stocks"]]);
    expect(failed).toEqual([]);
  });
  it("falha parcial: categoria cujas fontes falharam aparece em 'failed'; as outras continuam", async () => {
    vi.stubGlobal("fetch", fetcher);
    const { items, failed } = await fetchRssItems({ lang: "pt", cats: ["stocks", "economy"], now });
    expect(items.length).toBe(1); expect(failed).toEqual(["economy"]);
  });
  it("todas as fontes fora → erro do provedor (nada inventado)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    await expect(fetchRssItems({ lang: "en", now })).rejects.toMatchObject({ code: "unavailable" });
  });
  it("feed amplo filtrado por categoria (investingLive: forex só com moedas no título)", () => {
    const fx = RSS_SOURCES.find((s) => s.source === "investingLive" && s.cat === "forex")!;
    expect(fx.match!.test("USD/JPY rises to 158")).toBe(true); expect(fx.match!.test("Nvidia earnings beat")).toBe(false);
  });
  it("todas as fontes são https e cobrem as 4 categorias nos 2 idiomas", () => {
    expect(RSS_SOURCES.every((s) => s.url.startsWith("https://"))).toBe(true);
    for (const l of ["pt", "en"]) for (const c of ["crypto", "stocks", "economy", "forex"]) expect(RSS_SOURCES.some((s) => s.lang === l && s.cat === c), `${l}/${c}`).toBe(true);
  });
});

describe("escolha do provedor", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("sem chave → RSS; com NEWS_API_KEY → NewsAPI; NEWS_PROVIDER força", async () => {
    const { newsProvider } = await import("@/services/news");
    vi.stubEnv("NEWS_API_KEY", ""); vi.stubEnv("NEWS_PROVIDER", ""); expect(newsProvider()).toBe("rss");
    vi.stubEnv("NEWS_API_KEY", "k"); expect(newsProvider()).toBe("newsapi");
    vi.stubEnv("NEWS_PROVIDER", "rss"); expect(newsProvider()).toBe("rss");
  });
});
