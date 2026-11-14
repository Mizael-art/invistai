import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getPrefs } from "@/lib/i18n/server";
import { dict, type Key } from "@/lib/i18n/dictionary";
import { getAssetDetail, type AssetDetail } from "@/services/market/detail";
import { getAssetNews } from "@/services/news";
import { tradingViewSymbol } from "@/services/market/tradingview";
import { getSessionUser } from "@/services/session";
import { listFavoriteIds } from "@/services/favorites";
import { categoryOf } from "@/services/market/categories";
import { clock, compactMoney, compactNum, num, pct, priceText, relTime } from "@/lib/format";
import { isStale } from "@/lib/freshness";
import { Coin } from "@/components/ui/Coin";
import { LineChart } from "@/components/ui/LineChart";
import { RefreshButton } from "@/features/home/RefreshButton";
import { Skeleton } from "@/features/home/blocks";
import { TradingViewChart } from "./TradingViewChart";
import { AssetActions } from "./AssetActions";
import { computeInsights } from "./insights";

export async function AssetView({ id }: { id: string }) {
  const { lang, theme, tr } = await getPrefs(); const d = dict[lang];
  const r = await getAssetDetail(id);
  if (!r.ok) return (<><h1 style={{ fontSize: 26 }}>{id.slice(0, 60)}</h1><div className="note" role="status"><p>{tr(`err.${r.error}` as Key)}</p>{r.error !== "not_configured" && <RefreshButton labels={{ idle: d["err.retry"], busy: d["home.refreshing"], fail: d["home.refreshFail"], wait: d["home.refreshWait"] }} />}</div></>);
  if (!r.data) notFound();
  const { asset: a, coin, coinError, range } = r.data;
  const user = await getSessionUser(); const favs = user ? await listFavoriteIds(user.id, "asset") : new Set<string>();
  const tv = tradingViewSymbol(a);
  const up = a.changePct24h === null ? "" : a.changePct24h >= 0 ? "up" : "dn";
  const fl = { add: d["fav.add"], remove: d["fav.remove"], login: d["fav.login"], notConfigured: d["fav.notConfigured"], fail: d["fav.fail"] };
  const sym = a.symbol.replace("USD/", "");
  return (<>
    <div className="card"><div className="row sp" style={{ alignItems: "flex-start" }}>
      <div>
        <div className="row"><Coin symbol={sym} /><h1 style={{ fontSize: 26 }}>{a.symbol}</h1><span className="mt">{a.name}</span></div>
        <div className="row" style={{ margin: "8px 0" }}><span className="bd">{categoryOf(a.category).label[lang]}</span><span className="bd v">{tr("as.currency")}: {a.quote ?? a.currency}</span></div>
        <p className="num" style={{ fontSize: 32, margin: 0 }}>{priceText(a, lang)} <span className={up} style={{ fontSize: 18 }}>{pct(a.changePct24h, lang)}</span></p>
        <p className="src">{tr("home.updated")}: {clock(a.updatedAt, lang)} ({relTime(a.updatedAt, lang)}) · {tr("home.source")}: {a.source}{isStale(a.updatedAt, Date.now(), a.staleAfterMs) && <span className="bd a stale">{tr("home.stale")}</span>}</p>
      </div>
      <AssetActions id={a.id} initialFav={favs.has(a.id)} title={`${a.symbol} — TRADEON`} labels={{ share: d["as.share"], copied: d["as.copied"], shareFail: d["as.shareFail"] }} fav={fl} metadata={{ symbol: a.symbol, name: a.name, category: a.category }} />
    </div></div>
    <nav className="row" aria-label="Seções">{([["grafico", "as.sec.chart"], ["dados", "as.sec.data"], ["noticias", "as.sec.news"], ["analise", "as.sec.analysis"]] as const).map(([h, k]) => <a key={h} className="chip" href={`#${h}`}>{tr(k)}</a>)}</nav>

    <section id="grafico" className="card anchor" aria-label={tr("as.sec.chart")}>
      <h2>{tr("as.sec.chart")}</h2>
      {tv ? <TradingViewChart symbol={tv} theme={theme} lang={lang} labels={{ loading: d["as.chart.loading"], failed: d["as.chart.failed"], retry: d["as.chart.retry"], period: d["as.period"], type: d["as.type"], candles: d["as.style.candles"], line: d["as.style.line"], attrib: d["as.chart.attrib"], p1D: d["as.p.1D"], p5D: d["as.p.5D"], p1M: d["as.p.1M"], p6M: d["as.p.6M"], p1A: d["as.p.1A"], pALL: d["as.p.ALL"] }} />
        : (<><p className="note" role="status">{tr("as.chart.unsupported")}</p><LineChart values={a.sparkline} label={`${a.name} — 7d`} /></>)}
    </section>

    <section id="dados" className="card anchor" aria-label={tr("as.data.title")}>
      <h2>{tr("as.data.title")}</h2>
      <div className="metrics">
        {a.category === "forex" ? (range ? (<>
          <div><small>{tr("as.m.rangeHigh")}</small><b className="num">{num(range.high, lang, 4)} {a.quote}</b></div>
          <div><small>{tr("as.m.rangeLow")}</small><b className="num">{num(range.low, lang, 4)} {a.quote}</b></div></>) : null) : (<>
          <Metric l={tr("as.m.cap")} v={coin?.marketCap != null ? compactMoney(coin.marketCap, lang) : null} />
          <Metric l={tr("as.m.vol")} v={coin?.volume24h != null ? compactMoney(coin.volume24h, lang) : null} />
          <Metric l={tr("as.m.high24")} v={coin?.high24h != null ? compactMoney(coin.high24h, lang) : null} />
          <Metric l={tr("as.m.low24")} v={coin?.low24h != null ? compactMoney(coin.low24h, lang) : null} />
          <Metric l={tr("as.m.ath")} v={coin?.ath != null ? compactMoney(coin.ath, lang) : null} />
          <Metric l={tr("as.m.circ")} v={coin?.circulating != null ? compactNum(coin.circulating, lang) : null} /></>)}
      </div>
      {range && <p className="src">{tr("as.m.rangeNote", { n: String(range.days) })}</p>}
      {coinError && <p className="note" role="status">{tr("as.coinFail")}</p>}
      {coin && <><h2 style={{ marginTop: 18 }}>{tr("as.desc")}</h2><p>{coin.description ?? tr("as.noDesc")}</p><p className="src">{tr("as.descSource")} {coin.categories.length > 0 && coin.categories.join(" · ")}</p></>}
    </section>

    <section id="noticias" className="card anchor" aria-label={tr("as.sec.news")}>
      <h2>{tr("as.sec.news")}</h2><p className="src">{tr("as.news.hint")}</p>
      <Suspense fallback={<Skeleton h={140} />}><RelatedNews a={r.data} /></Suspense>
    </section>

    <section id="analise" className="card anchor" aria-label={tr("as.an.title")}><Analysis d={r.data} /></section>
  </>);
}
const Metric = ({ l, v }: { l: string; v: string | null }) => (<div><small>{l}</small><b className="num">{v ?? "—"}</b></div>);

