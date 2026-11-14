import { cache } from "react";
import { getSupabase } from "@/lib/supabase/server";

export interface SessionUser { id: string; name: string | null; email: string | null; emailConfirmed: boolean; createdAt: string | null }
/** Usuário autenticado validado no servidor (auth.getUser), ou null para visitantes. Nunca lança. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const sb = await getSupabase();
    if (!sb) return null;
    const { data } = await sb.auth.getUser();
    const u = data.user;
    if (!u) return null;
    let name: string | null = null;
    const { data: p } = await sb.from("profiles").select("name").eq("id", u.id).maybeSingle();
    name = p?.name ?? (typeof u.user_metadata?.name === "string" ? u.user_metadata.name : null);
    return { id: u.id, name, email: u.email ?? null, emailConfirmed: !!u.email_confirmed_at, createdAt: u.created_at ?? null };
  } catch { return null; }
});
