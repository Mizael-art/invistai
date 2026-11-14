import { z } from "zod";
const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
export const favoritesParams = z.object({
  type: z.enum(["all", "asset", "news"]).catch("all"),
  q: z.string().transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)).catch(""),
  page: z.coerce.number().int().min(1).max(50).catch(1),
});
export type FavoritesParams = z.infer<typeof favoritesParams>;
export const parseFavoritesParams = (raw: Record<string, unknown>): FavoritesParams => favoritesParams.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, first(v)])));
