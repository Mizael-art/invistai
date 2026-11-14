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

/** Tempos gráficos (estilo corretora): quatro principais visíveis + "Mais". `tv` = intervalo do TradingView. */
export const INTERVALS = [
  { key: "15m", tv: "15", main: true }, { key: "1h", tv: "60", main: true }, { key: "4h", tv: "240", main: true }, { key: "1D", tv: "D", main: true },
  { key: "1m", tv: "1", main: false }, { key: "5m", tv: "5", main: false }, { key: "30m", tv: "30", main: false }, { key: "2h", tv: "120", main: false },
  { key: "1W", tv: "W", main: false }, { key: "1M", tv: "M", main: false },
] as const;
export type IntervalKey = (typeof INTERVALS)[number]["key"];
export const DEFAULT_INTERVAL: IntervalKey = "15m";
export const isIntervalKey = (v: unknown): v is IntervalKey => INTERVALS.some((i) => i.key === v);
export type ChartStyle = "candles" | "line";
/** Médias móveis exponenciais exibidas por padrão (como nas corretoras): EMA 7, 14 e 28. */
export const EMA_LENGTHS = [7, 14, 28] as const;

export const TV_SCRIPT = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
/** Configuração do widget oficial "Advanced Chart" (embed). Tempo, tipo e indicadores são reaplicados remontando o widget.
 *  Barra superior do widget oculta: os controles ficam na interface do TRADEON. Horário no fuso de Brasília. */
export function buildTvConfig(o: { symbol: string; theme: "dark" | "light"; lang: "pt" | "en"; interval: IntervalKey; style: ChartStyle; indicators?: boolean; timezone?: string }) {
  const it = INTERVALS.find((x) => x.key === o.interval) ?? INTERVALS[0];
  const dark = o.theme === "dark";
  return {
    autosize: true, symbol: o.symbol, interval: it.tv, timezone: o.timezone ?? "America/Sao_Paulo", theme: o.theme,
    style: o.style === "candles" ? "1" : "2", locale: o.lang === "pt" ? "br" : "en", allow_symbol_change: false,
    hide_side_toolbar: true, hide_top_toolbar: true, hide_legend: false, hide_volume: false, save_image: false, calendar: false, withdateranges: false,
    backgroundColor: dark ? "#0E1713" : "#FFFFFF", gridColor: dark ? "rgba(244, 246, 244, 0.05)" : "rgba(8, 13, 11, 0.06)",
    studies: o.indicators === false ? [] : EMA_LENGTHS.map((length) => ({ id: "MAExp@tv-basicstudies", inputs: { length } })),
    support_host: "https://www.tradingview.com",
  };
}
