import { getSupabase } from "@/lib/supabase/server";
import type { FavoriteRow } from "@/lib/favorites";
import type { FavoriteType } from "@/schemas/favorites";

export async function listFavoriteIds(userId: string, itemType: FavoriteType): Promise<Set<string>> {
  try {
    const sb = await getSupabase(); if (!sb) return new Set();
    const { data } = await sb.from("favorites").select("item_id").eq("user_id", userId).eq("item_type", itemType);
    return new Set((data ?? []).map((r: { item_id: string }) => r.item_id));
  } catch { return new Set(); }
}

export const FAVORITES_CAP = 500;     // limite de leitura por usuário (listas maiores exigiriam paginação no banco)
/** Favoritos do usuário (mais recentes primeiro). RLS garante que só as linhas do próprio usuário são retornadas. */
export async function listFavorites(userId: string): Promise<{ ok: true; rows: FavoriteRow[] } | { ok: false }> {
  try {
    const sb = await getSupabase(); if (!sb) return { ok: false };
    const { data, error } = await sb.from("favorites").select("item_type, item_id, created_at, metadata").eq("user_id", userId).order("created_at", { ascending: false }).limit(FAVORITES_CAP);
    if (error) return { ok: false };
    return { ok: true, rows: (data ?? []).map((r: { item_type: string; item_id: string; created_at: string; metadata: unknown }) => ({ type: r.item_type === "news" ? "news" : "asset", id: r.item_id, createdAt: r.created_at, metadata: r.metadata })) };
  } catch { return { ok: false }; }
}
