import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPrefs } from "@/lib/i18n/server";
import { dict } from "@/lib/i18n/dictionary";
import { clock } from "@/lib/format";
import { getEntitlements } from "@/services/subscription";
import { getCall, isAdmin } from "@/services/calls";
import { can } from "@/lib/plans";
import { rr, targets } from "@/lib/calls";
import { CallCard, lv, sgn } from "@/features/calls/CallCard";
import { Paywall } from "@/features/calls/Paywall";

export const metadata: Metadata = { title: "Call VIP — TRADEON" };
export const dynamic = "force-dynamic";

export default async function CallDetail({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const ent = await getEntitlements(); if (!ent) redirect(`/login?next=${encodeURIComponent(`/calls/${id}`)}`);
  const { lang } = await getPrefs(); const l = dict[lang] as unknown as Record<string, string>;
  const admin = await isAdmin();
  if (!can(ent.plan, "calls") && !admin) return <Paywall l={l} feature="calls" />;
  const r = await getCall(id); if (!r) notFound();
  const { call: c, events } = r; const ratios = rr(c);
  return (<>
    <div className="page-h"><div><Link href="/calls" className="src">← Calls VIP</Link><h1 style={{ marginTop: 6 }}>{c.direction.toUpperCase()} · {c.symbol}</h1></div>{admin && <Link href={`/admin/calls/${c.id}`} className="btn s">{l["cv.manage"]}</Link>}</div>
    <div className="cv-detail">
      <div style={{ display: "grid", gap: 16 }}>
        <CallCard c={c} l={l} lang={lang} />
        <section className="card"><h2 className="cv-h">{l["cv.d.levels"]}</h2><div className="tw"><table data-testid="cv-levels"><thead><tr><th>{l["cv.d.level"]}</th><th>{l["cv.d.price"]}</th><th>R/R</th><th>{l["cv.d.status"]}</th></tr></thead>
          <tbody>{targets(c).map((t, i) => <tr key={i}><td>TP{i + 1}</td><td className="num">{lv(t, lang)}</td><td className="num">{Number.isFinite(ratios[i]) ? ratios[i].toFixed(2) : "—"}</td><td>{c.targets_hit > i ? <span className="bd">{l["cv.d.hit"]}</span> : "—"}</td></tr>)}
            <tr><td>Stop</td><td className="num">{lv(c.stop, lang)}</td><td>—</td><td>{c.stop_hit ? <span className="bd r">{l["cv.d.hit"]}</span> : "—"}</td></tr></tbody></table></div>
          {c.status === "closed" && <div className="cv-res" data-testid="cv-result"><div><span className="src">{l["cv.d.exit"]}</span><b className="num">{lv(c.exit_price, lang)}</b></div>
            <div><span className="src">{l["cv.d.gross"]}</span><b className="num">{sgn(c.gross_result_pct, lang)}</b></div>
            <div><span className="src">{l["cv.d.net"]}</span><b className="num">{c.net_result_pct === null ? l["cv.d.noCosts"] : sgn(c.net_result_pct, lang)}</b></div></div>}
          <p className="src" style={{ marginTop: 10 }}>{l["cv.d.calc"]}</p>
        </section>
      </div>
      <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
        <section className="card"><h2 className="cv-h">{l["cv.d.info"]}</h2>
          <dl className="cv-dl"><dt>{l["cv.f.market"]}</dt><dd>{l[`cv.m.${c.market}`]}</dd><dt>{l["cv.lev"]}</dt><dd>{c.leverage ? `${lv(c.leverage, lang)}x` : "—"}</dd>
            <dt>{l["cv.d.published"]}</dt><dd>{clock(c.published_at, lang)}</dd>{c.closed_at && <><dt>{l["cv.d.closedAt"]}</dt><dd>{clock(c.closed_at, lang)}</dd></>}
            <dt>{l["cv.d.analyst"]}</dt><dd data-testid="cv-analyst">{c.analyst || l["cv.d.noAnalyst"]}</dd></dl>
          {c.notes && <p style={{ whiteSpace: "pre-wrap", margin: "12px 0 0" }}>{c.notes}</p>}
        </section>
        <section className="card"><h2 className="cv-h">{l["cv.d.timeline"]}</h2><ol className="cv-tl" data-testid="cv-timeline">{events.map((e) => <li key={e.id}><b>{l[`cv.ev.${e.type}`]}{e.tp_index ? ` TP${e.tp_index}` : ""}</b>{e.price !== null && <span className="num"> · {lv(e.price, lang)}</span>}<span className="src"> · {clock(e.created_at, lang)}</span>{e.note && <p className="src" style={{ margin: "2px 0 0" }}>{e.note}</p>}</li>)}</ol></section>
        {c.leverage && c.leverage >= 5 && <p className="note" role="note">{l["cv.d.levWarn"]}</p>}
      </div>
    </div>
    <p className="src cv-risk">{l["cv.risk"]}</p>
  </>);
}
