import { z } from "zod";

/** Calls VIP: tipos, validação (espelha as restrições do banco) e estatísticas com critérios transparentes. */
export const CALL_MARKETS = ["crypto_spot", "crypto_futures", "forex", "stocks_br", "stocks_intl"] as const;
export type CallMarket = (typeof CALL_MARKETS)[number];
export type CallStatus = "draft" | "active" | "closed" | "canceled";
export interface VipCall {
  id: string; market: CallMarket; symbol: string; direction: "long" | "short"; entry: number; stop: number; tp1: number; tp2: number | null; tp3: number | null; tp4: number | null;
  leverage: number | null; notes: string | null; analyst: string | null; status: CallStatus; targets_hit: number; stop_hit: boolean; exit_price: number | null; close_reason: "stop" | "targets" | "manual" | null;
  fees_pct: number | null; gross_result_pct: number | null; net_result_pct: number | null; created_at: string; published_at: string | null; closed_at: string | null; updated_at: string;
}
export interface CallEvent { id: number; type: "created" | "published" | "edited" | "tp_hit" | "stop_hit" | "closed" | "canceled" | "note"; tp_index: number | null; price: number | null; note: string | null; created_at: string }
export const CALL_COLS = "id,market,symbol,direction,entry,stop,tp1,tp2,tp3,tp4,leverage,notes,analyst,status,targets_hit,stop_hit,exit_price,close_reason,fees_pct,gross_result_pct,net_result_pct,created_at,published_at,closed_at,updated_at";
const NUMS = ["entry", "stop", "tp1", "tp2", "tp3", "tp4", "leverage", "exit_price", "fees_pct", "gross_result_pct", "net_result_pct"] as const;
/** PostgREST devolve `numeric` como número ou texto conforme a configuração; normaliza para number. */
export function normalizeCall(r: Record<string, unknown>): VipCall {
  const o = { ...r } as Record<string, unknown>; for (const k of NUMS) o[k] = o[k] === null || o[k] === undefined ? null : Number(o[k]);
  return o as unknown as VipCall;
}
export const targets = (c: Pick<VipCall, "tp1" | "tp2" | "tp3" | "tp4">) => [c.tp1, c.tp2, c.tp3, c.tp4].filter((x): x is number => x !== null && x !== undefined);
/** Distância percentual da entrada até um nível (no sentido da operação, sem alavancagem). */
export const movePct = (c: Pick<VipCall, "direction" | "entry">, lvl: number) => ((c.direction === "long" ? 1 : -1) * (lvl - c.entry)) / c.entry * 100;
/** Relação risco/retorno até cada alvo: |alvo − entrada| / |entrada − stop|. */
export const rr = (c: Pick<VipCall, "entry" | "stop" | "tp1" | "tp2" | "tp3" | "tp4">) => targets(c).map((t) => Math.abs(t - c.entry) / Math.abs(c.entry - c.stop));

const num = z.coerce.number().positive().finite();
const optNum = z.union([z.literal(""), z.null(), num]).optional().transform((v) => (v === "" || v === undefined || v === null ? null : v));
export const CallInput = z.object({
  market: z.enum(CALL_MARKETS), symbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,12}(\/[A-Z0-9]{1,12})?$/, "symbol"),
  direction: z.enum(["long", "short"]), entry: num, stop: num, tp1: num, tp2: optNum, tp3: optNum, tp4: optNum,
  leverage: z.union([z.literal(""), z.null(), z.coerce.number().min(1).max(125)]).optional().transform((v) => (v === "" || v === undefined || v === null ? null : v)),
  notes: z.string().trim().max(2000).optional().default(""), analyst: z.string().trim().max(120).optional().default(""), edit_note: z.string().trim().max(1000).optional(),
}).strict().superRefine((c, ctx) => {
  const up = c.direction === "long"; const t = [c.tp1, c.tp2, c.tp3, c.tp4];
  const gt = (a: number, b: number) => (up ? a > b : a < b);
  if (!gt(c.entry, c.stop)) ctx.addIssue({ code: "custom", path: ["stop"], message: up ? "stop_below_entry" : "stop_above_entry" });
  if (!gt(c.tp1, c.entry)) ctx.addIssue({ code: "custom", path: ["tp1"], message: "tp_beyond_entry" });
  for (let i = 1; i < 4; i++) { if (t[i] === null) continue; if (t[i - 1] === null) ctx.addIssue({ code: "custom", path: [`tp${i + 1}`], message: "tp_sequence" }); else if (!gt(t[i]!, t[i - 1]!)) ctx.addIssue({ code: "custom", path: [`tp${i + 1}`], message: "tp_order" }); }
  if (c.leverage !== null && !["crypto_futures", "forex"].includes(c.market)) ctx.addIssue({ code: "custom", path: ["leverage"], message: "leverage_market" });
});
export type CallInputT = z.infer<typeof CallInput>;

