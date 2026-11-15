/** Modelo normalizado de conta de corretora (independente do provedor). Valores em USD quando a corretora informa. */
export type Exchange = "bybit" | "binance";
export const EXCHANGES: { id: Exchange; name: string; docs: string }[] = [
  { id: "bybit", name: "Bybit", docs: "https://www.bybit.com/app/user/api-management" },
  { id: "binance", name: "Binance", docs: "https://www.binance.com/pt-BR/my/settings/api-management" },
];
export interface Permissions { read: boolean; spotTrade: boolean; futuresTrade: boolean; withdraw: boolean; ipRestricted: boolean; expiresAt: string | null }
export interface Balance { asset: string; total: number; free: number; usdValue: number | null; account: string }
export interface Position { symbol: string; side: "long" | "short"; size: number; entry: number; mark: number | null; pnl: number | null; pnlPct: number | null; leverage: number | null; liq: number | null; tp: number | null; sl: number | null; value: number | null; market: string }
export interface OpenOrder { id: string; symbol: string; side: "buy" | "sell"; type: string; price: number | null; qty: number; filled: number; reduceOnly: boolean; createdAt: string; market: string }
export interface Trade { id: string; symbol: string; side: "buy" | "sell"; price: number; qty: number; fee: number | null; feeAsset: string | null; time: string; market: string }
export interface ClosedPnl { symbol: string; side: "long" | "short"; qty: number; entry: number | null; exit: number | null; pnl: number; time: string; market: string }
export interface AccountSnapshot {
  exchange: Exchange; fetchedAt: string; permissions: Permissions;
  equityUsd: number | null; availableUsd: number | null; unrealizedPnlUsd: number | null; realizedPnl7dUsd: number | null;
  balances: Balance[]; positions: Position[]; openOrders: OpenOrder[]; trades: Trade[]; closedPnl: ClosedPnl[];
  errors: { section: string; code: string }[];
}
export class BrokerError extends Error {
  constructor(public code: "invalid_key" | "permission_denied" | "ip_not_allowed" | "rate_limited" | "unavailable" | "invalid_response" | "withdraw_enabled" | "read_disabled", msg?: string) { super(msg ?? code); }
}
export interface Creds { apiKey: string; apiSecret: string }
export const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN; return Number.isFinite(n) ? n : null; };
export const iso = (ms: unknown): string => { const n = num(ms); return n ? new Date(n).toISOString() : new Date(0).toISOString(); };
