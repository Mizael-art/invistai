import { z } from "zod";
/** Metadados mínimos de notícia guardados com o favorito (somente título, fonte, data e URL https — nunca o texto da matéria). */
export const newsMetadata = z.object({
  title: z.string().trim().min(1).max(300),
  source: z.string().trim().max(100),
  url: z.string().url().max(2000).refine((u) => u.startsWith("https://"), "https only"),
  publishedAt: z.string().datetime({ offset: true }),
  category: z.enum(["crypto", "stocks", "economy", "forex"]).optional(),
});
/** Metadados mínimos de ativo (para exibir o favorito mesmo se o provedor de cotações estiver fora do ar). */
export const assetMetadata = z.object({
  symbol: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(100),
  category: z.enum(["crypto_spot", "crypto_futures", "stocks_br", "stocks_intl", "funds", "forex"]).optional(),
}).strict();
export type NewsMetadata = z.infer<typeof newsMetadata>;
export type AssetMetadata = z.infer<typeof assetMetadata>;

export const favoriteInput = z.object({
  itemType: z.enum(["asset", "news"]),
  itemId: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:\-]+$/),
  metadata: z.unknown().optional(),
}).transform((v, ctx) => {
  if (v.metadata === undefined) return { itemType: v.itemType, itemId: v.itemId };
  const r = (v.itemType === "news" ? newsMetadata : assetMetadata).safeParse(v.metadata);   // o formato dos metadados depende do tipo
  if (!r.success) { ctx.addIssue({ code: "custom", message: "invalid_metadata", path: ["metadata"] }); return z.NEVER; }
  return { itemType: v.itemType, itemId: v.itemId, metadata: r.data as NewsMetadata | AssetMetadata };
});
export type FavoriteInput = z.infer<typeof favoriteInput>;
export type FavoriteType = "asset" | "news";
