import Link from "next/link";
import { Suspense } from "react";
import { getPrefs } from "@/lib/i18n/server";
import { getTopCrypto } from "@/services/market";
import { getLatestNews } from "@/services/news";
import { getSessionUser } from "@/services/session";
import { listFavoriteIds } from "@/services/favorites";
import { clock, money, pct, relTime } from "@/lib/format";
import { isStale } from "@/lib/freshness";
import { Coin } from "@/components/ui/Coin";
import { Chg } from "@/components/ui/Chg";
import { LineChart, Spark } from "@/components/ui/LineChart";
import { FavoriteButton } from "./FavoriteButton";
import { RefreshButton } from "./RefreshButton";
import type { ProviderErrorCode } from "@/services/types";
import type { Key } from "@/lib/i18n/dictionary";
import { dict } from "@/lib/i18n/dictionary";

async function labelsFor() {
  const { lang } = await getPrefs();
  const d = dict[lang];
  return { lang, refresh: { idle: d["err.retry"], busy: d["home.refreshing"], fail: d["home.refreshFail"], wait: d["home.refreshWait"] } };
}
async function ProviderNotice({ code }: { code: ProviderErrorCode }) {
  const { tr } = await getPrefs(); const L = await labelsFor();
  return (<div className="note" role="status"><p>{tr(`err.${code}` as Key)}</p>{code !== "not_configured" && <RefreshButton labels={L.refresh} />}</div>);
}
export const Skeleton = ({ h = 120 }: { h?: number }) => <div className="sk" style={{ height: h }} />;

function Meta({ updatedAt, source, lang, tr }: { updatedAt: string | null; source: string; lang: "pt" | "en"; tr: (k: Key) => string }) {
  return (<p className="src">{tr("home.updated")}: {clock(updatedAt, lang)} · {tr("home.source")}: {source}{isStale(updatedAt) && <span className="bd a stale">{tr("home.stale")}</span>}</p>);
}

/** Destaque do Início (estilo "patrimônio" da referência, com dados reais de mercado): BTC/USD, preço, variação 24h, gráfico de 7 dias e indicadores do período. */
export async function MainChart() {
  const { lang, tr } = await getPrefs(); const r = await getTopCrypto();
  if (!r.ok) return <ProviderNotice code={r.error} />;
  const btc = r.data.find((a) => a.symbol === "BTC") ?? r.data[0];
  if (!btc) return <p className="note">{tr("home.noData")}</p>;
  const sl = btc.sparkline, ch7 = sl.length > 1 && sl[0] ? ((sl[sl.length - 1] - sl[0]) / sl[0]) * 100 : null;   // derivado da própria série de 7 dias
  const hi = sl.length ? Math.max(...sl) : null, lo = sl.length ? Math.min(...sl) : null;
  return (<>
    <div className="hero-top">
      <div className="hero-head">
        <div className="row" style={{ gap: 10 }}><Coin symbol={btc.symbol} /><span className="mt">{tr("home.hero")}</span><b>{btc.symbol}/USD</b></div>
        <div className="row" style={{ gap: 12, alignItems: "center", marginTop: 10 }}><span className="num hero-price">{money(btc.price, lang)}</span><Chg v={btc.changePct24h} lang={lang} title={tr("ch.chg24h")} /></div>
        <span className="bd" style={{ background: "var(--sf2)", color: "var(--mt)", marginTop: 12 }}>{tr("home.chart")}</span>
      </div>
      <div className="hero-chart"><LineChart values={sl} height={200} label={`${btc.name} — ${tr("home.chart")}`} labels={sl.length > 1 ? { max: money(Math.max(...sl), lang), min: money(Math.min(...sl), lang), start: tr("ch.7dAgo"), end: tr("ch.now") } : undefined} /></div>
    </div>
    <div className="hero-kpis">
      <div><small>{tr("home.k.24h")}</small><span className={`num ${btc.changePct24h === null ? "" : btc.changePct24h >= 0 ? "up" : "dn"}`}>{pct(btc.changePct24h, lang)}</span></div>
      <div><small>{tr("home.k.7d")}</small><span className={`num ${ch7 === null ? "" : ch7 >= 0 ? "up" : "dn"}`}>{pct(ch7, lang)}</span></div>
      <div><small>{tr("home.k.hi")}</small><span className="num">{hi === null ? "—" : money(hi, lang)}</span></div>
      <div><small>{tr("home.k.lo")}</small><span className="num">{lo === null ? "—" : money(lo, lang)}</span></div>
    </div>
    <div style={{ marginTop: 12 }}><Meta updatedAt={btc.updatedAt} source="CoinGecko" lang={lang} tr={tr} /></div>
  </>);
}

export async function Featured() {
  const { lang, tr } = await getPrefs(); const r = await getTopCrypto(); const L = await labelsFor();
  if (!r.ok) return <ProviderNotice code={r.error} />;
  const user = await getSessionUser(); const favs = user ? await listFavoriteIds(user.id, "asset") : new Set<string>();
  const d = dict[lang]; const fl = { add: d["fav.add"], remove: d["fav.remove"], login: d["fav.login"], notConfigured: d["fav.notConfigured"], fail: d["fav.fail"] };
  void L;
  return (<>{r.data.slice(0, 5).map((a) => (
    <div key={a.id} className="lrow rowlink" data-asset={a.id}><Coin symbol={a.symbol} /><div style={{ flex: 1, minWidth: 0 }}><Link href={`/mercado/${a.id}`} className="stretch"><b>{a.symbol}</b></Link><div className="src" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div></div>
      <div style={{ textAlign: "right", display: "grid", gap: 3, justifyItems: "end" }}><span className="num">{money(a.price, lang)}</span><Chg v={a.changePct24h} lang={lang} /></div>
      <div style={{ width: 72 }} className="hm"><Spark values={a.sparkline} up={a.sparkline.length > 1 && a.sparkline[a.sparkline.length - 1] >= a.sparkline[0]} /></div>
      <FavoriteButton itemType="asset" itemId={a.id} initial={favs.has(a.id)} labels={fl} metadata={{ symbol: a.symbol, name: a.name, category: a.category }} /></div>))}
    <div style={{ marginTop: 10, display: "grid", gap: 4 }}><Meta updatedAt={r.data[0]?.updatedAt ?? null} source="CoinGecko" lang={lang} tr={tr} /><p className="src">{tr("home.otherMarkets")}</p></div></>);
}

export async function NewsBlock() {
  const { lang, tr } = await getPrefs(); const r = await getLatestNews(lang);
  if (!r.ok) return <ProviderNotice code={r.error} />;
  if (r.data.length === 0) return <p className="note">{tr("news.empty")}</p>;
  return (<>{r.data.map((n) => (
    <div key={n.id} className="lrow"><div style={{ flex: 1, minWidth: 0 }}>
      <a href={n.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, textDecoration: "none", display: "block", lineHeight: 1.4 }}>{n.title}</a><span className="src">{n.source} · {relTime(n.publishedAt, lang)}</span></div>
      {n.imageUrl && <img className="news-thumb" src={n.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />}</div>))}</>);
}

export const Fallback = { Chart: <Skeleton h={380} />, List: <Skeleton h={300} /> };
export { Suspense };
