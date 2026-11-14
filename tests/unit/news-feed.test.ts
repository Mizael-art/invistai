import { describe, it, expect } from "vitest";
import { normalizeArticles } from "@/services/news/newsapi";
import { mergeFeeds, filterNews } from "@/services/news/feed";
import { parseNewsParams } from "@/schemas/news";
import { favoriteInput } from "@/schemas/favorites";
import { newsPrefsInput } from "@/schemas/preferences";
import type { NewsItem } from "@/services/news/types";

const N = (id: string, title: string, minsAgo: number, source = "Fonte"): NewsItem => ({ id, title, source, url: `https://ex.com/${id}`, publishedAt: new Date(Date.now() - minsAgo * 60e3).toISOString(), imageUrl: null });
describe("freshness (maxAgeMs)", () => {
  const now = Date.parse("2026-01-10T00:00:00Z");
  const art = (d: string, u: string) => ({ title: `T${u}`, url: `https://ex.com/${u}`, publishedAt: d, source: { name: "S" } });
  it("descarta notícias mais antigas que a janela", () => {
    const r = normalizeArticles({ articles: [art("2026-01-09T00:00:00Z", "a"), art("2025-12-01T00:00:00Z", "b")] }, { maxAgeMs: 7 * 86400e3, now });
    expect(r.map((x) => x.title)).toEqual(["Ta"]);
  });
  it("sem janela mantém comportamento anterior", () => { expect(normalizeArticles({ articles: [art("2020-01-01T00:00:00Z", "z")] })).toHaveLength(1); });
});
describe("mergeFeeds", () => {
  it("deduplica por id e por título (entre categorias), tagueia categoria e ordena pela data real", () => {
    const m = mergeFeeds([
      { category: "crypto", items: [N("1", "Alfa", 30), N("2", "Beta", 10)] },
      { category: "stocks", items: [N("1", "Alfa", 30), N("3", "BETA", 5), N("4", "Gama", 20)] },
    ]);
    expect(m.map((x) => x.title)).toEqual(["Beta", "Gama", "Alfa"]);
    expect(m.find((x) => x.id === "1")!.category).toBe("crypto");
  });
  it("não muta as listas de entrada", () => { const items = [N("1", "A", 5)]; mergeFeeds([{ category: "forex", items }]); expect(items[0].category).toBeUndefined(); });
});
describe("filterNews", () => {
  const items = [N("1", "Bitcoin sobe", 1, "Fonte A"), N("2", "Ações em alta", 2, "Valor Econômico")];
  it("busca em título e fonte sem acento/caixa", () => {
    expect(filterNews(items, " ACOES ").map((x) => x.id)).toEqual(["2"]); expect(filterNews(items, "economico").map((x) => x.id)).toEqual(["2"]);
    expect(filterNews(items, "zzz")).toEqual([]); expect(filterNews(items, "  ")).toHaveLength(2);
  });
});
describe("parseNewsParams", () => {
  it("valida e usa padrões", () => {
    expect(parseNewsParams({ cat: "xx", q: " a  b ", page: "-3" })).toEqual({ cat: "all", q: "a b", page: 1 });
    expect(parseNewsParams({ cat: ["forex", "x"], page: "4" })).toEqual({ cat: "forex", q: "", page: 4 });
    expect(parseNewsParams({ cat: "mine" }).cat).toBe("mine"); expect(parseNewsParams({ q: "x".repeat(300) }).q).toHaveLength(80); expect(parseNewsParams({ page: "999" }).page).toBe(1);
  });
});
describe("favoriteInput com metadados", () => {
  const meta = { title: "T", source: "S", url: "https://ex.com/a", publishedAt: "2026-01-01T10:00:00Z" };
  it("aceita notícia com metadados https", () => expect(favoriteInput.safeParse({ itemType: "news", itemId: "abc123", metadata: { ...meta, category: "crypto" } }).success).toBe(true));
  it("rejeita metadados em ativo, URL não-https, javascript:, título vazio ou longo e data inválida", () => {
    expect(favoriteInput.safeParse({ itemType: "asset", itemId: "bitcoin", metadata: meta }).success).toBe(false);
    for (const bad of [{ ...meta, url: "http://ex.com" }, { ...meta, url: "javascript:alert(1)" }, { ...meta, title: "" }, { ...meta, title: "x".repeat(400) }, { ...meta, publishedAt: "ontem" }, { ...meta, category: "x" }])
      expect(favoriteInput.safeParse({ itemType: "news", itemId: "abc", metadata: bad }).success).toBe(false);
  });
  it("metadados continuam opcionais", () => expect(favoriteInput.safeParse({ itemType: "news", itemId: "abc" }).success).toBe(true));
});
describe("newsPrefsInput", () => {
  it("aceita categorias válidas e remove duplicadas", () => expect(newsPrefsInput.parse({ newsCategories: ["crypto", "crypto", "forex"] }).newsCategories).toEqual(["crypto", "forex"]));
  it("rejeita categoria desconhecida e tipos errados", () => { expect(newsPrefsInput.safeParse({ newsCategories: ["bonds"] }).success).toBe(false); expect(newsPrefsInput.safeParse({ newsCategories: "crypto" }).success).toBe(false); });
});