async function RelatedNews({ a }: { a: AssetDetail }) {
  const { lang, tr } = await getPrefs();
  const r = await getAssetNews(a.asset.category === "forex" ? a.asset.symbol.replace("/", " ") : a.asset.name, lang);
  if (!r.ok) return <div className="note" role="status"><p>{tr(`err.${r.error}` as Key)}</p></div>;
  if (r.data.length === 0) return <p className="note">{tr("news.empty")}</p>;
  return (<>{r.data.map((n) => (<div key={n.id} className="lrow"><div style={{ flex: 1 }}><a href={n.url} target="_blank" rel="noopener noreferrer">{n.title}</a><br /><span className="src">{n.source} · {relTime(n.publishedAt, lang)}</span></div></div>))}</>);
}

async function Analysis({ d }: { d: AssetDetail }) {
  const { lang, tr } = await getPrefs();
  const a = d.asset, ins = computeInsights(a.sparkline, a.category === "forex" ? 5 : 24);
  const windowLabel = a.category === "forex" ? `${a.sparkline.length}d` : "7d";
  return (<>
    <h2>{tr("as.an.title")}</h2>
    <p className="note">{tr("as.an.origin")}</p>
    {!ins ? <p>{tr("as.an.insufficient")}</p> : (<div className="metrics" style={{ margin: "12px 0" }}>
      <div><small>{tr("as.an.trend")}</small><b>{tr(`as.an.t.${ins.trend}` as Key)}</b></div>
      <div><small>{tr("as.an.change")} ({windowLabel})</small><b className={`num ${ins.changePeriodPct >= 0 ? "up" : "dn"}`}>{pct(ins.changePeriodPct, lang)}</b></div>
      <div><small>{tr("as.an.range")}</small><b className="num">{num(ins.positionInRangePct, lang, 0)}%</b></div>
      <div><small>{tr("as.an.avg")}</small><b>{tr(ins.aboveAverage ? "as.an.above" : "as.an.below")}</b></div>
      <div><small>{tr("as.an.vol")}</small><b className="num">{num(ins.volatilityPct, lang, 2)}%</b></div>
      <div><small>{tr("as.an.points")}</small><b className="num">{ins.points}</b></div></div>)}
    <p className="src">{tr("home.source")}: {a.source} · {tr("as.an.window")}: {windowLabel} · {tr("as.an.computed")}: {clock(new Date().toISOString(), lang)}</p>
    <h2 style={{ marginTop: 16 }}>{tr("as.an.explainTitle")}</h2><p>{tr("as.an.explain")}</p>
    <h2 style={{ marginTop: 16 }}>{tr("as.an.risksTitle")}</h2><p>{tr("as.an.risks")}</p>
    <p className="note" role="status">{tr("as.an.ai")}</p><p className="note" role="status">{tr("as.an.team")}</p>
  </>);
}
