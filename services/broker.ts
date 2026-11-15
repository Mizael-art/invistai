import { getSupabase } from "@/lib/supabase/server";
import { accountSnapshot, BrokerError, type AccountSnapshot, type Exchange } from "@/lib/broker";
import { open } from "@/lib/broker/vault";
import type { Permissions } from "@/lib/broker/types";

/** Leitura das conexões do usuário (metadados via RLS) e do estado da conta na corretora (credenciais só no servidor). */
export interface Conn { id: string; exchange: Exchange; label: string; key_hint: string; permissions: Partial<Permissions>; can_trade: boolean; ip_restricted: boolean; bots_allowed: boolean; status: "active" | "invalid"; last_error: string | null; last_checked_at: string | null; created_at: string }
export const CONN_COLS = "id,exchange,label,key_hint,permissions,can_trade,ip_restricted,bots_allowed,status,last_error,last_checked_at,created_at";
export async function listConnections(): Promise<Conn[] | null> {
  const sb = await getSupabase(); if (!sb) return null;
  const { data, error } = await sb.from("broker_connections").select(CONN_COLS).order("created_at", { ascending: true }); return error ? null : (data as Conn[]);
}
export const aad = (userId: string, ex: Exchange) => `${userId}:${ex}`;
export async function loadSnapshot(userId: string, id: string): Promise<{ ok: true; data: AccountSnapshot } | { ok: false; code: string }> {
  const sb = await getSupabase(); const secret = process.env.BILLING_DB_SECRET; if (!sb || !secret) return { ok: false, code: "unavailable" };
  const { data, error } = await sb.rpc("broker_credentials", { secret, p_id: id }); const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return { ok: false, code: "not_found" };
  let creds;
  try { creds = { apiKey: open(row.key_enc, aad(userId, row.exchange)), apiSecret: open(row.secret_enc, aad(userId, row.exchange)) }; } catch { return { ok: false, code: "vault_unavailable" }; }
  try {
    const snap = await accountSnapshot(row.exchange, creds);
    await sb.rpc("broker_mark", { secret, p_id: id, p_status: "active", p_permissions: snap.permissions, p_error: null });
    return { ok: true, data: snap };
  } catch (e) {
    const code = e instanceof BrokerError ? e.code : "unavailable";
    if (["invalid_key", "withdraw_enabled", "read_disabled", "permission_denied"].includes(code)) await sb.rpc("broker_mark", { secret, p_id: id, p_status: "invalid", p_permissions: null, p_error: code });
    return { ok: false, code };
  }
}
