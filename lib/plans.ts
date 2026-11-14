/** Planos e permissões do TRADEON — fonte única usada pelo servidor (APIs/páginas) e pela interface.
 *  A interface apenas reflete; toda liberação é verificada no backend (gate()) e no banco (RLS/funções). */
export const PLAN_IDS = ["free", "pro", "max"] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export const FEATURES = ["ai_unlimited", "calls", "vip_portfolios", "bots", "broker_api", "auto_calls"] as const;
export type Feature = (typeof FEATURES)[number];

export const AI_FREE_LIMIT = 3;
export const PLANS: Record<PlanId, { name: string; priceCents: number; rank: number; features: Record<Feature, boolean> }> = {
  free: { name: "Free", priceCents: 0, rank: 0, features: { ai_unlimited: false, calls: false, vip_portfolios: false, bots: false, broker_api: false, auto_calls: false } },
  pro: { name: "Pro", priceCents: 3000, rank: 1, features: { ai_unlimited: true, calls: true, vip_portfolios: true, bots: false, broker_api: false, auto_calls: false } },
  max: { name: "Max", priceCents: 5000, rank: 2, features: { ai_unlimited: true, calls: true, vip_portfolios: true, bots: true, broker_api: true, auto_calls: true } },
};
export const isPlanId = (v: unknown): v is PlanId => typeof v === "string" && (PLAN_IDS as readonly string[]).includes(v);
export const can = (plan: PlanId, f: Feature) => PLANS[plan].features[f];
/** Menor plano que libera o recurso (para a tela de upgrade). */
export const minPlanFor = (f: Feature): PlanId => PLAN_IDS.find((p) => PLANS[p].features[f]) ?? "max";

export type SubStatus = "none" | "incomplete" | "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "expired";
/** Plano efetivo — MESMA regra de public.current_plan no banco: pago/ativo e dentro do período. */
export function effectivePlan(s: { plan_id: string; status: string; current_period_end: string | null } | null, now = Date.now()): PlanId {
  if (!s || !isPlanId(s.plan_id) || s.plan_id === "free") return "free";
  if (!["active", "trialing", "past_due"].includes(s.status)) return "free";
  if (s.current_period_end && Date.parse(s.current_period_end) <= now) return "free";
  return s.plan_id;
}
export const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: cents % 100 ? 2 : 0 });
