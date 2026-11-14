import { describe, it, expect } from "vitest";
import { normalizeMarkets } from "@/services/market/coingecko";
import { ProviderError } from "@/services/types";

describe("normalizeMarkets", () => {
  it("normaliza campos e identifica a fonte", () => {
    const [a] = normalizeMarkets([{ id: "bitcoin", symbol: "btc", name: "Bitcoin", current_price: 100, price_change_percentage_24h: 1.5, last_updated: "2026-01-01T00:00:00Z", sparkline_in_7d: { price: [1, 2, null, 3] } }]);
    expect(a).toMatchObject({ id: "bitcoin", symbol: "BTC", price: 100, changePct24h: 1.5, currency: "USD", source: "CoinGecko" });
    expect(a.sparkline).toEqual([1, 2, 3]);
  });
  it("descarta ativos sem preço (nunca vira zero)", () => {
    expect(normalizeMarkets([{ id: "x", symbol: "x", name: "X", current_price: null }])).toEqual([]);
  });
  it("mantém variação nula como null", () => {
    expect(normalizeMarkets([{ id: "x", symbol: "x", name: "X", current_price: 1 }])[0].changePct24h).toBeNull();
  });
  it("lança invalid_response quando não é lista", () => {
    expect(() => normalizeMarkets({ a: 1 })).toThrow(ProviderError);
  });
});
