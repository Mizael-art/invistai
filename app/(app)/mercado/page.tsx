import Link from "next/link";
import { Suspense } from "react";
import { getPrefs } from "@/lib/i18n/server";
import { dict } from "@/lib/i18n/dictionary";
import { CATEGORIES } from "@/services/market/categories";
import { parseMarketParams } from "@/schemas/market";
import { MarketToolbar } from "@/features/market/MarketToolbar";
import { MarketResults, MarketTicker, hrefFor } from "@/features/market/MarketResults";
import { Skeleton } from "@/features/home/blocks";
import { RefreshButton } from "@/features/home/RefreshButton";

export default async function Mercado({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = parseMarketParams(await searchParams);
  const { lang, tr } = await getPrefs(); const d = dict[lang];
  const dirty = !!p.q || p.filter !== "all" || p.sort !== "rank";
  const key = JSON.stringify(p);
  return (<>
    <div className="row sp">
      <div><h1>{tr("mk.title")}</h1><p className="mt">{tr("mk.sub")}</p></div>
      <div className="row"><Link href="/favoritos" className="btn s" style={{ textDecoration: "none" }}>★ {tr("mk.favorites")}</Link>
        <RefreshButton labels={{ idle: d["home.refresh"], busy: d["home.refreshing"], fail: d["home.refreshFail"], wait: d["home.refreshWait"] }} /></div>
    </div>
    <nav className="row" style={{ overflowX: "auto", flexWrap: "nowrap" }} aria-label="Categorias">
      {CATEGORIES.map((c) => (
        <Link key={c.key} href={hrefFor({ cat: c.key })} className={`pill ${p.cat === c.key ? "on" : ""}`} aria-current={p.cat === c.key ? "page" : undefined} style={{ whiteSpace: "nowrap", textDecoration: "none", opacity: c.provider ? 1 : 0.7 }}>
          {c.label[lang]}{!c.provider && <span className="bd a stale">{tr("mk.pendingTag")}</span>}
        </Link>))}
    </nav>
    <Suspense key={`t${p.cat}`} fallback={<Skeleton h={90} />}><MarketTicker p={p} /></Suspense>
    <MarketToolbar q={p.q} filter={p.filter} dirty={dirty} labels={{ search: d["mk.search"], clear: d["mk.clear"], filter: d["mk.filter"], all: d["mk.f.all"], up: d["mk.f.up"], down: d["mk.f.down"], clearAll: d["mk.clearAll"] }} />
    <Suspense key={key} fallback={<Skeleton h={420} />}><MarketResults p={p} /></Suspense>
  </>);
}
