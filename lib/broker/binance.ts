import { createHmac } from "node:crypto";
import { BrokerError, iso, num, type AccountSnapshot, type Balance, type ClosedPnl, type Creds, type OpenOrder, type Permissions, type Position, type Trade } from "./types";

/** Binance: spot (api) e futuros USDT-M (fapi), somente leitura. Assinatura HMAC-SHA256 da query com timestamp. */
const spotBase = () => (process.env.BINANCE_BASE_URL || "https://api.binance.com").replace(/\/$/, "");
const futBase = () => (process.env.BINANCE_FAPI_BASE_URL || "https://fapi.binance.com").replace(/\/$/, "");
async function get(c: Creds, baseUrl: string, path: string, params: Record<string, string> = {}, signed = true): Promise<unknown> {
  const q = new URLSearchParams({ ...params, ...(signed ? { recvWindow: "10000", timestamp: String(Date.now()) } : {}) });
  if (signed) q.set("signature", createHmac("sha256", c.apiSecret).update(q.toString()).digest("hex"));
  let res: Response;
  try { res = await fetch(`${baseUrl}${path}?${q}`, { headers: signed ? { "X-MBX-APIKEY": c.apiKey } : {}, cache: "no-store", signal: AbortSignal.timeout(10_000) }); }
  catch { throw new BrokerError("unavailable"); }
  const j = (await res.json().catch(() => null)) as { code?: number; msg?: string } | unknown[] | null;
  if (res.ok && j !== null) return j;
  const code = j && !Array.isArray(j) ? (j as { code?: number }).code : undefined;
  if (res.status === 429 || res.status === 418) throw new BrokerError("rate_limited");
  if (code === -2015 || code === -2014 || code === -1022 || code === -2008) throw new BrokerError(code === -2015 ? "permission_denied" : "invalid_key");   // -2015: chave/IP/permissão
  if (res.status === 451 || res.status === 403) throw new BrokerError("ip_not_allowed");
  throw new BrokerError("unavailable", `binance_${code ?? res.status}`);
}
export async function binancePermissions(c: Creds): Promise<Permissions> {
  const r = (await get(c, spotBase(), "/sapi/v1/account/apiRestrictions")) as Record<string, unknown>;
  return { read: r.enableReading !== false, spotTrade: r.enableSpotAndMarginTrading === true, futuresTrade: r.enableFutures === true, withdraw: r.enableWithdrawals === true,
    ipRestricted: r.ipRestrict === true, expiresAt: num(r.tradingAuthorityExpirationTime) ? iso(r.tradingAuthorityExpirationTime) : null };
}
export async function binanceSnapshot(c: Creds, perms: Permissions): Promise<AccountSnapshot> {
  const errors: AccountSnapshot["errors"] = []; const take = async <T>(section: string, f: () => Promise<T>, fb: T): Promise<T> => { try { return await f(); } catch (e) { errors.push({ section, code: e instanceof BrokerError ? e.code : "unavailable" }); return fb; } };
  const since = String(Date.now() - 7 * 86_400_000);
  const [spot, prices, fAcct, fPos, fOrders, income] = await Promise.all([
    take("balances", async () => (await get(c, spotBase(), "/api/v3/account", { omitZeroBalances: "true" })) as Record<string, unknown>, null as Record<string, unknown> | null),
    take("prices", async () => (await get(c, spotBase(), "/api/v3/ticker/price", {}, false)) as { symbol: string; price: string }[], [] as { symbol: string; price: string }[]),
    take("futures", async () => (await get(c, futBase(), "/fapi/v2/account")) as Record<string, unknown>, null as Record<string, unknown> | null),
    take("positions", async () => (await get(c, futBase(), "/fapi/v2/positionRisk")) as Record<string, unknown>[], [] as Record<string, unknown>[]),
    take("orders", async () => (await get(c, futBase(), "/fapi/v1/openOrders")) as Record<string, unknown>[], [] as Record<string, unknown>[]),
    take("closed_pnl", async () => (await get(c, futBase(), "/fapi/v1/income", { incomeType: "REALIZED_PNL", startTime: since, limit: "200" })) as Record<string, unknown>[], [] as Record<string, unknown>[]),
  ]);
  const px = new Map(prices.map((p) => [p.symbol, Number(p.price)]));
  const usd = (asset: string, qty: number) => (["USDT", "USDC", "FDUSD", "BUSD", "USD"].includes(asset) ? qty : px.get(`${asset}USDT`) ? qty * px.get(`${asset}USDT`)! : null);
  const balances: Balance[] = [];
  for (const b of (spot?.balances as Record<string, unknown>[] | undefined) ?? []) { const free = num(b.free) ?? 0, locked = num(b.locked) ?? 0; if (free + locked > 0) balances.push({ asset: String(b.asset), total: free + locked, free, usdValue: usd(String(b.asset), free + locked), account: "Spot" }); }
  for (const a of (fAcct?.assets as Record<string, unknown>[] | undefined) ?? []) { const w = num(a.walletBalance) ?? 0; if (w !== 0) balances.push({ asset: String(a.asset), total: w, free: num(a.availableBalance) ?? 0, usdValue: usd(String(a.asset), w), account: "Futuros USDT-M" }); }
  balances.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
  const pos: Position[] = fPos.filter((p) => (num(p.positionAmt) ?? 0) !== 0).map((p) => {
    const amt = num(p.positionAmt) ?? 0, entry = num(p.entryPrice) ?? 0, pnl = num(p.unRealizedProfit), lev = num(p.leverage); const size = Math.abs(amt);
    const margin = entry && lev ? (entry * size) / lev : null;
    return { symbol: String(p.symbol), side: amt < 0 ? "short" : "long", size, entry, mark: num(p.markPrice), pnl, pnlPct: pnl !== null && margin ? (pnl / margin) * 100 : null, leverage: lev, liq: num(p.liquidationPrice) || null, tp: null, sl: null, value: num(p.notional) !== null ? Math.abs(num(p.notional)!) : null, market: "Futuros USDT-M" };
  });
  const ord: OpenOrder[] = fOrders.map((o) => ({ id: String(o.orderId), symbol: String(o.symbol), side: o.side === "SELL" ? "sell" : "buy", type: String(o.type ?? ""), price: num(o.price) || num(o.stopPrice), qty: num(o.origQty) ?? 0, filled: num(o.executedQty) ?? 0, reduceOnly: o.reduceOnly === true, createdAt: iso(o.time), market: "Futuros USDT-M" }));
  // Histórico de execuções de futuros dos símbolos com P&L/posição recente (a API exige o símbolo).
  const symbols = [...new Set([...income.map((x) => String(x.symbol)), ...pos.map((p) => p.symbol)])].filter(Boolean).slice(0, 6);
  const trades: Trade[] = (await Promise.all(symbols.map((s) => take("trades", async () => (await get(c, futBase(), "/fapi/v1/userTrades", { symbol: s, limit: "20" })) as Record<string, unknown>[], [] as Record<string, unknown>[]))))
    .flat().map((t) => ({ id: String(t.id), symbol: String(t.symbol), side: t.side === "SELL" ? "sell" : "buy", price: num(t.price) ?? 0, qty: num(t.qty) ?? 0, fee: num(t.commission), feeAsset: typeof t.commissionAsset === "string" ? t.commissionAsset : null, time: iso(t.time), market: "Futuros USDT-M" }));
  const cp: ClosedPnl[] = income.map((x) => ({ symbol: String(x.symbol), side: "long", qty: 0, entry: null, exit: null, pnl: num(x.income) ?? 0, time: iso(x.time), market: "Futuros USDT-M" }));
  const fEquity = fAcct ? num(fAcct.totalMarginBalance) : null; const spotUsd = balances.filter((b) => b.account === "Spot").reduce((a, b) => a + (b.usdValue ?? 0), 0);
  return { exchange: "binance", fetchedAt: new Date().toISOString(), permissions: perms,
    equityUsd: spot || fAcct ? spotUsd + (fEquity ?? 0) : null, availableUsd: fAcct ? num(fAcct.availableBalance) : null,
    unrealizedPnlUsd: fAcct ? num(fAcct.totalUnrealizedProfit) : null, realizedPnl7dUsd: errors.some((e) => e.section === "closed_pnl") ? null : cp.reduce((a, x) => a + x.pnl, 0),
    balances, positions: pos, openOrders: ord, trades: trades.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 60), closedPnl: cp.sort((a, b) => b.time.localeCompare(a.time)), errors: errors.filter((e) => e.section !== "prices") };
}
