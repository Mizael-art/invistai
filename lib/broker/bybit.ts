import { createHmac } from "node:crypto";
import { BrokerError, iso, num, type AccountSnapshot, type Balance, type ClosedPnl, type Creds, type OpenOrder, type Permissions, type Position, type Trade } from "./types";

/** Bybit API v5 (somente leitura nesta etapa). Assinatura: HMAC-SHA256(timestamp + apiKey + recvWindow + query). */
const base = () => (process.env.BYBIT_BASE_URL || "https://api.bybit.com").replace(/\/$/, "");
const RECV = "10000";
async function get(c: Creds, path: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams(params).toString(); const ts = String(Date.now());
  const sign = createHmac("sha256", c.apiSecret).update(ts + c.apiKey + RECV + qs).digest("hex");
  let res: Response;
  try { res = await fetch(`${base()}${path}${qs ? `?${qs}` : ""}`, { headers: { "X-BAPI-API-KEY": c.apiKey, "X-BAPI-TIMESTAMP": ts, "X-BAPI-RECV-WINDOW": RECV, "X-BAPI-SIGN": sign }, cache: "no-store", signal: AbortSignal.timeout(10_000) }); }
  catch { throw new BrokerError("unavailable"); }
  if (res.status === 403) throw new BrokerError("ip_not_allowed");
  if (res.status === 429) throw new BrokerError("rate_limited");
  const j = (await res.json().catch(() => null)) as { retCode?: number; retMsg?: string; result?: Record<string, unknown> } | null;
  if (!j || typeof j.retCode !== "number") throw new BrokerError(res.ok ? "invalid_response" : "unavailable");
  if (j.retCode === 0) return j.result ?? {};
  if ([10003, 10004, 33004].includes(j.retCode)) throw new BrokerError("invalid_key");               // chave inválida / assinatura / expirada
  if (j.retCode === 10010) throw new BrokerError("ip_not_allowed");
  if (j.retCode === 10005) throw new BrokerError("permission_denied");
  if (j.retCode === 10006 || j.retCode === 10018) throw new BrokerError("rate_limited");
  throw new BrokerError("unavailable", `bybit_${j.retCode}`);
}
const list = (r: Record<string, unknown>) => (Array.isArray(r.list) ? (r.list as Record<string, unknown>[]) : []);

export async function bybitPermissions(c: Creds): Promise<Permissions> {
  const r = await get(c, "/v5/user/query-api");
  const p = (r.permissions ?? {}) as Record<string, string[]>; const has = (k: string) => Array.isArray(p[k]) && p[k].length > 0;
  const wallet = Array.isArray(p.Wallet) ? p.Wallet : [];
  const ips = Array.isArray(r.ips) ? (r.ips as string[]) : [];
  return { read: true, spotTrade: r.readOnly === 0 && has("Spot"), futuresTrade: r.readOnly === 0 && (has("ContractTrade") || has("Derivatives")),
    withdraw: wallet.some((w) => /withdraw/i.test(w)), ipRestricted: ips.length > 0 && !ips.includes("*"), expiresAt: typeof r.expiredAt === "string" && r.expiredAt ? r.expiredAt : null };
}

