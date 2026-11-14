import { z } from "zod";
import { NEWS_CATEGORY_KEYS } from "@/services/news/categories";
const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
export const CAT_PARAM = ["all", "mine", ...NEWS_CATEGORY_KEYS] as const;
export const newsParams = z.object({
  cat: z.enum(CAT_PARAM).catch("all"),
  q: z.string().transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)).catch(""),
  page: z.coerce.number().int().min(1).max(20).catch(1),
});
export type NewsParams = z.infer<typeof newsParams>;
export const parseNewsParams = (raw: Record<string, unknown>): NewsParams => newsParams.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, first(v)])));
