import { describe, expect, it } from "vitest";
import { CallInput, CallFilters, callStats, movePct, normalizeCall, rr, type VipCall } from "@/lib/calls";

const base = { market: "crypto_futures", symbol: "btc/usdt", direction: "long", entry: "95000", stop: "93000", tp1: "96000", tp2: "97000", tp3: "98000", tp4: "100000", leverage: "10", notes: "", analyst: "" };
const call = (o: Partial<VipCall>): VipCall => ({ id: "x", market: "crypto_futures", symbol: "BTC/USDT", direction: "long", entry: 100, stop: 90, tp1: 110, tp2: null, tp3: null, tp4: null, leverage: null, notes: null, analyst: null,
  status: "closed", targets_hit: 0, stop_hit: false, exit_price: 110, close_reason: "targets", fees_pct: null, gross_result_pct: 10, net_result_pct: null, created_at: "2026-10-01T00:00:00Z", published_at: "2026-10-01T00:00:00Z", closed_at: "2026-10-05T00:00:00Z", updated_at: "2026-10-05T00:00:00Z", ...o });

describe("validação de calls (espelha o banco)", () => {
  it("LONG válida; símbolo normalizado; opcionais vazios viram null", () => {
    const p = CallInput.parse({ ...base, tp3: "", tp4: "" }); expect(p.symbol).toBe("BTC/USDT"); expect(p.tp3).toBeNull(); expect(p.leverage).toBe(10);
  });
  it("rejeita stop do lado errado, alvos fora de ordem/sequência e alavancagem no spot", () => {
    const issues = (o: object) => { const r = CallInput.safeParse({ ...base, ...o }); return r.success ? [] : r.error.issues.map((i) => i.message); };
    expect(issues({ stop: "96000" })).toContain("stop_below_entry");
    expect(issues({ tp2: "95500" })).toContain("tp_order");
    expect(issues({ tp2: "", tp3: "98000" })).toContain("tp_sequence");
    expect(issues({ market: "crypto_spot" })).toContain("leverage_market");
    expect(issues({ direction: "short" })).toEqual(expect.arrayContaining(["stop_above_entry", "tp_beyond_entry"]));
    expect(issues({ symbol: "BTC USDT" })).toContain("symbol");
    expect(issues({ extra: "x" }).length).toBeGreaterThan(0);
  });
  it("SHORT válida", () => { expect(CallInput.safeParse({ ...base, direction: "short", stop: "97000", tp1: "94000", tp2: "93000", tp3: "", tp4: "" }).success).toBe(true); });
});

describe("cálculos e estatísticas", () => {
  it("R/R e distância percentual por direção", () => {
    expect(rr({ entry: 95000, stop: 93000, tp1: 96000, tp2: 97000, tp3: null, tp4: null })).toEqual([0.5, 1]);
    expect(movePct({ direction: "short", entry: 100 }, 90)).toBeCloseTo(10); expect(movePct({ direction: "long", entry: 100 }, 90)).toBeCloseTo(-10);
  });
  it("estatísticas só com encerradas; canceladas e rascunhos fora; critérios de positiva/negativa", () => {
    const s = callStats([call({ gross_result_pct: 10, net_result_pct: 9.5, targets_hit: 1 }), call({ gross_result_pct: -5, stop_hit: true, close_reason: "stop" }), call({ gross_result_pct: 0 }),
      call({ status: "canceled", gross_result_pct: null, exit_price: null }), call({ status: "active", gross_result_pct: null, targets_hit: 2 }), call({ status: "draft", gross_result_pct: null })]);
    expect(s).toMatchObject({ total: 5, active: 1, closed: 3, canceled: 1, positive: 1, negative: 1, neutral: 1, targetsHit: 3, stopsHit: 1, hitRatePct: 33.33, avgGrossPct: 1.67, sumGrossPct: 5, avgNetPct: 9.5, netCount: 1 });
    expect(s.byMonth).toEqual([{ month: "2026-10", closed: 3, positive: 1, sumGrossPct: 5 }]);
  });
  it("sem calls encerradas não há taxa nem média (nada inventado)", () => {
    const s = callStats([call({ status: "active", gross_result_pct: null })]); expect(s.hitRatePct).toBeNull(); expect(s.avgGrossPct).toBeNull();
  });
  it("numeric do banco como texto vira número; filtros inválidos caem no padrão", () => {
    expect(normalizeCall({ entry: "95000.5", tp2: null, leverage: "10" } as never)).toMatchObject({ entry: 95000.5, tp2: null, leverage: 10 });
    expect(CallFilters.parse({ tab: "x", symbol: "<script>", market: "lua", period: "7" })).toEqual({ tab: "ativas", symbol: "", market: "", period: "" });
  });
});
describe("entrada pela API", () => {
  it("campos opcionais ausentes (JSON sem tp2..tp4/alavancagem) são aceitos", () => {
    const r = CallInput.safeParse({ market: "crypto_spot", symbol: "BTC", direction: "long", entry: 1, stop: 0.5, tp1: 2 });
    expect(r.success).toBe(true); if (r.success) expect([r.data.tp2, r.data.leverage]).toEqual([null, null]);
  });
});
