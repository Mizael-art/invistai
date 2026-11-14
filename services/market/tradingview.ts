import type { Asset } from "./types";

/** Mapeamento CURADO (por id do CoinGecko, à prova de colisão de símbolos) → símbolo do TradingView.
 *  Ativos fora da lista NÃO recebem gráfico (nunca mostramos outro ativo no lugar). Conferir contra o serviço real. */
const CRYPTO: Record<string, string> = {
  bitcoin: "BINANCE:BTCUSDT", ethereum: "BINANCE:ETHUSDT", solana: "BINANCE:SOLUSDT", binancecoin: "BINANCE:BNBUSDT", ripple: "BINANCE:XRPUSDT",
  cardano: "BINANCE:ADAUSDT", dogecoin: "BINANCE:DOGEUSDT", tron: "BINANCE:TRXUSDT", "avalanche-2": "BINANCE:AVAXUSDT", chainlink: "BINANCE:LINKUSDT",
  polkadot: "BINANCE:DOTUSDT", litecoin: "BINANCE:LTCUSDT", "bitcoin-cash": "BINANCE:BCHUSDT", cosmos: "BINANCE:ATOMUSDT", stellar: "BINANCE:XLMUSDT",
  near: "BINANCE:NEARUSDT", uniswap: "BINANCE:UNIUSDT", "ethereum-classic": "BINANCE:ETCUSDT",
};
export function tradingViewSymbol(a: Pick<Asset, "id" | "category" | "quote">): string | null {
  if (a.category === "crypto_spot") return CRYPTO[a.id] ?? null;
  if (a.category === "forex" && a.quote) return `FX_IDC:USD${a.quote}`;
  return null;
}

export const PERIODS = [
  { key: "1D", range: "1D", interval: "15" }, { key: "5D", range: "5D", interval: "60" }, { key: "1M", range: "1M", interval: "D" },
  { key: "6M", range: "6M", interval: "D" }, { key: "1A", range: "12M", interval: "W" }, { key: "ALL", range: "ALL", interval: "M" },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"];
export type ChartStyle = "candles" | "line";

export const TV_SCRIPT = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
/** Configuração do widget oficial "Advanced Chart" (embed). Períodos e tipo são reaplicados remontando o widget. */
export function buildTvConfig(o: { symbol: string; theme: "dark" | "light"; lang: "pt" | "en"; period: PeriodKey; style: ChartStyle }) {
  const p = PERIODS.find((x) => x.key === o.period) ?? PERIODS[2];
  return {
    autosize: true, symbol: o.symbol, interval: p.interval, range: p.range, timezone: "Etc/UTC", theme: o.theme,
    style: o.style === "candles" ? "1" : "2", locale: o.lang === "pt" ? "br" : "en", allow_symbol_change: false,
    hide_side_toolbar: true, hide_top_toolbar: false, save_image: false, calendar: false, withdateranges: false,
    backgroundColor: o.theme === "dark" ? "#08110c" : "#ffffff", support_host: "https://www.tradingview.com",
  };
}
