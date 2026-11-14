/** Motor de análise TRADEON — tipos comuns, independentes de classe de ativo e de fornecedor de dados. */
export type AssetClass = "crypto" | "forex" | "stock_br" | "stock_intl" | "fii" | "etf";
export const ASSET_CLASSES: AssetClass[] = ["crypto", "forex", "stock_br", "stock_intl", "fii", "etf"];
export type Timeframe = "15m" | "1h" | "4h" | "1d";
export const TIMEFRAMES: Timeframe[] = ["15m", "1h", "4h", "1d"];
export const TF_MS: Record<Timeframe, number> = { "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 };

/** Vela OHLCV. Fontes que só têm fechamento (ex.: taxas de referência diárias) repetem o close em O/H/L e marcam `closeOnly`. */
export interface Candle { t: number; o: number; h: number; l: number; c: number; v: number | null }
export interface CandleSeries { symbol: string; tf: Timeframe; candles: Candle[]; closeOnly: boolean; hasVolume: boolean; source: string; fetchedAt: string }

export interface Quote { symbol: string; assetClass: AssetClass; price: number; changePct24h: number | null; high24h: number | null; low24h: number | null; quoteVolume24h: number | null; currency: string; source: string; asOf: string }

export interface ResolvedSymbol { assetClass: AssetClass; symbol: string; display: string; currency: string }

export class EngineError extends Error { constructor(public code: "unsupported_asset_class" | "unknown_symbol" | "unavailable" | "rate_limited" | "invalid_response" | "insufficient_data", msg?: string) { super(msg ?? code); } }
