import { describe, it, expect } from "vitest";
import { favoriteInput } from "@/schemas/favorites";
import { parseFavoritesParams } from "@/schemas/favoritesPage";
import { toItems, counts, filterFavorites, paginate, type FavoriteRow } from "@/lib/favorites";

const news = { title: "Bitcoin sobe", source: "Fonte A", url: "https://ex.com/a", publishedAt: "2026-01-01T10:00:00Z", category: "crypto" };
describe("favoriteInput com metadados por tipo", () => {
  it("ativo aceita metadados de ativo; notícia aceita metadados de notícia", () => {
    expect(favoriteInput.parse({ itemType: "asset", itemId: "bitcoin", metadata: { symbol: "BTC", name: "Bitcoin" } })).toMatchObject({ metadata: { symbol: "BTC", name: "Bitcoin" } });
    expect(favoriteInput.parse({ itemType: "news", itemId: "abc", metadata: news })).toMatchObject({ metadata: { title: "Bitcoin sobe" } });
  });
  it("rejeita metadados do tipo errado, extras em ativo e valores perigosos", () => {
    for (const bad of [{ itemType: "asset", itemId: "x", metadata: news }, { itemType: "news", itemId: "x", metadata: { symbol: "BTC", name: "B" } },
      { itemType: "asset", itemId: "x", metadata: { symbol: "BTC", name: "B", extra: 1 } }, { itemType: "asset", itemId: "x", metadata: { symbol: "", name: "B" } },
      { itemType: "news", itemId: "x", metadata: { ...news, url: "javascript:alert(1)" } }, { itemType: "news", itemId: "x", metadata: { ...news, url: "http://ex.com" } }, { itemType: "asset", itemId: "x", metadata: { symbol: "B".repeat(40), name: "B" } }])
      expect(favoriteInput.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });
  it("metadados continuam opcionais e itemId é validado", () => { expect(favoriteInput.safeParse({ itemType: "asset", itemId: "bitcoin" }).success).toBe(true); for (const id of ["", "a b", "a'; drop", "x".repeat(130)]) expect(favoriteInput.safeParse({ itemType: "asset", itemId: id }).success).toBe(false); });
});
describe("toItems (tolerante a metadados ausentes/inválidos)", () => {
  const rows: FavoriteRow[] = [
    { type: "asset", id: "bitcoin", createdAt: "2026-01-03T00:00:00Z", metadata: { symbol: "BTC", name: "Bitcoin" } },
    { type: "asset", id: "legacy", createdAt: "2026-01-02T00:00:00Z", metadata: null },
    { type: "news", id: "n1", createdAt: "2026-01-02T00:00:00Z", metadata: news },
    { type: "news", id: "n2", createdAt: "2026-01-01T00:00:00Z", metadata: { title: "x" } },
  ];
  const items = toItems(rows);
  it("preenche quando válido e usa null quando não", () => {
    expect(items[0]).toMatchObject({ kind: "asset", symbol: "BTC", name: "Bitcoin" }); expect(items[1]).toMatchObject({ kind: "asset", symbol: null, name: null });
    expect(items[2]).toMatchObject({ kind: "news", title: "Bitcoin sobe", url: "https://ex.com/a" }); expect(items[3]).toMatchObject({ kind: "news", title: null, url: null });
  });
  it("conta por tipo", () => expect(counts(items)).toEqual({ all: 4, asset: 2, news: 2 }));
  it("filtra por tipo e busca (acento/caixa; símbolo/nome/id; título/fonte); itens sem metadados casam por id", () => {
    expect(filterFavorites(items, "asset", "").map((i) => i.id)).toEqual(["bitcoin", "legacy"]); expect(filterFavorites(items, "news", "").map((i) => i.id)).toEqual(["n1", "n2"]);
    expect(filterFavorites(items, "all", " BTC ").map((i) => i.id)).toEqual(["bitcoin"]); expect(filterFavorites(items, "all", "fonte a").map((i) => i.id)).toEqual(["n1"]); expect(filterFavorites(items, "all", "legacy").map((i) => i.id)).toEqual(["legacy"]); expect(filterFavorites(items, "news", "n2").map((i) => i.id)).toEqual(["n2"]);
    expect(filterFavorites(items, "news", "bitcoin")).toHaveLength(1); expect(filterFavorites(items, "all", "zzz")).toEqual([]); expect(filterFavorites(items, "all", "  ")).toHaveLength(4);
  });
});
describe("paginate", () => {
  const a = Array.from({ length: 45 }, (_, i) => i);
  it("divide em páginas sem repetir itens e limita a página pedida", () => {
    const p1 = paginate(a, 1, 20), p3 = paginate(a, 3, 20), p9 = paginate(a, 9, 20);
    expect(p1.items).toHaveLength(20); expect(p1.pages).toBe(3); expect(p3.items).toHaveLength(5); expect(p9.page).toBe(3); expect(new Set([...p1.items, ...paginate(a, 2, 20).items, ...p3.items]).size).toBe(45);
    expect(paginate([], 1, 20)).toEqual({ items: [], pages: 1, page: 1 });
  });
});
describe("parseFavoritesParams", () => {
  it("valida e usa padrões", () => {
    expect(parseFavoritesParams({ type: "x", q: " a  b ", page: "-2" })).toEqual({ type: "all", q: "a b", page: 1 });
    expect(parseFavoritesParams({ type: ["news", "x"], page: "3" })).toEqual({ type: "news", q: "", page: 3 }); expect(parseFavoritesParams({ page: "999" }).page).toBe(1); expect(parseFavoritesParams({ q: "x".repeat(200) }).q).toHaveLength(80);
  });
});
