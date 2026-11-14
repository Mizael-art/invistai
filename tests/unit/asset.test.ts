import { describe, it, expect } from "vitest";
import { stripHtml, normalizeCoinDetail } from "@/services/market/coingecko";
import { tradingViewSymbol, buildTvConfig, INTERVALS, isIntervalKey } from "@/services/market/tradingview";
import { isValidAssetId } from "@/services/market/detail";
import { computeInsights } from "@/features/asset/insights";
import { compactMoney } from "@/lib/format";
import { ProviderError } from "@/services/types";

describe("stripHtml / normalizeCoinDetail", () => {
  it("tags inline não deixam espaço antes da pontuação", () => expect(stripHtml("<p>Um <b>ativo</b>. Outro <a href='x'>link</a>, fim.</p><p>Novo</p>")).toBe("Um ativo. Outro link, fim. Novo"));
  it("remove tags e entidades", () => expect(stripHtml("<p>A &amp; B <a href='x'>link</a>&nbsp;ok</p>")).toBe("A & B link ok"));
  it("trunca em fim de frase quando possível", () => {
    const t = stripHtml("Primeira frase longa. ".repeat(40), 100); expect(t.length).toBeLessThanOrEqual(100); expect(t.endsWith(".")).toBe(true);
  });
  it("trunca com reticências sem frase", () => expect(stripHtml("palavra ".repeat(200), 50).endsWith("…")).toBe(true));
  it("normaliza campos presentes e deixa ausentes como null", () => {
    const c = normalizeCoinDetail({ id: "x", description: { en: "<p>Texto</p>" }, categories: ["A", null], market_data: { market_cap: { usd: 10 }, circulating_supply: 5 } });
    expect(c).toMatchObject({ description: "Texto", categories: ["A"], marketCap: 10, circulating: 5, volume24h: null, ath: null });
  });
  it("prefere descrição pt e tolera ausência de market_data", () => {
    expect(normalizeCoinDetail({ id: "x", description: { pt: "Olá", en: "Hi" } }).description).toBe("Olá");
    expect(normalizeCoinDetail({ id: "x" })).toMatchObject({ description: null, marketCap: null });
  });
  it("lança invalid_response sem id", () => expect(() => normalizeCoinDetail({ foo: 1 })).toThrow(ProviderError));
});
describe("TradingView", () => {
  it("mapeia por id do CoinGecko e nunca por símbolo (sem colisão)", () => {
    expect(tradingViewSymbol({ id: "bitcoin", category: "crypto_spot" })).toBe("BINANCE:BTCUSDT");
    expect(tradingViewSymbol({ id: "bitcoin-fake-clone", category: "crypto_spot" })).toBeNull();
    expect(tradingViewSymbol({ id: "unknown-coin", category: "crypto_spot" })).toBeNull();
  });
  it("forex usa FX_IDC:USDxxx; categorias sem suporte retornam null", () => {
    expect(tradingViewSymbol({ id: "usd-brl", category: "forex", quote: "BRL" })).toBe("FX_IDC:USDBRL");
    expect(tradingViewSymbol({ id: "petr4", category: "stocks_br" })).toBeNull();
  });
  it("buildTvConfig: tempo, tipo, tema, idioma, fuso de Brasília e barra do widget oculta", () => {
    expect(buildTvConfig({ symbol: "S", theme: "dark", lang: "pt", interval: "4h", style: "line" })).toMatchObject({ symbol: "S", interval: "240", style: "2", theme: "dark", locale: "br", timezone: "America/Sao_Paulo", hide_top_toolbar: true, hide_volume: false });
    expect(buildTvConfig({ symbol: "S", theme: "light", lang: "en", interval: "1W", style: "candles" })).toMatchObject({ interval: "W", style: "1", theme: "light", locale: "en" });
    expect(buildTvConfig({ symbol: "S", theme: "dark", lang: "pt", interval: "15m", style: "candles" })).not.toHaveProperty("range");
  });
  it("indicadores: EMA 7/14/28 por padrão; desligáveis", () => {
    expect(buildTvConfig({ symbol: "S", theme: "dark", lang: "pt", interval: "1h", style: "candles" }).studies.map((x) => x.inputs.length)).toEqual([7, 14, 28]);
    expect(buildTvConfig({ symbol: "S", theme: "dark", lang: "pt", interval: "1h", style: "candles", indicators: false }).studies).toEqual([]);
  });
  it("tempos: 15m, 1h, 4h, 1D visíveis; demais em 'Mais'; chaves únicas e validação", () => {
    expect(INTERVALS.filter((i) => i.main).map((i) => i.key)).toEqual(["15m", "1h", "4h", "1D"]);
    expect(INTERVALS.filter((i) => !i.main).map((i) => i.key)).toEqual(["1m", "5m", "30m", "2h", "1W", "1M"]);
    expect(new Set(INTERVALS.map((i) => i.key)).size).toBe(INTERVALS.length);
    expect(isIntervalKey("4h")).toBe(true); expect(isIntervalKey("3h")).toBe(false); expect(isIntervalKey(null)).toBe(false);
  });
});
describe("isValidAssetId", () => {
  it("aceita ids do CoinGecko e pares forex", () => { for (const id of ["bitcoin", "avalanche-2", "usd-brl", "coin-9"]) expect(isValidAssetId(id)).toBe(true); });
  it("rejeita maiúsculas, caminhos, símbolos e tamanho excessivo", () => { for (const id of ["BTC", "../etc", "a/b", "a b", "", "x".repeat(90), "usd-brl'", "-bitcoin"]) expect(isValidAssetId(id)).toBe(false); });
});
describe("computeInsights", () => {
  const up = Array.from({ length: 30 }, (_, i) => 100 + i), down = [...up].reverse();
  it("alta, queda e mista", () => {
    expect(computeInsights(up, 24)).toMatchObject({ trend: "up", aboveAverage: true }); expect(computeInsights(down, 24)).toMatchObject({ trend: "down", aboveAverage: false });
    expect(computeInsights([100, 130, 90, 101, 99, 100], 5)!.trend).toBe("mixed");
  });
  it("calcula variação, posição na faixa e oscilação", () => {
    const i = computeInsights(up, 24)!; expect(i.changePeriodPct).toBeCloseTo(29, 5); expect(i.positionInRangePct).toBe(100); expect(i.volatilityPct).toBeGreaterThan(0);
  });
  it("retorna null com dados insuficientes e trata série constante", () => {
    expect(computeInsights([1, 2, 3], 24)).toBeNull();
    const flat = computeInsights(Array(30).fill(10), 24)!; expect(flat.volatilityPct).toBe(0); expect(flat.positionInRangePct).toBe(50);
  });
  it("ignora valores não finitos", () => expect(computeInsights([NaN, ...up], 24)!.points).toBe(30));
});
describe("compactMoney", () => { it("abrevia grandes valores", () => expect(compactMoney(1.2e12, "en")).toBe("$1.20T")); });