/** Estatísticas: só calls ENCERRADAS com preço de saída registrado entram em resultado. Canceladas ficam fora (e são contadas à parte).
 *  Positiva = resultado bruto > 0; negativa = < 0; zero = neutra. Resultado médio/somado é sobre a margem (inclui alavancagem). */
export interface CallStats { total: number; active: number; closed: number; canceled: number; positive: number; negative: number; neutral: number; targetsHit: number; stopsHit: number;
  hitRatePct: number | null; avgGrossPct: number | null; sumGrossPct: number | null; avgNetPct: number | null; netCount: number; byMonth: { month: string; closed: number; positive: number; sumGrossPct: number }[] }
export function callStats(calls: VipCall[]): CallStats {
  const pub = calls.filter((c) => c.status !== "draft"); const closed = pub.filter((c) => c.status === "closed" && c.gross_result_pct !== null);
  const pos = closed.filter((c) => c.gross_result_pct! > 0).length, neg = closed.filter((c) => c.gross_result_pct! < 0).length;
  const sum = closed.reduce((a, c) => a + c.gross_result_pct!, 0); const nets = closed.filter((c) => c.net_result_pct !== null);
  const months = new Map<string, { closed: number; positive: number; sumGrossPct: number }>();
  for (const c of closed) { const k = (c.closed_at ?? c.updated_at).slice(0, 7); const m = months.get(k) ?? { closed: 0, positive: 0, sumGrossPct: 0 }; m.closed++; if (c.gross_result_pct! > 0) m.positive++; m.sumGrossPct += c.gross_result_pct!; months.set(k, m); }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { total: pub.length, active: pub.filter((c) => c.status === "active").length, closed: closed.length, canceled: pub.filter((c) => c.status === "canceled").length,
    positive: pos, negative: neg, neutral: closed.length - pos - neg, targetsHit: pub.reduce((a, c) => a + c.targets_hit, 0), stopsHit: pub.filter((c) => c.stop_hit).length,
    hitRatePct: closed.length ? r2((pos / closed.length) * 100) : null, avgGrossPct: closed.length ? r2(sum / closed.length) : null, sumGrossPct: closed.length ? r2(sum) : null,
    avgNetPct: nets.length ? r2(nets.reduce((a, c) => a + c.net_result_pct!, 0) / nets.length) : null, netCount: nets.length,
    byMonth: [...months.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, v]) => ({ month, ...v, sumGrossPct: r2(v.sumGrossPct) })) };
}
export const CallFilters = z.object({
  tab: z.enum(["ativas", "historico", "resultados"]).catch("ativas"),
  symbol: z.string().trim().toUpperCase().max(25).regex(/^[A-Z0-9/]*$/).catch(""),
  market: z.enum(["", ...CALL_MARKETS]).catch(""),
  period: z.enum(["", "30", "90", "365"]).catch(""),
});
export type CallFiltersT = z.infer<typeof CallFilters>;
