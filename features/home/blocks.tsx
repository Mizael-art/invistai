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

export async function Indicators() {
  const { lang, tr } = await getPrefs(); const r = await getTopCrypto();
  if (!r.ok) return <ProviderNotice code={r.error} />;
  const top = r.data.slice(0, 4);
  return (<div className="hg-i" style={{ display: "grid", gap: 10 }}>
    <div className="g4">{top.map((a) => (
      <Link key={a.id} href="/mercado" className="card stat">
        <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}><Coin symbol={a.symbol} /><div style={{ minWidth: 0 }}><b>{a.symbol}</b><div className="src" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div></div></div>
        <div><div className="num big">{money(a.price, lang)}</div><span className={`num ${a.changePct24h === null ? "mt" : a.changePct24h >= 0 ? "up" : "dn"}`} style={{ fontSize: 13 }}>{pct(a.changePct24h, lang)} <span className="mt" style={{ fontWeight: 500 }}>{tr("ch.chg24h")}</span></span></div>
      </Link>))}</div>
    <div className="row sp" style={{ gap: 6 }}><Meta updatedAt={top[0]?.updatedAt ?? null} source="CoinGecko" lang={lang} tr={tr} /><p className="src">{tr("home.otherMarkets")}</p></div>
  </div>);
}

export async function MainChart() {
  const { lang, tr } = await getPrefs(); const r = await getTopCrypto();
  if (!r.ok) return <ProviderNotice code={r.error} />;
  const btc = r.data.find((a) => a.symbol === "BTC") ?? r.data[0];
  if (!btc) return <p className="note">{tr("home.noData")}</p>;
  const sl = btc.sparkline, ch7 = sl.length > 1 && sl[0] ? ((sl[sl.length - 1] - sl[0]) / sl[0]) * 100 : null;   // derivado da própria série de 7 dias
  return (<>
    <div className="row sp" style={{ alignItems: "flex-start" }}>
      <div style={{ display: "grid", gap: 6 }}>
        <div className="row" style={{ gap: 10 }}><Coin symbol={btc.symbol} /><b style={{ fontSize: 15 }}>{btc.symbol}/USD</b><span className="src">{btc.name}</span></div>
        <div className="row" style={{ gap: 12, alignItems: "baseline" }}><span className="num" style={{ fontSize: 30, letterSpacing: "-.03em" }}>{money(btc.price, lang)}</span>
          {ch7 !== null && <span className={`num ${ch7 >= 0 ? "up" : "dn"}`}>{pct(ch7, lang)} <span className="mt" style={{ fontWeight: 500 }}>{tr("ch.chg7d")}</span></span>}</div>
      </div>
      <span className="bd" style={{ background: "var(--sf2)", color: "var(--mt)" }}>{tr("home.chart")}</span>
    </div>
    <div style={{ marginTop: 18 }}><LineChart values={sl} label={`${btc.name} — ${tr("home.chart")}`} labels={sl.length > 1 ? { max: money(Math.max(...sl), lang), min: money(Math.min(...sl), lang), start: tr("ch.7dAgo"), end: tr("ch.now") } : undefined} /></div>
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
    <div key={a.id} className="lrow"><Coin symbol={a.symbol} /><div style={{ flex: 1, minWidth: 0 }}><b>{a.symbol}</b> <span className="mt">{a.name}</span><div><span className="num">{money(a.price, lang)}</span> <span className={`num ${a.changePct24h === null ? "" : a.changePct24h >= 0 ? "up" : "dn"}`} style={{ fontSize: 13 }}>{pct(a.changePct24h, lang)}</span></div></div>
      <div style={{ width: 72 }} className="hm"><Spark values={a.sparkline} up={a.sparkline.length > 1 && a.sparkline[a.sparkline.length - 1] >= a.sparkline[0]} /></div>
      <FavoriteButton itemType="asset" itemId={a.id} initial={favs.has(a.id)} labels={fl} metadata={{ symbol: a.symbol, name: a.name, category: a.category }} /></div>))}</>);
}

export async function NewsBlock() {
  const { lang, tr } = await getPrefs(); const r = await getLatestNews(lang);
  if (!r.ok) return <ProviderNotice code={r.error} />;
  if (r.data.length === 0) return <p className="note">{tr("news.empty")}</p>;
  return (<>{r.data.map((n) => (
    <div key={n.id} className="lrow"><div style={{ flex: 1, minWidth: 0 }}>
      <a href={n.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, textDecoration: "none", display: "block", lineHeight: 1.4 }}>{n.title}</a><span className="src">{n.source} · {relTime(n.publishedAt, lang)}</span></div></div>))}</>);
}

export const Fallback = { Indicators: <div className="g4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={118} />)}</div>, Chart: <Skeleton h={340} />, List: <Skeleton h={260} /> };
export { Suspense };
