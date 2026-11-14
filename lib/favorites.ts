import { assetMetadata, newsMetadata, type FavoriteType } from "@/schemas/favorites";
import { normalizeText } from "@/services/market/query";

export interface FavoriteRow { type: FavoriteType; id: string; createdAt: string; metadata: unknown }
export type FavoriteItem =
  | { kind: "asset"; id: string; createdAt: string; symbol: string | null; name: string | null }
  | { kind: "news"; id: string; createdAt: string; title: string | null; source: string | null; url: string | null; publishedAt: string | null; category: string | null };

/** Converte linhas do banco em itens; metadados ausentes/malformados viram `null` (nunca quebram a lista). */
export function toItems(rows: FavoriteRow[]): FavoriteItem[] {
  return rows.map((r): FavoriteItem => {
    if (r.type === "asset") { const m = assetMetadata.safeParse(r.metadata); return { kind: "asset", id: r.id, createdAt: r.createdAt, symbol: m.success ? m.data.symbol : null, name: m.success ? m.data.name : null }; }
    const m = newsMetadata.safeParse(r.metadata);
    return { kind: "news", id: r.id, createdAt: r.createdAt, title: m.success ? m.data.title : null, source: m.success ? m.data.source : null, url: m.success ? m.data.url : null, publishedAt: m.success ? m.data.publishedAt : null, category: m.success ? (m.data.category ?? null) : null };
  });
}
export const counts = (items: FavoriteItem[]) => ({ all: items.length, asset: items.filter((i) => i.kind === "asset").length, news: items.filter((i) => i.kind === "news").length });

/** Filtra por tipo e busca (nome/símbolo/id do ativo; título/fonte da notícia), sem acento/caixa. Mantém a ordem (mais recentes primeiro). */
export function filterFavorites(items: FavoriteItem[], type: "all" | FavoriteType, q: string): FavoriteItem[] {
  const n = normalizeText(q);
  return items.filter((i) => {
    if (type !== "all" && i.kind !== type) return false;
    if (!n) return true;
    const hay = i.kind === "asset" ? `${i.symbol ?? ""} ${i.name ?? ""} ${i.id}` : i.title ? `${i.title} ${i.source ?? ""}` : i.id;
    return normalizeText(hay).includes(n);
  });
}
export function paginate<T>(items: T[], page: number, size: number): { items: T[]; pages: number; page: number } {
  const pages = Math.max(1, Math.ceil(items.length / size)), p = Math.min(Math.max(1, page), pages);
  return { items: items.slice((p - 1) * size, p * size), pages, page: p };
}
