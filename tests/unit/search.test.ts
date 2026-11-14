import { describe, it, expect } from "vitest";
import { normalizeQuery, matchMarkets, matchForex, rankAssets, runSearch, MIN_QUERY, type SearchAsset } from "@/services/search";
import { parseSearchCoins } from "@/services/market/coingecko";
import { ProviderError } from "@/services/types";

const A = (id: string, symbol: string, rank: number | null, category: SearchAsset["category"] = "crypto_spot"): SearchAsset => ({ id, symbol, name: id, category, categoryLabel: "x", href: `/mercado/${id}`, rank });
describe("normalizeQuery", () => {
  it("remove controles, colapsa espaços e limita o tamanho", () => { expect(normalizeQuery("  bit\u0000\tcoin \n")).toBe("bit coin"); expect(normalizeQuery("x".repeat(200))).toHaveLength(60); expect(normalizeQuery("   ")).toBe(""); });
});
describe("matchMarkets (categorias)", () => {
  it("encontra por nome, apelidos, sem acento e nos dois idiomas; marca categorias sem fonte como pendentes", () => {
    expect(matchMarkets("forex", "pt").map((m) => m.key)).toEqual(["forex"]);
    const acoes = matchMarkets("ações", "pt"); expect(acoes.map((m) => m.key)).toEqual(["stocks_br", "stocks_intl"]); expect(acoes.every((m) => m.pending)).toBe(true);
    expect(matchMarkets("etf", "en").map((m) => m.key)).toEqual(["funds"]); expect(matchMarkets("crypto", "en").map((m) => m.key)).toContain("crypto_spot");
    expect(matchMarkets("cripto", "pt")[0]).toMatchObject({ key: "crypto_spot", pending: false, href: "/mercado" }); expect(matchMarkets("forex", "en")[0].href).toBe("/mercado?cat=forex");
  });
  it("consulta curta ou sem correspondência não retorna nada", () => { expect(matchMarkets("a", "pt")).toEqual([]); expect(matchMarkets("zzzzz", "pt")).toEqual([]); });
});
describe("matchForex (catálogo)", () => {
  it("encontra por símbolo, moeda e nome, com link do detalhe", () => {
    expect(matchForex("usd/brl", "pt")[0]).toMatchObject({ id: "usd-brl", symbol: "USD/BRL", href: "/mercado/usd-brl", category: "forex" });
    expect(matchForex("real", "pt").map((a) => a.id)).toContain("usd-brl"); expect(matchForex("eur", "en").map((a) => a.id)).toContain("usd-eur"); expect(matchForex("zzzz", "pt")).toEqual([]);
  });
});
describe("rankAssets", () => {
  it("símbolo exato primeiro; depois ranking de mercado; depois forex; limitado a 10", () => {
    const crypto = [A("c", "CCC", 50), A("b", "BTC", 1), A("z", "ZZZ", null), A("a", "AAA", 5)];
    expect(rankAssets("btc", crypto, []).map((x) => x.id)).toEqual(["b", "a", "c", "z"]);
    expect(rankAssets("usd/brl", [], [A("usd-brl", "USD/BRL", null, "forex")]).map((x) => x.id)).toEqual(["usd-brl"]);
    expect(rankAssets("x", Array.from({ length: 12 }, (_, i) => A(`c${i}`, `C${i}`, i + 1)), [A("usd-brl", "USD/BRL", null, "forex")])).toHaveLength(10);
  });
});
describe("parseSearchCoins", () => {
  it("normaliza, descarta malformados e respeita o limite", () => {
    const r = parseSearchCoins({ coins: [{ id: "bitcoin", name: "Bitcoin", symbol: "btc", market_cap_rank: 1 }, { id: 1 }, { id: "x", name: "X", symbol: "x" }] });
    expect(r).toEqual([{ id: "bitcoin", name: "Bitcoin", symbol: "BTC", rank: 1 }, { id: "x", name: "X", symbol: "X", rank: null }]);
    expect(parseSearchCoins({ coins: Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, name: "n", symbol: "s" })) }, 5)).toHaveLength(5);
    expect(() => parseSearchCoins({ x: 1 })).toThrow(ProviderError);
  });
});
describe("runSearch (provedores injetados)", () => {
  const ok = async () => [{ id: "bitcoin", name: "Bitcoin", symbol: "BTC", rank: 1 }, { id: "bitcoin-cash", name: "Bitcoin Cash", symbol: "BCH", rank: 20 }, { id: "BAD ID", name: "x", symbol: "X", rank: 2 }];
  it("combina cripto, forex e mercados; ids inválidos são descartados", async () => {
    const r = await runSearch("bit", "pt", { crypto: ok }); expect(r.assets.map((a) => a.id)).toEqual(["bitcoin", "bitcoin-cash"]); expect(r.errors).toEqual([]); expect(r.assets[0].categoryLabel).toBe("Criptomoedas (spot)");
  });
  it("falha do provedor de cripto é registrada, mas forex e mercados continuam", async () => {
    const r = await runSearch("real", "pt", { crypto: async () => { throw new ProviderError("rate_limited"); } });
    expect(r.errors).toEqual([{ source: "crypto", code: "rate_limited" }]); expect(r.assets.map((a) => a.id)).toContain("usd-brl");
    const r2 = await runSearch("forex", "pt", { crypto: async () => { throw new Error("boom"); } }); expect(r2.errors[0].code).toBe("unavailable"); expect(r2.markets.map((m) => m.key)).toEqual(["forex"]);
  });
  it("consulta curta/vazia não chama o provedor", async () => {
    let calls = 0; const dep = { crypto: async () => { calls++; return []; } };
    for (const q of ["", " ", "a", "\u0000\u0000"]) expect((await runSearch(q, "pt", dep)).assets).toEqual([]); expect(calls).toBe(0); expect(MIN_QUERY).toBe(2);
  });
  it("só retorna ativos e mercados (nenhum campo de notícias/conteúdos)", async () => { const r = await runSearch("bit", "en", { crypto: ok }); expect(Object.keys(r).sort()).toEqual(["assets", "errors", "markets", "q"]); });
});
