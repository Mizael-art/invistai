import { cache } from "react";
import { getSupabase } from "@/lib/supabase/server";
import { CALL_COLS, normalizeCall, type CallEvent, type CallFiltersT, type VipCall } from "@/lib/calls";

/** Leituras com a sessão do usuário: o banco (RLS) só devolve calls publicadas a PRO/MAX, e tudo a administradores. */
export const isAdmin = cache(async (): Promise<boolean> => {
  const sb = await getSupabase(); if (!sb) return false;
  const { data, error } = await sb.rpc("am_admin"); return !error && data === true;
});
export async function listCalls(f: Partial<CallFiltersT> & { statuses?: string[]; limit?: number } = {}): Promise<VipCall[] | null> {
  const sb = await getSupabase(); if (!sb) return null;
  let q = sb.from("vip_calls").select(CALL_COLS);
  if (f.statuses?.length) q = q.in("status", f.statuses);
  if (f.symbol) q = q.ilike("symbol", `%${f.symbol}%`);
  if (f.market) q = q.eq("market", f.market);
  if (f.period) q = q.gte("published_at", new Date(Date.now() - Number(f.period) * 86_400_000).toISOString());
  const { data, error } = await q.order("published_at", { ascending: false, nullsFirst: true }).order("created_at", { ascending: false }).limit(f.limit ?? 200);
  if (error) return null;
  return (data ?? []).map((r) => normalizeCall(r as Record<string, unknown>));
}
export async function getCall(id: string): Promise<{ call: VipCall; events: CallEvent[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = await getSupabase(); if (!sb) return null;
  const { data } = await sb.from("vip_calls").select(CALL_COLS).eq("id", id).maybeSingle(); if (!data) return null;
  const { data: ev } = await sb.from("vip_call_events").select("id,type,tp_index,price,note,created_at").eq("call_id", id).order("created_at", { ascending: true });
  return { call: normalizeCall(data as Record<string, unknown>), events: ((ev ?? []) as CallEvent[]).map((e) => ({ ...e, price: e.price === null ? null : Number(e.price) })) };
}
export async function adminOverview(): Promise<Record<string, unknown> | null> {
  const sb = await getSupabase(); if (!sb) return null; const { data, error } = await sb.rpc("admin_overview"); return error ? null : (data as Record<string, unknown>);
}
export interface AdminUser { id: string; email: string; name: string | null; created_at: string; plan: string; sub_status: string | null; period_end: string | null; ai_used: number; is_admin: boolean }
export async function adminListUsers(search = "", offset = 0): Promise<AdminUser[] | null> {
  const sb = await getSupabase(); if (!sb) return null; const { data, error } = await sb.rpc("admin_list_users", { p_search: search || null, p_limit: 50, p_offset: offset }); return error ? null : (data as AdminUser[]);
}
export async function adminAudit(limit = 30): Promise<{ id: string; action: string; target_type: string | null; target_id: string | null; created_at: string; details: unknown }[] | null> {
  const sb = await getSupabase(); if (!sb) return null; const { data, error } = await sb.rpc("admin_audit", { p_limit: limit }); return error ? null : (data as never);
}
