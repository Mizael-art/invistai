import { describe, it, expect, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { can, effectivePlan, minPlanFor, PLANS, brl } from "@/lib/plans";
import { formEncode, verifyStripeSignature, mapStatus, readSub, stripeEnv, planFromPrice } from "@/lib/billing/stripe";

const env = { secretKey: "sk_test_x", webhookSecret: "whsec_x", prices: { pro: "price_pro", max: "price_max" }, apiBase: "https://api.stripe.com", dbSecret: "d".repeat(40) };
const sign = (payload: string, t: number, secret = env.webhookSecret) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;

describe("planos e permissões", () => {
  it("matriz FREE/PRO/MAX conforme especificação", () => {
    expect(["ai_unlimited", "calls", "vip_portfolios", "bots", "broker_api", "auto_calls"].map((f) => [can("free", f as never), can("pro", f as never), can("max", f as never)])).toEqual([[false, true, true], [false, true, true], [false, true, true], [false, false, true], [false, false, true], [false, false, true]]);
    expect([PLANS.free.priceCents, PLANS.pro.priceCents, PLANS.max.priceCents]).toEqual([0, 3000, 5000]);
    expect(minPlanFor("calls")).toBe("pro"); expect(minPlanFor("bots")).toBe("max");
    expect(brl(3000).replace(/\s/g, " ")).toBe("R$ 30"); expect(brl(4990).replace(/\s/g, " ")).toBe("R$ 49,90");
  });
  it("plano efetivo (mesma regra do banco): pago e no período", () => {
    const now = Date.parse("2026-11-14T12:00:00Z"), fut = "2026-12-14T12:00:00Z", past = "2026-11-01T00:00:00Z";
    expect(effectivePlan(null, now)).toBe("free");
    expect(effectivePlan({ plan_id: "pro", status: "active", current_period_end: fut }, now)).toBe("pro");
    expect(effectivePlan({ plan_id: "max", status: "past_due", current_period_end: fut }, now)).toBe("max");
    expect(effectivePlan({ plan_id: "max", status: "active", current_period_end: past }, now)).toBe("free");
    for (const st of ["incomplete", "canceled", "unpaid", "expired", "none"]) expect(effectivePlan({ plan_id: "max", status: st, current_period_end: fut }, now), st).toBe("free");
    expect(effectivePlan({ plan_id: "hacker", status: "active", current_period_end: fut }, now)).toBe("free");
  });
});

describe("Stripe", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("assinatura do webhook: válida, adulterada, segredo errado, expirada (replay) e malformada", () => {
    const p = '{"id":"evt_1"}', now = Date.parse("2026-11-14T12:00:00Z"), t = now / 1000;
    expect(verifyStripeSignature(p, sign(p, t), env.webhookSecret, now)).toBe(true);
    expect(verifyStripeSignature(p + " ", sign(p, t), env.webhookSecret, now)).toBe(false);
    expect(verifyStripeSignature(p, sign(p, t, "whsec_outro"), env.webhookSecret, now)).toBe(false);
    expect(verifyStripeSignature(p, sign(p, t - 301), env.webhookSecret, now)).toBe(false);
    expect(verifyStripeSignature(p, `t=${t},v0=abc`, env.webhookSecret, now)).toBe(false);
    expect(verifyStripeSignature(p, null, env.webhookSecret, now)).toBe(false);
    expect(verifyStripeSignature(p, `t=${t},v1=zz,${sign(p, t).split(",")[1]}`, env.webhookSecret, now)).toBe(true);   // várias assinaturas (rotação de segredo)
  });
  it("codificação de formulário aninhado", () => {
    expect(decodeURIComponent(formEncode({ mode: "subscription", line_items: [{ price: "p", quantity: 1 }], metadata: { user_id: "u" }, skip: undefined }))).toBe("mode=subscription&line_items[0][price]=p&line_items[0][quantity]=1&metadata[user_id]=u");
  });
  it("status e leitura da assinatura (período no topo ou no item, conforme a versão da API)", () => {
    expect(mapStatus("incomplete_expired")).toBe("expired"); expect(mapStatus("algo")).toBe("incomplete");
    const base = { id: "sub_1", customer: "cus_1", status: "active", start_date: 1763000000, metadata: { user_id: "11111111-1111-4111-8111-111111111111" } };
    expect(readSub(env, { ...base, current_period_end: 1765000000, items: { data: [{ price: { id: "price_max" } }] } })).toMatchObject({ plan: "max", status: "active", periodEnd: new Date(1765000000e3).toISOString(), userId: base.metadata.user_id });
    expect(readSub(env, { ...base, items: { data: [{ price: { id: "price_pro" }, current_period_end: 1766000000 }] } })).toMatchObject({ plan: "pro", periodEnd: new Date(1766000000e3).toISOString() });
    expect(readSub(env, { ...base, metadata: { user_id: "x' or 1=1" }, items: { data: [{ price: { id: "price_x" } }] } })).toMatchObject({ plan: null, userId: null });
    expect(planFromPrice(env, "price_pro")).toBe("pro"); expect(planFromPrice(env, undefined)).toBeNull();
  });
  it("sem todas as variáveis (ou segredo do banco curto) a cobrança fica desligada", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk"); vi.stubEnv("STRIPE_WEBHOOK_SECRET", "wh"); vi.stubEnv("STRIPE_PRICE_PRO", "p1"); vi.stubEnv("STRIPE_PRICE_MAX", "p2"); vi.stubEnv("BILLING_DB_SECRET", "curto");
    expect(stripeEnv()).toBeNull();
    vi.stubEnv("BILLING_DB_SECRET", "x".repeat(32)); expect(stripeEnv()).toMatchObject({ prices: { pro: "p1", max: "p2" } });
  });
});
