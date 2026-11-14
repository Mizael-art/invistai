import { z } from "zod";
import { NEWS_CATEGORY_KEYS } from "@/services/news/categories";

export const NOTIFICATION_CATEGORIES = ["market", "news", "account"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
const dedupe = <T,>(a: T[]) => [...new Set(a)];

/** Preferências de categorias (ao menos uma lista). Notícias e notificações são salvas de forma independente. */
export const prefsInput = z.object({
  newsCategories: z.array(z.enum(NEWS_CATEGORY_KEYS)).max(4).transform(dedupe).optional(),
  notificationCategories: z.array(z.enum(NOTIFICATION_CATEGORIES)).max(3).transform(dedupe).optional(),
}).strict().refine((v) => v.newsCategories !== undefined || v.notificationCategories !== undefined, { message: "empty" });
/** Compatibilidade com a Etapa 04. */
export const newsPrefsInput = prefsInput;

export const appPrefsInput = z.object({ theme: z.enum(["dark", "light"]).optional(), lang: z.enum(["pt", "en"]).optional() }).strict()
  .refine((v) => v.theme !== undefined || v.lang !== undefined, { message: "empty" });
