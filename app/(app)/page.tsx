import Link from "next/link";
import { getPrefs } from "@/lib/i18n/server";
import { getSessionUser } from "@/services/session";
import { dict } from "@/lib/i18n/dictionary";
import { Icon } from "@/components/ui/Icon";
import { Indicators, MainChart, Featured, NewsBlock, Fallback, Suspense } from "@/features/home/blocks";
import { RefreshButton } from "@/features/home/RefreshButton";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams; const confirmed = sp.email_confirmed === "1";
  const { lang, tr } = await getPrefs();
  const user = await getSessionUser();
  const first = user?.name?.trim().split(/\s+/)[0];
  const d = dict[lang];
  return (
    <>
      {confirmed && <div className="note" role="status" data-testid="email-confirmed">✔ {tr("home.emailConfirmed")}</div>}
      <div className="page-h">
        <div>
          <h1>{first ? tr("home.hello", { name: first }) : tr("home.helloGuest")}</h1>
          <p className="mt" style={{ margin: "6px 0 0" }}>{tr("home.sub")}</p>
        </div>
        <RefreshButton labels={{ idle: d["home.refresh"], busy: d["home.refreshing"], fail: d["home.refreshFail"], wait: d["home.refreshWait"] }} />
      </div>
      <section aria-label={tr("home.summary")}><h2 className="eyebrow">{tr("home.summary")}</h2><Suspense fallback={Fallback.Indicators}><Indicators /></Suspense></section>
      <div className="hg">
        <div className="card"><Suspense fallback={Fallback.Chart}><MainChart /></Suspense></div>
        <div className="card"><div className="row sp"><h2>{tr("home.featured")}</h2><Link href="/mercado" className="src" style={{ fontWeight: 600 }}>{tr("home.seeMarket")} →</Link></div><Suspense fallback={Fallback.List}><Featured /></Suspense></div>
        <div className="card"><div className="row sp"><h2>{tr("home.news")}</h2><Link href="/noticias" className="src" style={{ fontWeight: 600 }}>{tr("home.seeAll")} →</Link></div><Suspense fallback={Fallback.List}><NewsBlock /></Suspense></div>
        <div className="vipc"><span className="crown" aria-hidden="true"><Icon name="vip" size={18} /></span><b style={{ fontSize: 17, display: "block", letterSpacing: "-.01em" }}>{tr("home.vipSoon")}</b><p style={{ margin: "6px 0 16px", opacity: 0.8 }}>{tr("home.vipText")}</p><Link href="/vip" className="btn">{tr("home.learnMore")}</Link></div>
      </div>
      <section aria-label={tr("home.shortcuts")}><h2 className="eyebrow">{tr("home.shortcuts")}</h2>
        <div className="qa">
          {([["market", "/mercado", "nav.market", "sc.market"], ["news", "/noticias", "nav.news", "sc.news"], ["learn", "/aprender", "nav.learn", "sc.learn"], ["vip", "/vip", "nav.vip", "sc.vip"]] as const).map(([ic, href, k, s]) => (
            <Link key={href} href={href} className="card"><Icon name={ic} size={22} /><b>{tr(k)}</b><span className="src">{tr(s)}</span></Link>))}
        </div>
      </section>
      <p className="src">{tr("demoNone")}</p>
    </>
  );
}
