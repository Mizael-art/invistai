import Link from "next/link";
import { Suspense } from "react";
import { getPrefs } from "@/lib/i18n/server";
import { dict } from "@/lib/i18n/dictionary";
import { NEWS_CATEGORIES } from "@/services/news/categories";
import { parseNewsParams } from "@/schemas/news";
import { getSessionUser } from "@/services/session";
import { getNewsCategories } from "@/services/preferences";
import { NewsToolbar } from "@/features/news/NewsToolbar";
import { NewsPrefs } from "@/features/news/NewsPrefs";
import { NewsFeed, newsHref } from "@/features/news/NewsFeed";
import { Skeleton } from "@/features/home/blocks";
import { RefreshButton } from "@/features/home/RefreshButton";

export default async function Noticias({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = parseNewsParams(await searchParams);
  const { lang, tr } = await getPrefs(); const d = dict[lang];
  const user = await getSessionUser(); const mine = user ? await getNewsCategories(user.id) : [];
  const p = raw.cat === "mine" && mine.length === 0 ? { ...raw, cat: "all" as const } : raw;
  const chips = [{ key: "all", label: tr("nw.all") }, ...(mine.length ? [{ key: "mine", label: tr("nw.mine") }] : []), ...NEWS_CATEGORIES.map((c) => ({ key: c.key, label: c.label[lang] }))];
  return (<>
    <div className="row sp">
      <div><h1>{tr("nw.title")}</h1><p className="mt">{tr("nw.sub")}</p></div>
      <RefreshButton labels={{ idle: d["home.refresh"], busy: d["home.refreshing"], fail: d["home.refreshFail"], wait: d["home.refreshWait"] }} />
    </div>
    <nav className="row" style={{ overflowX: "auto", flexWrap: "nowrap" }} aria-label={tr("nw.cats")}>
      {chips.map((c) => (<Link key={c.key} href={newsHref({ cat: c.key as typeof p.cat })} className={`pill ${p.cat === c.key ? "on" : ""}`} aria-current={p.cat === c.key ? "page" : undefined} style={{ whiteSpace: "nowrap", textDecoration: "none" }}>{c.label}</Link>))}
    </nav>
    <NewsToolbar q={p.q} dirty={!!p.q || p.cat !== "all"} labels={{ search: d["nw.search"], clear: d["mk.clear"], clearAll: d["mk.clearAll"] }} />
    <NewsPrefs cats={NEWS_CATEGORIES.map((c) => ({ key: c.key, label: c.label[lang] }))} initial={mine} loggedIn={!!user}
      labels={{ title: d["nw.prefs.title"], hint: d["nw.prefs.hint"], save: d["nw.prefs.save"], saved: d["nw.prefs.saved"], login: d["nw.prefs.login"], notConfigured: d["fav.notConfigured"], fail: d["fav.fail"] }} />
    <Suspense key={JSON.stringify(p)} fallback={<Skeleton h={420} />}><NewsFeed p={p} /></Suspense>
  </>);
}
