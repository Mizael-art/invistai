import Link from "next/link";
import { FavCount } from "./FavCount";
import { getPrefs } from "@/lib/i18n/server";
import { dict } from "@/lib/i18n/dictionary";
import { listFavorites } from "@/services/favorites";
import { toItems, counts, filterFavorites, paginate, type FavoriteItem } from "@/lib/favorites";
import { fetchMarkets } from "@/services/market/coingecko";
import { fetchForexPairs } from "@/services/market/forex";
import type { Asset } from "@/services/market/types";
import { clock, pct, priceText, relTime } from "@/lib/format";
import { isStale } from "@/lib/freshness";
import { newsCategory } from "@/services/news/categories";
import { RefreshButton } from "@/features/home/RefreshButton";
import type { FavoritesParams } from "@/schemas/favoritesPage";
import { FavoritesToolbar } from "./FavoritesToolbar";
import { FavoritesList, type ViewItem } from "./FavoritesList";

const PAGE_SIZE = 20;
export const favHref = (p: Partial<FavoritesParams>) => {
  const u = new URLSearchParams();
  if (p.type && p.type !== "all") u.set("type", p.type); if (p.q) u.set("q", p.q); if (p.page && p.page > 1) u.set("page", String(p.page));
  const s = u.toString(); return s ? `/favoritos?${s}` : "/favoritos";
};
const FOREX_ID = /^usd-[a-z]{3}$/;

/** Cotações atuais (quando o provedor responde) dos ativos exibidos na página; falha do provedor nunca derruba a lista. */
async function liveAssets(ids: string[]): Promise<Map<string, Asset>> {
  const out = new Map<string, Asset>();
  const crypto = ids.filter((i) => !FOREX_ID.test(i)), fx = ids.filter((i) => FOREX_ID.test(i));
  await Promise.all([
    crypto.length ? fetchMarkets({ ids: crypto }).then((r) => r.items.forEach((a) => out.set(a.id, a))).catch(() => {}) : null,
    fx.length ? fetchForexPairs().then((l) => l.forEach((a) => out.set(a.id, a))).catch(() => {}) : null,
  ]);
  return out;
}

export async function FavoritesContent({ userId, p }: { userId: string; p: FavoritesParams }) {
  const { lang, tr } = await getPrefs(); const d = dict[lang]; const labels = d as unknown as Record<string, string>;
  const r = await listFavorites(userId);
  if (!r.ok) return (<div className="note" role="alert"><p>{tr("fv.loadFail")}</p><RefreshButton labels={{ idle: d["err.retry"], busy: d["home.refreshing"], fail: d["home.refreshFail"], wait: d["home.refreshWait"] }} /></div>);
  const all = toItems(r.rows), c = counts(all);
  const filtered = filterFavorites(all, p.type, p.q), pg = paginate(filtered, p.page, PAGE_SIZE);
  const live = await liveAssets(pg.items.filter((i): i is Extract<FavoriteItem, { kind: "asset" }> => i.kind === "asset").map((i) => i.id));
  const view: ViewItem[] = pg.items.map((i): ViewItem => {
    const saved = relTime(i.createdAt, lang);
    if (i.kind === "asset") {
      const a = live.get(i.id);
      return { kind: "asset", id: i.id, title: a?.symbol ?? i.symbol ?? i.id, name: a?.name ?? i.name ?? "", saved,
        live: a ? { price: priceText(a, lang), change: pct(a.changePct24h, lang), tone: a.changePct24h === null ? "" : a.changePct24h >= 0 ? "up" : "dn", meta: `${tr("home.updated")}: ${clock(a.updatedAt, lang)} · ${tr("home.source")}: ${a.source}`, stale: isStale(a.updatedAt, Date.now(), a.staleAfterMs) } : null };
    }
    return { kind: "news", id: i.id, title: i.title ?? i.id, source: i.source, published: i.publishedAt ? clock(i.publishedAt, lang) : null, saved, url: i.url, category: i.category ? newsCategory(i.category as never)?.label[lang] ?? null : null };
  });
  const dirty = !!p.q || p.type !== "all";
  const tabs: [FavoritesParams["type"], string, number][] = [["all", "fv.tab.all", c.all], ["asset", "fv.tab.asset", c.asset], ["news", "fv.tab.news", c.news]];
  return (<>
    <nav className="row" aria-label="Tipos">{tabs.map(([k, label, n]) => (<Link key={k} href={favHref({ type: k, q: p.q })} className={`pill ${p.type === k ? "on" : ""}`} aria-current={p.type === k ? "page" : undefined} style={{ textDecoration: "none" }}>{tr(label as never)} <FavCount kind={k as "all" | "asset" | "news"} initial={n as number} testid={`count-${k}`} /></Link>))}</nav>
    <FavoritesToolbar q={p.q} dirty={dirty} labels={{ search: d["fv.search"], clear: d["mk.clear"], clearAll: d["fv.clear"] }} />
    {c.all === 0 ? (<div className="card" style={{ textAlign: "center", padding: 32 }} data-testid="fv-empty"><h2>{tr("fv.empty")}</h2><p className="mt">{tr("fv.emptyHint")}</p>
      <div className="row" style={{ justifyContent: "center" }}><Link href="/mercado" className="btn" style={{ textDecoration: "none" }}>{tr("fv.toMarket")}</Link><Link href="/noticias" className="btn s" style={{ textDecoration: "none" }}>{tr("fv.toNews")}</Link></div></div>)
      : filtered.length === 0 ? (<div className="note" role="status" data-testid="fv-noresults"><p>{tr("fv.noResults")}</p><Link href="/favoritos" className="btn s" style={{ textDecoration: "none" }}>{tr("fv.clear")}</Link></div>)
      : (<><FavoritesList key={`${p.type}|${p.q}|${pg.page}`} items={view} labels={labels} />
        {pg.pages > 1 && (<nav className="row" aria-label="Paginação" style={{ justifyContent: "center" }}>
          {pg.page > 1 ? <Link className="btn s" href={favHref({ ...p, page: pg.page - 1 })}>← {tr("mk.prev")}</Link> : <span className="btn s" aria-disabled="true" style={{ opacity: 0.4 }}>← {tr("mk.prev")}</span>}
          <span className="mt">{tr("mk.page", { n: String(pg.page) })} / {pg.pages}</span>
          {pg.page < pg.pages ? <Link className="btn s" href={favHref({ ...p, page: pg.page + 1 })}>{tr("mk.next")} →</Link> : <span className="btn s" aria-disabled="true" style={{ opacity: 0.4 }}>{tr("mk.next")} →</span>}</nav>)}</>)}
  </>);
}
