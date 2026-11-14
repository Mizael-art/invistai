import Link from "next/link";
import { getPrefs } from "@/lib/i18n/server";
import { dict, type Key } from "@/lib/i18n/dictionary";
import { queryMarket, applyFilterSort } from "@/services/market/query";
import { categoryOf } from "@/services/market/categories";
import { getSessionUser } from "@/services/session";
import { listFavoriteIds } from "@/services/favorites";
import { clock, pct, priceText } from "@/lib/format";
import { isStale } from "@/lib/freshness";
import { Coin } from "@/components/ui/Coin";
import { Spark } from "@/components/ui/LineChart";
import { FavoriteButton } from "@/features/home/FavoriteButton";
import { RefreshButton } from "@/features/home/RefreshButton";
import type { MarketParams } from "@/schemas/market";

export const hrefFor = (p: Partial<MarketParams>) => {
  const u = new URLSearchParams();
  if (p.cat && p.cat !== "crypto_spot") u.set("cat", p.cat);
  if (p.q) u.set("q", p.q);
  if (p.sort && p.sort !== "rank") { u.set("sort", p.sort); u.set("dir", p.dir ?? "desc"); }
  if (p.filter && p.filter !== "all") u.set("filter", p.filter);
  if (p.page && p.page > 1) u.set("page", String(p.page));
  const s = u.toString(); return s ? `/mercado?${s}` : "/mercado";
};

export async function MarketTicker({ p }: { p: MarketParams }) {
  const { lang } = await getPrefs(); const r = await queryMarket({ ...p, q: "", page: 1 });
  if (!r.ok || r.data.items.length === 0) return null;
  return (<div className="tick" aria-label="Destaques">{r.data.items.slice(0, 5).map((a) => (
    <Link key={a.id} href={`/mercado/${a.id}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
      <div className="row"><Coin symbol={a.symbol.replace("USD/", "")} /><b>{a.symbol}</b></div>
      <span className="num">{priceText(a, lang)}</span><br /><span className={`num ${a.changePct24h === null ? "" : a.changePct24h >= 0 ? "up" : "dn"}`}>{pct(a.changePct24h, lang)}</span>
    </Link>))}</div>);
}

export async function MarketResults({ p }: { p: MarketParams }) {
  const { lang, tr } = await getPrefs(); const d = dict[lang];
  const def = categoryOf(p.cat);
  if (!def.provider) return (<div className="note" role="status"><p><b>{def.label[lang]}</b> — {tr("mk.pending")}</p><p className="src">{def.pendingHint}</p></div>);
  const r = await queryMarket(p);
  if (!r.ok) return (<div className="note" role="status"><p>{tr(`err.${r.error}` as Key)}</p>{r.error !== "not_configured" && <RefreshButton labels={{ idle: d["err.retry"], busy: d["home.refreshing"], fail: d["home.refreshFail"], wait: d["home.refreshWait"] }} />}</div>);
  if (r.data.items.length === 0) return <div className="note" role="status">{tr("mk.empty")}</div>;
  const rows = applyFilterSort(r.data.items, p.filter, p.sort, p.dir);
  const user = await getSessionUser(); const favs = user ? await listFavoriteIds(user.id, "asset") : new Set<string>();
  const fl = { add: d["fav.add"], remove: d["fav.remove"], login: d["fav.login"], notConfigured: d["fav.notConfigured"], fail: d["fav.fail"] };
  const th = (key: MarketParams["sort"], label: Key) => {
    const on = p.sort === key, next = on ? (p.dir === "desc" ? "asc" : "desc") : key === "name" ? "asc" : "desc";
    return (<th aria-sort={on ? (p.dir === "asc" ? "ascending" : "descending") : "none"}><Link href={hrefFor({ ...p, sort: key, dir: next, page: 1 })} style={{ color: "inherit", textDecoration: "none" }}>{tr(label)} {on ? (p.dir === "asc" ? "↑" : "↓") : "↕"}</Link></th>);
  };
  const offset = (p.page - 1) * 25;
  return (<>
    {rows.length === 0 ? <div className="note" role="status">{tr("mk.emptyFilter")}</div> : (
      <div className="card tw"><table>
        <thead><tr><th className="hm">#</th>{th("name", "mk.col.asset")}{th("price", "mk.col.price")}{th("change", "mk.col.change")}<th className="hm">{tr("mk.col.chart")}</th><th className="hm">{tr("mk.col.time")}</th><th><span className="sr">{tr("mk.fav")}</span></th></tr></thead>
        <tbody>{rows.map((a, i) => (
          <tr key={a.id}><td className="mt hm">{offset + i + 1}</td>
            <td><Link href={`/mercado/${a.id}`} className="row" style={{ textDecoration: "none", color: "inherit", flexWrap: "nowrap", gap: 10 }}><Coin symbol={a.symbol.replace("USD/", "")} /><div><b>{a.symbol}</b><br /><span className="mt" style={{ fontSize: 12 }}>{a.name}</span></div></Link></td>
            <td className="num">{priceText(a, lang)}</td>
            <td className={`num ${a.changePct24h === null ? "" : a.changePct24h >= 0 ? "up" : "dn"}`}>{pct(a.changePct24h, lang)}</td>
            <td className="hm" style={{ width: 110 }}><Spark values={a.sparkline} up={a.sparkline.length > 1 && a.sparkline[a.sparkline.length - 1] >= a.sparkline[0]} /></td>
            <td className="hm src">{clock(a.updatedAt, lang)}{isStale(a.updatedAt, Date.now(), a.staleAfterMs) && <span className="bd a stale">{tr("home.stale")}</span>}</td>
            <td><FavoriteButton itemType="asset" itemId={a.id} initial={favs.has(a.id)} labels={fl} metadata={{ symbol: a.symbol, name: a.name, category: a.category }} /></td></tr>))}</tbody>
      </table></div>)}
    <p className="src">{tr(p.cat === "forex" ? "mk.forexNote" : "mk.cryptoNote")} {tr("mk.scope")} {p.q && p.cat === "crypto_spot" ? tr("mk.searchLimit") : ""}</p>
    {!p.q && (p.page > 1 || r.data.hasNext) && (
      <nav className="row" aria-label="Paginação" style={{ justifyContent: "center" }}>
        {p.page > 1 ? <Link className="btn s" href={hrefFor({ ...p, page: p.page - 1 })}>← {tr("mk.prev")}</Link> : <span className="btn s" aria-disabled="true" style={{ opacity: .4 }}>← {tr("mk.prev")}</span>}
        <span className="mt">{tr("mk.page", { n: String(p.page) })}</span>
        {r.data.hasNext ? <Link className="btn s" href={hrefFor({ ...p, page: p.page + 1 })}>{tr("mk.next")} →</Link> : <span className="btn s" aria-disabled="true" style={{ opacity: .4 }}>{tr("mk.next")} →</span>}
      </nav>)}
  </>);
}
