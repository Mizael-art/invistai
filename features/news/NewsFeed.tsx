import Link from "next/link";
import { getPrefs } from "@/lib/i18n/server";
import { dict, type Key } from "@/lib/i18n/dictionary";
import { getFeed, filterNews, ALL_CATEGORIES } from "@/services/news/feed";
import { newsCategory } from "@/services/news/categories";
import { getSessionUser } from "@/services/session";
import { listFavoriteIds } from "@/services/favorites";
import { getNewsCategories } from "@/services/preferences";
import { clock, relTime } from "@/lib/format";
import { FavoriteButton } from "@/features/home/FavoriteButton";
import { RefreshButton } from "@/features/home/RefreshButton";
import { ShareButton } from "@/components/ui/ShareButton";
import type { NewsParams } from "@/schemas/news";
import type { NewsCategory } from "@/services/news/types";

export const newsHref = (p: Partial<NewsParams>) => {
  const u = new URLSearchParams();
  if (p.cat && p.cat !== "all") u.set("cat", p.cat);
  if (p.q) u.set("q", p.q);
  if (p.page && p.page > 1) u.set("page", String(p.page));
  const s = u.toString(); return s ? `/noticias?${s}` : "/noticias";
};

export async function resolveCategories(p: NewsParams, userId?: string): Promise<NewsCategory[]> {
  if (p.cat === "mine") { const m = userId ? await getNewsCategories(userId) : []; return m.length ? m : ALL_CATEGORIES; }
  return p.cat === "all" ? ALL_CATEGORIES : [p.cat];
}

export async function NewsFeed({ p }: { p: NewsParams }) {
  const { lang, tr } = await getPrefs(); const d = dict[lang];
  const user = await getSessionUser();
  const cats = await resolveCategories(p, user?.id);
  const r = await getFeed(cats, lang, p.page);
  const retry = <RefreshButton labels={{ idle: d["err.retry"], busy: d["home.refreshing"], fail: d["home.refreshFail"], wait: d["home.refreshWait"] }} />;
  if (!r.ok) return (<div className="note" role="status"><p>{tr(`err.${r.error}` as Key)}</p>{r.error !== "not_configured" && retry}</div>);
  const items = filterNews(r.data.items, p.q);
  const favs = user ? await listFavoriteIds(user.id, "news") : new Set<string>();
  const fl = { add: d["fav.add"], remove: d["fav.remove"], login: d["fav.login"], notConfigured: d["fav.notConfigured"], fail: d["fav.fail"] };
  const sl = { share: d["as.share"], copied: d["as.copied"], fail: d["as.shareFail"] };
  return (<>
    {r.data.failed.length > 0 && <div className="note" role="status"><p>{tr("nw.partial", { list: r.data.failed.map((c) => newsCategory(c).label[lang]).join(", ") })}</p>{retry}</div>}
    {r.data.items.length === 0 ? <div className="note" role="status">{tr("news.empty")}</div>
      : items.length === 0 ? <div className="note" role="status">{tr("nw.noResults")}</div>
      : (<div className="news-grid">{items.map((n, idx) => (
        <article key={n.id} className={`card news-card${idx === 0 && n.imageUrl ? " lead" : ""}`} data-ts={Date.parse(n.publishedAt)} data-cat={n.category}>
          {n.imageUrl && <div className="news-img"><img src={n.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />{n.category && <span className="bd">{newsCategory(n.category).label[lang]}</span>}</div>}
          <div className="row sp" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {n.category && !n.imageUrl && <span className="bd">{newsCategory(n.category).label[lang]}</span>}
              <h2 style={{ margin: "10px 0 6px", fontSize: 16, lineHeight: 1.35 }}><a href={n.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>{n.title}</a></h2>
              <p className="src">{n.source} · <time dateTime={n.publishedAt} title={clock(n.publishedAt, lang)}>{relTime(n.publishedAt, lang)}</time></p>
            </div>
            <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
              <ShareButton url={n.url} title={n.title} labels={sl} />
              <FavoriteButton itemType="news" itemId={n.id} initial={favs.has(n.id)} labels={fl} metadata={{ title: n.title, source: n.source, url: n.url, publishedAt: n.publishedAt, ...(n.category ? { category: n.category } : {}) }} />
            </div>
          </div>
          <a className="btn s" href={n.url} target="_blank" rel="noopener noreferrer" style={{ marginTop: 14, alignSelf: "flex-start", minHeight: 36 }}>{tr("nw.read")} ↗</a>
        </article>))}</div>)}
    <p className="src">{tr("nw.scope")} {tr("nw.rights")}</p>
    {(p.page > 1 || r.data.hasNext) && (<nav className="row" aria-label="Paginação" style={{ justifyContent: "center" }}>
      {p.page > 1 ? <Link className="btn s" href={newsHref({ ...p, page: p.page - 1 })}>← {tr("mk.prev")}</Link> : <span className="btn s" aria-disabled="true" style={{ opacity: .4 }}>← {tr("mk.prev")}</span>}
      <span className="mt">{tr("mk.page", { n: String(p.page) })}</span>
      {r.data.hasNext ? <Link className="btn s" href={newsHref({ ...p, page: p.page + 1 })}>{tr("mk.next")} →</Link> : <span className="btn s" aria-disabled="true" style={{ opacity: .4 }}>{tr("mk.next")} →</span>}
    </nav>)}
  </>);
}
