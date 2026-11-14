import Link from "next/link";
import { getPrefs } from "@/lib/i18n/server";
import { getSessionUser } from "@/services/session";
import { dict } from "@/lib/i18n/dictionary";
import { Icon } from "@/components/ui/Icon";
import { MainChart, Featured, NewsBlock, Fallback, Suspense } from "@/features/home/blocks";
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
      <section className="card hero-card" aria-label={tr("home.summary")}><Suspense fallback={Fallback.Chart}><MainChart /></Suspense></section>
      <nav className="qa2" aria-label={tr("home.shortcuts")}>
        {([["market", "/mercado", "nav.market"], ["news", "/noticias", "nav.news"], ["star", "/favoritos", "home.qa.fav"], ["bell", "/notificacoes", "home.qa.notif"], ["learn", "/aprender", "nav.learn"], ["vip", "/vip", "nav.vip"]] as const).map(([ic, href, k]) => (
          <Link key={href} href={href}><Icon name={ic} size={22} /><span>{tr(k)}</span></Link>))}
      </nav>
      <div className="hg">
        <div className="card"><div className="row sp"><h2>{tr("home.today")}</h2><Link href="/mercado" className="src" style={{ fontWeight: 600, color: "var(--g-tx)", textDecoration: "none" }}>{tr("home.seeMarket")} →</Link></div><Suspense fallback={Fallback.List}><Featured /></Suspense></div>
        <div className="card"><div className="row sp"><h2>{tr("home.news")}</h2><Link href="/noticias" className="src" style={{ fontWeight: 600, color: "var(--g-tx)", textDecoration: "none" }}>{tr("home.seeAll")} →</Link></div><Suspense fallback={Fallback.List}><NewsBlock /></Suspense></div>
      </div>
      <div className="vipc row sp" style={{ gap: 16 }}><div className="row" style={{ gap: 14, flexWrap: "nowrap" }}><span className="crown" aria-hidden="true" style={{ margin: 0 }}><Icon name="vip" size={18} /></span><div><b style={{ fontSize: 16, display: "block" }}>{tr("home.vipSoon")}</b><span style={{ opacity: 0.8 }}>{tr("home.vipText")}</span></div></div><Link href="/vip" className="btn" style={{ width: "auto" }}>{tr("home.learnMore")}</Link></div>
      <p className="src">{tr("demoNone")}</p>
    </>
  );
}
