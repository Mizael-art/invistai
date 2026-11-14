import { cache } from "react";
import { getSupabase } from "@/lib/supabase/server";
export interface Profile { name: string | null; phone: string | null; lang: "pt" | "en" | null; theme: "dark" | "light" | null }
export const getProfile = cache(async (userId: string): Promise<Profile> => {
  const empty: Profile = { name: null, phone: null, lang: null, theme: null };
  try {
    const sb = await getSupabase(); if (!sb) return empty;
    const { data } = await sb.from("profiles").select("name, phone, lang, theme").eq("id", userId).maybeSingle();
    return { name: data?.name ?? null, phone: data?.phone ?? null, lang: data?.lang === "en" ? "en" : data?.lang === "pt" ? "pt" : null, theme: data?.theme === "light" ? "light" : data?.theme === "dark" ? "dark" : null };
  } catch { return empty; }
});
