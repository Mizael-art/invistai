import { z } from "zod";
const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
export const NOTIF_CATEGORIES = ["market", "news", "account"] as const;
export const notificationsParams = z.object({
  cat: z.enum(["all", ...NOTIF_CATEGORIES]).catch("all"),
  state: z.enum(["all", "unread"]).catch("all"),
  page: z.coerce.number().int().min(1).max(100).catch(1),
});
export type NotificationsParams = z.infer<typeof notificationsParams>;
export const parseNotificationsParams = (raw: Record<string, unknown>): NotificationsParams => notificationsParams.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, first(v)])));

/** Marcar como lidas: ids específicos OU todas (opcionalmente de uma categoria). */
export const markReadInput = z.union([
  z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }).strict(),
  z.object({ all: z.literal(true), category: z.enum(NOTIF_CATEGORIES).optional() }).strict(),
]);
