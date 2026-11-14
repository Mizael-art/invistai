import { cache } from "react";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { getSessionUser, type SessionUser } from "./session";
import { can, effectivePlan, minPlanFor, type Feature, type PlanId } from "@/lib/plans";

export interface SubscriptionRow { plan_id: string; status: string; provider: string | null; provider_customer_id: string | null; started_at: string | null; current_period_start: string | null; current_period_end: string | null; cancel_at_period_end: boolean; canceled_at: string | null; updated_at: string }
export interface Entitlements { user: SessionUser; plan: PlanId; sub: SubscriptionRow | null }

/** Assinatura e plano efetivo do usuário logado (lidos com a sessão dele; RLS garante que só vê a própria). */
export const getEntitlements = cache(async (): Promise<Entitlements | null> => {
  const user = await getSessionUser(); if (!user) return null;
  const sb = await getSupabase(); if (!sb) return { user, plan: "free", sub: null };
  const { data } = await sb.from("subscriptions").select("plan_id,status,provider,provider_customer_id,started_at,current_period_start,current_period_end,cancel_at_period_end,canceled_at,updated_at").eq("user_id", user.id).maybeSingle();
  const sub = (data as SubscriptionRow | null) ?? null;
  return { user, plan: effectivePlan(sub), sub };
});

/** Porteiro das APIs premium: 401 sem sessão, 403 (com o plano necessário) sem permissão. */
export async function gate(feature: Feature): Promise<{ ok: true; ent: Entitlements } | { ok: false; res: NextResponse }> {
  const ent = await getEntitlements();
  if (!ent) return { ok: false, res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (!can(ent.plan, feature)) return { ok: false, res: NextResponse.json({ error: "plan_required", plan: ent.plan, required: minPlanFor(feature) }, { status: 403 }) };
  return { ok: true, ent };
}

export async function listPayments(limit = 24) {
  const sb = await getSupabase(); const u = await getSessionUser(); if (!sb || !u) return [];
  const { data } = await sb.from("subscription_payments").select("id,provider_invoice_id,plan_id,amount_cents,currency,status,invoice_url,period_start,period_end,paid_at,created_at").eq("user_id", u.id).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as { id: string; provider_invoice_id: string; plan_id: string | null; amount_cents: number; currency: string; status: string; invoice_url: string | null; period_start: string | null; period_end: string | null; paid_at: string | null; created_at: string }[];
}
export async function listPlanEvents(limit = 20) {
  const sb = await getSupabase(); const u = await getSessionUser(); if (!sb || !u) return [];
  const { data } = await sb.from("subscription_events").select("from_plan,to_plan,from_status,to_status,reason,created_at").eq("user_id", u.id).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as { from_plan: string | null; to_plan: string | null; from_status: string | null; to_status: string | null; reason: string; created_at: string }[];
}
export async function aiQuota(): Promise<{ plan: PlanId; used: number; limit: number | null; remaining: number | null } | null> {
  const sb = await getSupabase(); if (!sb) return null;
  const { data, error } = await sb.rpc("ai_quota"); if (error || !data) return null;
  const r = (Array.isArray(data) ? data[0] : data) as { plan: PlanId; used: number; msg_limit: number | null; remaining: number | null };
  return { plan: r.plan, used: r.used, limit: r.msg_limit, remaining: r.remaining };
}
