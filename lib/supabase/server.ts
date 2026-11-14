import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

export const supabaseConfigured = () => getSupabaseEnv() !== null;

/** Cliente com a sessão do usuário (anon key + RLS). Retorna null se o Supabase não estiver configurado. */
export async function getSupabase() {
  const env = getSupabaseEnv();
  if (!env) return null;
  const store = await cookies();
  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => store.set(name, value, { ...options, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" })); } catch { /* Server Component: cookies só podem ser gravados em route handlers/middleware */ } },
    },
  });
}
