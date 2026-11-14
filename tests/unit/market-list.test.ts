import { describe, it, expect } from "vitest";
import { normalizeForex } from "@/services/market/forex";
import { applyFilterSort, matches, normalizeText } from "@/services/market/query";
import { parseMarketParams } from "@/schemas/market";
import { parseSearchIds } from "@/services/market/coingecko";
import { isStale } from "@/lib/freshness";
import { priceText } from "@/lib/format";
import { DAYS4, MIN15, type Asset } from "@/services/market/types";
import { ProviderError } from "@/services/types";

const A = (id: string, price: number, ch: number | null, name = id): Asset => ({ id, symbol: id.toUpperCase(), name, category: "crypto_spot", price, changePct24h: ch, currency: "USD", updatedAt: null, staleAfterMs: MIN15, sparkline: [], source: "t" });

describe("normalizeForex", () => {
  const json = { rates: { "2026-01-08": { BRL: 5.0, EUR: 0.9 }, "2026-01-09": { BRL: 5.5, EUR: 0.9 } } };
  it("usa o último dia, calcula variação vs. dia anterior e identifica a moeda", () => {
    const [brl, eur] = normalizeForex(json);
    expect(brl).toMatchObject({ id: "usd-brl", symbol: "USD/BRL", quote: "BRL", price: 5.5, category: "forex", source: "Frankfurter (BCE)", staleAfterMs: DAYS4 });
    expect(brl.changePct24h).toBeCloseTo(10, 5); expect(eur.changePct24h).toBeCloseTo(0, 5);
    expect(brl.sparkline).toEqual([5.0, 5.5]);
  });
  it("omite pares ausentes (não inventa) e lança em resposta inválida", () => {
    expect(normalizeForex(json).map((a) => a.id)).toEqual(["usd-brl", "usd-eur"]);
    expect(() => normalizeForex({ foo: 1 })).toThrow(ProviderError);
    expect(() => normalizeForex({ rates: {} })).toThrow(ProviderError);
  });
  it("variação fica null sem dia anterior", () => { expect(normalizeForex({ rates: { "2026-01-09": { BRL: 5 } } })[0].changePct24h).toBeNull(); });
  it("taxa diária de 2 dias não é desatualizada; de 6 dias é", () => {
    const now = Date.parse("2026-01-11T12:00:00Z");
    expect(isStale("2026-01-09T16:00:00+01:00", now, DAYS4)).toBe(false); expect(isStale("2026-01-05T16:00:00+01:00", now, DAYS4)).toBe(true);
  });
  it("priceText mostra a moeda cotada do forex e a moeda de referência dos demais", () => {
    expect(priceText({ price: 5.4321, currency: "BRL", quote: "BRL" }, "en")).toBe("5.4321 BRL"); expect(priceText({ price: 10, currency: "USD" }, "en")).toBe("$10.00");
  });
});
describe("applyFilterSort", () => {
  const items = [A("b", 10, 1, "Beta"), A("a", 30, -2, "Alfa"), A("c", 20, null, "Ômega"), A("d", 5, 3, "Delta")];
  it("filtra em alta / em baixa e exclui variação nula", () => {
    expect(applyFilterSort(items, "up", "rank", "desc").map((x) => x.id)).toEqual(["b", "d"]);
    expect(applyFilterSort(items, "down", "rank", "desc").map((x) => x.id)).toEqual(["a"]);
  });
  it("ordena por preço, nome e variação (nulos sempre por último)", () => {
    expect(applyFilterSort(items, "all", "price", "desc").map((x) => x.id)).toEqual(["a", "c", "b", "d"]);
    expect(applyFilterSort(items, "all", "name", "asc").map((x) => x.id)).toEqual(["a", "b", "d", "c"]);
    expect(applyFilterSort(items, "all", "change", "desc").map((x) => x.id)).toEqual(["d", "b", "a", "c"]);
    expect(applyFilterSort(items, "all", "change", "asc").map((x) => x.id)).toEqual(["a", "b", "d", "c"]);
  });
  it("rank preserva a ordem original e não muta a entrada", () => {
    const copy = [...items]; expect(applyFilterSort(items, "all", "rank", "desc")).toEqual(copy); applyFilterSort(items, "all", "price", "asc"); expect(items).toEqual(copy);
  });
});
describe("busca/params", () => {
  it("normaliza acentos, caixa e espaços", () => { expect(normalizeText("  ÔMEGA   Coin ")).toBe("omega coin"); expect(matches(A("x", 1, 1, "Ômega"), " omega ")).toBe(true); expect(matches(A("x", 1, 1), "")).toBe(true); });
  it("parseMarketParams cai no padrão para valores inválidos", () => {
    expect(parseMarketParams({ cat: "xxx", q: "  a   b ", sort: "drop", dir: "up", filter: "<script>", page: "-5" })).toEqual({ cat: "crypto_spot", q: "a b", sort: "rank", dir: "desc", filter: "all", page: 1 });
    expect(parseMarketParams({ cat: ["forex", "x"], page: "3", sort: "price", dir: "asc" })).toMatchObject({ cat: "forex", page: 3, sort: "price", dir: "asc" });
    expect(parseMarketParams({ q: "x".repeat(200) }).q).toHaveLength(60); expect(parseMarketParams({ q: "\u0000\u0007ab\n" }).q).toBe("ab"); expect(parseMarketParams({ page: "9999" }).page).toBe(1);
  });
  it("parseSearchIds limita a 20 e valida o formato", () => {
    expect(parseSearchIds({ coins: Array.from({ length: 30 }, (_, i) => ({ id: `c${i}` })) })).toHaveLength(20);
    expect(() => parseSearchIds({ x: 1 })).toThrow(ProviderError);
  });
});
