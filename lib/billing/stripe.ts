import { createHmac, timingSafeEqual } from "node:crypto";
import { isPlanId, type PlanId } from "@/lib/plans";

/** Integração Stripe (Checkout + Portal do Cliente + Webhooks) via API REST, sem SDK.
 *  Só roda no servidor. Nenhuma chave é enviada ao navegador. */
export interface StripeEnv { secretKey: string; webhookSecret: string; prices: Record<"pro" | "max", string>; apiBase: string; dbSecret: string }
export function stripeEnv(): StripeEnv | null {
  const e = process.env;
  if (!e.STRIPE_SECRET_KEY || !e.STRIPE_WEBHOOK_SECRET || !e.STRIPE_PRICE_PRO || !e.STRIPE_PRICE_MAX || !e.BILLING_DB_SECRET || e.BILLING_DB_SECRET.length < 32) return null;
  return { secretKey: e.STRIPE_SECRET_KEY, webhookSecret: e.STRIPE_WEBHOOK_SECRET, prices: { pro: e.STRIPE_PRICE_PRO, max: e.STRIPE_PRICE_MAX }, apiBase: (e.STRIPE_API_BASE || "https://api.stripe.com").replace(/\/$/, ""), dbSecret: e.BILLING_DB_SECRET };
}
export const planFromPrice = (env: StripeEnv, priceId: string | null | undefined): PlanId | null => priceId === env.prices.pro ? "pro" : priceId === env.prices.max ? "max" : null;

/** Codifica objetos aninhados no formato de formulário da Stripe: a[b][0][c]=v. */
export function formEncode(obj: Record<string, unknown>, prefix = ""): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => out.push(typeof x === "object" && x !== null ? formEncode(x as Record<string, unknown>, `${key}[${i}]`) : `${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(x))}`));
    else if (typeof v === "object") out.push(formEncode(v as Record<string, unknown>, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.filter(Boolean).join("&");
}

export class StripeError extends Error { constructor(public status: number, public code: string) { super(code); } }
export async function stripe<T>(env: StripeEnv, method: "GET" | "POST", path: string, body?: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  const res = await fetch(`${env.apiBase}${path}`, {
    method, cache: "no-store", signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${env.secretKey}`, "Content-Type": "application/x-www-form-urlencoded", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
    body: body ? formEncode(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { code?: string; type?: string } };
  if (!res.ok) throw new StripeError(res.status, json.error?.code || json.error?.type || `http_${res.status}`);   // sem repassar mensagens/segredos
  return json;
}

/** Verifica o cabeçalho Stripe-Signature (HMAC-SHA256 de "t.payload"), com tolerância de 5 minutos contra replay. */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, now = Date.now(), toleranceSec = 300): boolean {
  if (!header || !secret) return false;
  const parts = header.split(","); const t = parts.find((p) => p.startsWith("t="))?.slice(2); const sigs = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !/^\d+$/.test(t) || !sigs.length) return false;
  if (Math.abs(now / 1000 - Number(t)) > toleranceSec) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex"), "utf8");
  return sigs.some((s) => { const b = Buffer.from(s, "utf8"); return b.length === expected.length && timingSafeEqual(b, expected); });
}

/** Mapeia status da Stripe para o do TRADEON. */
export function mapStatus(s: string): string {
  return ({ active: "active", trialing: "trialing", past_due: "past_due", canceled: "canceled", unpaid: "unpaid", incomplete: "incomplete", incomplete_expired: "expired", paused: "unpaid" } as Record<string, string>)[s] ?? "incomplete";
}
const ts = (n: unknown) => (typeof n === "number" && n > 0 ? new Date(n * 1000).toISOString() : null);
export interface StripeSub { id: string; customer: string; status: string; start_date?: number; cancel_at_period_end?: boolean; canceled_at?: number | null; current_period_start?: number; current_period_end?: number; metadata?: Record<string, string>; items?: { data: { price?: { id?: string }; current_period_start?: number; current_period_end?: number }[] } }
/** Extrai o que importa da assinatura (o período fica no item nas versões novas da API). */
export function readSub(env: StripeEnv, s: StripeSub) {
  const it = s.items?.data?.[0];
  const plan = planFromPrice(env, it?.price?.id);
  return { plan, status: mapStatus(s.status), customer: s.customer, id: s.id, started: ts(s.start_date), periodStart: ts(s.current_period_start ?? it?.current_period_start), periodEnd: ts(s.current_period_end ?? it?.current_period_end), cancelAtPeriodEnd: !!s.cancel_at_period_end, canceledAt: ts(s.canceled_at), userId: s.metadata?.user_id && /^[0-9a-f-]{36}$/i.test(s.metadata.user_id) ? s.metadata.user_id : null };
}
export const validPlan = (p: unknown): p is "pro" | "max" => isPlanId(p) && p !== "free";
export { ts as stripeTs };
