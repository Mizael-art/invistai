import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrefs } from "@/lib/i18n/server";
import { dict } from "@/lib/i18n/dictionary";
import { getEntitlements } from "@/services/subscription";
import { isAdmin, listCalls } from "@/services/calls";
import { CALL_MARKETS, CallFilters, callStats } from "@/lib/calls";
import { can } from "@/lib/plans";
import { CallCard, sgn } from "@/features/calls/CallCard";
import { Paywall } from "@/features/calls/Paywall";

export const metadata: Metadata = { title: "Calls VIP — TRADEON" };
export const dynamic = "force-dynamic";

/** Calls VIP (PRO/MAX). O banco só devolve calls a quem tem plano pago — o FREE vê o convite de assinatura, nunca os níveis. */
export default async function Calls({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ent = await getEntitlements(); if (!ent) redirect("/login?next=%2Fcalls");
  const { lang } = await getPrefs(); const l = dict[lang] as unknown as Record<string, string>;
  const admin = await isAdmin();
  if (!can(ent.plan, "calls") && !admin) return <Paywall l={l} feature="calls" />;
  const raw = await searchParams; const f = CallFilters.parse({ tab: raw.tab, symbol: raw.symbol ?? "", market: raw.market ?? "", period: raw.period ?? "" });
  const statuses = f.tab === "ativas" ? ["active"] : ["active", "closed", "canceled"];
  const calls = await listCalls({ ...f, statuses: f.tab === "ativas" ? statuses : f.tab === "historico" ? ["closed", "canceled"] : statuses });
  const st = calls ? callStats(calls) : null;
  const qs = (o: Record<string, string>) => { const p = new URLSearchParams({ ...(f.symbol ? { symbol: f.symbol } : {}), ...(f.market ? { market: f.market } : {}), ...(f.period ? { period: f.period } : {}), ...o }); return `/calls?${p}`; };
  return (<>
    <div className="page-h"><div><h1>Calls VIP</h1><p className="mt" style={{ margin: "6px 0 0" }}>{l["cv.sub"]}</p></div>{admin && <Link href="/admin/calls" className="btn s">{l["cv.manage"]}</Link>}</div>
    <nav className="ctabs" aria-label="Calls VIP">{(["ativas", "historico", "resultados"] as const).map((t) => <Link key={t} href={qs({ tab: t })} className={f.tab === t ? "on" : ""} aria-current={f.tab === t ? "page" : undefined}>{l[`cv.tab.${t}`]}</Link>)}</nav>
    <form className="row cv-filters" action="/calls" method="get" role="search">
      <input type="hidden" name="tab" value={f.tab} />
      <label className="sr" htmlFor="cv-sym">{l["cv.f.symbol"]}</label><input id="cv-sym" name="symbol" defaultValue={f.symbol} placeholder={l["cv.f.symbol"]} maxLength={25} />
      <label className="sr" htmlFor="cv-mk">{l["cv.f.market"]}</label><select id="cv-mk" name="market" defaultValue={f.market}><option value="">{l["cv.f.allMarkets"]}</option>{CALL_MARKETS.map((m) => <option key={m} value={m}>{l[`cv.m.${m}`]}</option>)}</select>
      <label className="sr" htmlFor="cv-pd">{l["cv.f.period"]}</label><select id="cv-pd" name="period" defaultValue={f.period}><option value="">{l["cv.f.allTime"]}</option>{["30", "90", "365"].map((d) => <option key={d} value={d}>{l["cv.f.days"].replace("{n}", d)}</option>)}</select>
      <button className="btn s" type="submit">{l["cv.f.apply"]}</button>
    </form>
    {calls === null ? <p className="note" role="alert">{l["cv.error"]}</p>
      : f.tab === "resultados" ? <Results st={st!} l={l} lang={lang} />
      : calls.length === 0 ? <p className="note" data-testid="cv-empty">{f.tab === "ativas" ? l["cv.emptyActive"] : l["cv.emptyHistory"]}</p>
      : <div className="cv-list">{calls.map((c) => <CallCard key={c.id} c={c} l={l} lang={lang} href={`/calls/${c.id}`} />)}</div>}
    <p className="src cv-risk">{l["cv.risk"]}</p>
  </>);
}

function Results({ st, l, lang }: { st: ReturnType<typeof callStats>; l: Record<string, string>; lang: "pt" | "en" }) {
  const k = [["cv.s.total", st.total], ["cv.s.closed", st.closed], ["cv.s.positive", st.positive], ["cv.s.negative", st.negative], ["cv.s.targets", st.targetsHit], ["cv.s.stops", st.stopsHit]] as const;
  return (<section aria-label={l["cv.tab.resultados"]} data-testid="cv-results">
    <div className="cv-kpis">{k.map(([key, v]) => <div key={key} className="card cv-kpi"><span className="src">{l[key]}</span><b className="num">{v}</b></div>)}
      <div className="card cv-kpi"><span className="src">{l["cv.s.avg"]}</span><b className="num" data-testid="cv-avg">{sgn(st.avgGrossPct, lang)}</b></div>
      <div className="card cv-kpi"><span className="src">{l["cv.s.avgNet"]}</span><b className="num">{st.netCount ? sgn(st.avgNetPct, lang) : "—"}</b>{st.netCount < st.closed && st.closed > 0 && <small className="src">{l["cv.s.netPartial"].replace("{n}", String(st.netCount)).replace("{t}", String(st.closed))}</small>}</div>
      <div className="card cv-kpi"><span className="src">{l["cv.s.rate"]}</span><b className="num" data-testid="cv-rate">{st.hitRatePct === null ? "—" : `${st.hitRatePct.toLocaleString(lang === "pt" ? "pt-BR" : "en-US")}%`}</b></div>
    </div>
    {st.byMonth.length > 0 && <div className="card"><h2 style={{ fontSize: 16, margin: "0 0 10px" }}>{l["cv.s.byMonth"]}</h2><div className="tw"><table><thead><tr><th>{l["cv.s.month"]}</th><th>{l["cv.s.closed"]}</th><th>{l["cv.s.positive"]}</th><th>{l["cv.s.sum"]}</th></tr></thead>
      <tbody>{st.byMonth.map((m) => <tr key={m.month}><td>{m.month}</td><td className="num">{m.closed}</td><td className="num">{m.positive}</td><td className="num">{sgn(m.sumGrossPct, lang)}</td></tr>)}</tbody></table></div></div>}
    <p className="note" data-testid="cv-criteria">{l["cv.s.criteria"]}</p>
  </section>);
}
