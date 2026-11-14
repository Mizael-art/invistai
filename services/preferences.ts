import { getSupabase } from "@/lib/supabase/server";
import { NEWS_CATEGORY_KEYS } from "@/services/news/categories";
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "@/schemas/preferences";
import type { NewsCategory } from "@/services/news/types";

export interface Prefs { news: NewsCategory[]; notifications: NotificationCategory[] }
export async function getPrefsFor(userId: string): Promise<Prefs> {
  try {
    const sb = await getSupabase(); if (!sb) return { news: [], notifications: [] };
    const { data } = await sb.from("user_preferences").select("news_categories, notification_categories").eq("user_id", userId).maybeSingle();
    return {
      news: ((data?.news_categories ?? []) as string[]).filter((c): c is NewsCategory => (NEWS_CATEGORY_KEYS as string[]).includes(c)),
      notifications: ((data?.notification_categories ?? []) as string[]).filter((c): c is NotificationCategory => (NOTIFICATION_CATEGORIES as readonly string[]).includes(c)),
    };
  } catch { return { news: [], notifications: [] }; }
}
export async function getNewsCategories(userId: string): Promise<NewsCategory[]> { return (await getPrefsFor(userId)).news; }
