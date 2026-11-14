import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { readSub, stripe, stripeEnv, stripeTs, verifyStripeSignature, planFromPrice, type StripeEnv, type StripeSub } from "@/lib/billing/stripe";

export const runtime = "nodejs";
/** Webhook da Stripe: ÚNICA porta que libera/retira planos. Assinatura validada, evento processado uma vez,
 *  escrita no banco por funções protegidas pelo segredo de servidor (sem service_role). Falha → 500 para a Stripe reenviar. */
export async function POST(req: Request) {
  const env = stripeEnv(); const sbEnv = getSupabaseEnv();
  if (!env || !sbEnv) return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });
  const payload = await req.text();
  if (payload.length > 512_000 || !verifyStripeSignature(payload, req.headers.get("stripe-signature"), env.webhookSecret)) return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  let ev: { id: string; type: string; data: { object: Record<string, unknown> } };
  try { ev = JSON.parse(payload); } catch { return NextResponse.json({ error: "invalid" }, { status: 400 }); }
  if (typeof ev?.id !== "string" || typeof ev?.type !== "string") return NextResponse.json({ error: "invalid" }, { status: 400 });
  const db = createClient(sbEnv.url, sbEnv.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const rpc = async (fn: string, args: Record<string, unknown>) => { const { data, error } = await db.rpc(fn, { secret: env.dbSecret, ...args }); if (error) throw new Error(`${fn}:${error.code ?? "err"}`); return data; };
  const first = await rpc("billing_claim_event", { p_event_id: ev.id, p_provider: "stripe", p_type: ev.type }).catch(() => null);
  if (first === null) return NextResponse.json({ error: "db_unavailable" }, { status: 500 });
  if (first === false) return NextResponse.json({ ok: true, duplicate: true });
  try {
    await handle(env, ev.type, ev.data.object, rpc);
    return NextResponse.json({ ok: true });
  } catch (e) {
    await rpc("billing_release_event", { p_event_id: ev.id }).catch(() => {});
    console.error("[billing] falha ao processar evento", ev.type, e instanceof Error ? e.message.slice(0, 120) : "erro");
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;
async function userFor(rpc: Rpc, customer: unknown, meta?: unknown): Promise<string | null> {
  const m = (meta as Record<string, string> | undefined)?.user_id; if (m && /^[0-9a-f-]{36}$/i.test(m)) return m;
  return typeof customer === "string" ? ((await rpc("billing_user_by_customer", { p_customer: customer })) as string | null) : null;
}
async function syncSub(env: StripeEnv, rpc: Rpc, s: StripeSub, reason: string, uid?: string | null) {
  const r = readSub(env, s); const user = uid ?? r.userId ?? (await userFor(rpc, r.customer));
  if (!user) throw new Error("user_not_found");
  await rpc("billing_sync_subscription", { p_user: user, p_plan: r.plan ?? "free", p_status: r.plan ? r.status : "incomplete", p_provider: "stripe", p_customer: r.customer, p_subscription: r.id,
    p_started: r.started, p_period_start: r.periodStart, p_period_end: r.periodEnd, p_cancel_at_period_end: r.cancelAtPeriodEnd, p_canceled_at: r.canceledAt, p_reason: reason });
}
async function handle(env: StripeEnv, type: string, o: Record<string, unknown>, rpc: Rpc) {
  switch (type) {
    case "checkout.session.completed": {
      if (o.mode !== "subscription") return;
      const user = typeof o.client_reference_id === "string" && /^[0-9a-f-]{36}$/i.test(o.client_reference_id) ? o.client_reference_id : await userFor(rpc, o.customer, o.metadata);
      if (!user || typeof o.customer !== "string") throw new Error("checkout_without_user");
      await rpc("billing_link_customer", { p_user: user, p_provider: "stripe", p_customer: o.customer });
      if (typeof o.subscription === "string") await syncSub(env, rpc, await stripe<StripeSub>(env, "GET", `/v1/subscriptions/${encodeURIComponent(o.subscription)}`), "checkout", user);
      return;
    }
    case "customer.subscription.created": case "customer.subscription.updated": case "customer.subscription.deleted":
      return syncSub(env, rpc, o as unknown as StripeSub, type.split(".").pop()!);
    case "invoice.paid": case "invoice.payment_succeeded": case "invoice.payment_failed": {
      const user = await userFor(rpc, o.customer, (o.subscription_details as Record<string, unknown> | undefined)?.metadata ?? (o.parent as { subscription_details?: { metadata?: unknown } } | undefined)?.subscription_details?.metadata);
      if (!user) throw new Error("user_not_found");
      const line = ((o.lines as { data?: { period?: { start?: number; end?: number }; price?: { id?: string }; pricing?: { price_details?: { price?: string } } }[] } | undefined)?.data ?? [])[0];
      const failed = type === "invoice.payment_failed";
      await rpc("billing_record_payment", { p_user: user, p_provider: "stripe", p_invoice: String(o.id), p_plan: planFromPrice(env, line?.price?.id ?? line?.pricing?.price_details?.price),
        p_amount: Number(failed ? o.amount_due : o.amount_paid) || 0, p_currency: String(o.currency ?? "brl"), p_status: failed ? "failed" : "paid", p_url: typeof o.hosted_invoice_url === "string" ? o.hosted_invoice_url : null,
        p_period_start: stripeTs(line?.period?.start), p_period_end: stripeTs(line?.period?.end), p_paid_at: failed ? null : stripeTs((o.status_transitions as { paid_at?: number } | undefined)?.paid_at) ?? new Date().toISOString() });
      return;
    }
    case "charge.refunded": {
      const inv = typeof o.invoice === "string" ? o.invoice : null; if (!inv) return;
      await rpc("billing_mark_refund", { p_invoice: inv, p_full: o.amount_refunded === o.amount });
      return;
    }
    default: return;   // outros eventos são ignorados (e ficam registrados como recebidos)
  }
}
