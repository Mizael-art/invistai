import { cache } from "react";
import { getSupabase } from "@/lib/supabase/server";
import type { NotificationsParams } from "@/schemas/notifications";

export interface NotificationRow { id: string; kind: string; category: "market" | "news" | "account"; title: string | null; message: string | null; target: string | null; createdAt: string; readAt: string | null }
export const NOTIF_PAGE_SIZE = 20;

/** Contagem de não lidas do usuário (RLS). Nunca lança; null = indisponível. */
export const unreadCount = cache(async (userId: string): Promise<number | null> => {
  try {
    const sb = await getSupabase(); if (!sb) return null;
    const { count, error } = await sb.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
    return error ? null : count ?? 0;
  } catch { return null; }
});

export async function listNotifications(userId: string, p: NotificationsParams): Promise<{ ok: true; rows: NotificationRow[]; total: number } | { ok: false }> {
  try {
    const sb = await getSupabase(); if (!sb) return { ok: false };
    const from = (p.page - 1) * NOTIF_PAGE_SIZE;
    let q = sb.from("notifications").select("id, kind, category, title, message, target, created_at, read_at", { count: "exact" }).eq("user_id", userId);
    if (p.cat !== "all") q = q.eq("category", p.cat);
    if (p.state === "unread") q = q.is("read_at", null);
    const { data, count, error } = await q.order("created_at", { ascending: false }).range(from, from + NOTIF_PAGE_SIZE - 1);
    if (error) return { ok: false };
    return { ok: true, total: count ?? 0, rows: (data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id), kind: String(r.kind), category: (["market", "news", "account"].includes(String(r.category)) ? r.category : "account") as NotificationRow["category"],
      title: (r.title as string) ?? null, message: (r.message as string) ?? null, target: (r.target as string) ?? null, createdAt: String(r.created_at), readAt: (r.read_at as string) ?? null })) };
  } catch { return { ok: false }; }
}