export async function bybitSnapshot(c: Creds, perms: Permissions): Promise<AccountSnapshot> {
  const errors: AccountSnapshot["errors"] = []; const take = async <T>(section: string, f: () => Promise<T>, fb: T): Promise<T> => { try { return await f(); } catch (e) { errors.push({ section, code: e instanceof BrokerError ? e.code : "unavailable" }); return fb; } };
  const since = String(Date.now() - 7 * 86_400_000);
  const [wallet, positions, orders, execLinear, execSpot, closed] = await Promise.all([
    take("balances", () => get(c, "/v5/account/wallet-balance", { accountType: "UNIFIED" }), null as Record<string, unknown> | null),
    take("positions", async () => list(await get(c, "/v5/position/list", { category: "linear", settleCoin: "USDT", limit: "200" })), []),
    take("orders", async () => list(await get(c, "/v5/order/realtime", { category: "linear", settleCoin: "USDT", limit: "50" })), []),
    take("trades", async () => list(await get(c, "/v5/execution/list", { category: "linear", limit: "50" })), []),
    take("trades", async () => list(await get(c, "/v5/execution/list", { category: "spot", limit: "50" })), []),
    take("closed_pnl", async () => list(await get(c, "/v5/position/closed-pnl", { category: "linear", startTime: since, limit: "100" })), []),
  ]);
  const acct = wallet ? list(wallet)[0] : undefined;
  const balances: Balance[] = acct && Array.isArray(acct.coin) ? (acct.coin as Record<string, unknown>[]).map((x) => ({ asset: String(x.coin), total: num(x.walletBalance) ?? 0, free: num(x.availableToWithdraw) ?? num(x.walletBalance) ?? 0, usdValue: num(x.usdValue), account: "Unificada" }))
    .filter((b) => b.total !== 0).sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0)) : [];
  const pos: Position[] = positions.filter((p) => (num(p.size) ?? 0) > 0).map((p) => {
    const entry = num(p.avgPrice) ?? 0, mark = num(p.markPrice), size = num(p.size) ?? 0, pnl = num(p.unrealisedPnl), lev = num(p.leverage);
    const margin = entry && size && lev ? (entry * size) / lev : null;
    return { symbol: String(p.symbol), side: p.side === "Sell" ? "short" : "long", size, entry, mark, pnl, pnlPct: pnl !== null && margin ? (pnl / margin) * 100 : null, leverage: lev, liq: num(p.liqPrice) || null, tp: num(p.takeProfit) || null, sl: num(p.stopLoss) || null, value: num(p.positionValue), market: "Futuros USDT" };
  });
  const ord: OpenOrder[] = orders.map((o) => ({ id: String(o.orderId), symbol: String(o.symbol), side: o.side === "Sell" ? "sell" : "buy", type: String(o.orderType ?? ""), price: num(o.price) || num(o.triggerPrice), qty: num(o.qty) ?? 0, filled: num(o.cumExecQty) ?? 0, reduceOnly: o.reduceOnly === true, createdAt: iso(o.createdTime), market: "Futuros USDT" }));
  const tr = (rows: Record<string, unknown>[], market: string): Trade[] => rows.map((t) => ({ id: String(t.execId), symbol: String(t.symbol), side: t.side === "Sell" ? "sell" : "buy", price: num(t.execPrice) ?? 0, qty: num(t.execQty) ?? 0, fee: num(t.execFee), feeAsset: typeof t.feeCurrency === "string" ? t.feeCurrency : null, time: iso(t.execTime), market }));
  const cp: ClosedPnl[] = closed.map((x) => ({ symbol: String(x.symbol), side: x.side === "Sell" ? "long" : "short", qty: num(x.closedSize) ?? num(x.qty) ?? 0, entry: num(x.avgEntryPrice), exit: num(x.avgExitPrice), pnl: num(x.closedPnl) ?? 0, time: iso(x.updatedTime ?? x.createdTime), market: "Futuros USDT" }));
  return { exchange: "bybit", fetchedAt: new Date().toISOString(), permissions: perms,
    equityUsd: acct ? num(acct.totalEquity) : null, availableUsd: acct ? num(acct.totalAvailableBalance) : null, unrealizedPnlUsd: acct ? num(acct.totalPerpUPL) : pos.reduce((a, p) => a + (p.pnl ?? 0), 0),
    realizedPnl7dUsd: errors.some((e) => e.section === "closed_pnl") ? null : cp.reduce((a, x) => a + x.pnl, 0),
    balances, positions: pos, openOrders: ord, trades: [...tr(execLinear, "Futuros USDT"), ...tr(execSpot, "Spot")].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 60), closedPnl: cp.sort((a, b) => b.time.localeCompare(a.time)), errors };
}
