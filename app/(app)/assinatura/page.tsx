import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPrefs } from "@/lib/i18n/server";
import { dict } from "@/lib/i18n/dictionary";
import { getEntitlements, listPayments, listPlanEvents, aiQuota } from "@/services/subscription";
import { stripeEnv } from "@/lib/billing/stripe";
import { PLANS, brl, isPlanId } from "@/lib/plans";
import { PlanCards } from "@/features/billing/PlanCards";

export const metadata: Metadata = { title: "Assinatura — TRADEON" };
export const dynamic = "force-dynamic";

/** Planos e assinatura do usuário: plano efetivo (calculado como no banco), status, datas, cota da IA, pagamentos e histórico. */
export default async function Assinatura({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ent = await getEntitlements(); if (!ent) redirect("/login?next=%2Fassinatura");
  const sp = await searchParams; const { lang, tr } = await getPrefs(); const labels = dict[lang] as unknown as Record<string, string>;
  const [payments, events, quota] = await Promise.all([listPayments(), listPlanEvents(), aiQuota()]);
  const s = ent.sub; const configured = !!stripeEnv();
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" }) : "—");
  const st = s?.status ?? "none";
  return (<>
    <div className="page-h"><div><h1>{tr("pl.title")}</h1><p className="mt" style={{ margin: "6px 0 0" }}>{tr("pl.sub")}</p></div></div>
    {sp.checkout === "success" && <p className="note" role="status" data-testid="checkout-success">{tr("pl.ok")}</p>}
    {sp.checkout === "cancel" && <p className="note" role="status">{tr("pl.cancelled")}</p>}
    {!configured && <p className="note" role="status" data-testid="billing-off">{tr("pl.notConfigured")}</p>}

    <section className="card sub-sum" aria-label={tr("pl.currentPlan")} data-testid="sub-summary">
      <div><small>{tr("pl.currentPlan")}</small><b data-testid="cur-plan">{PLANS[ent.plan].name}</b></div>
      <div><small>Status</small><b><span className={`bd ${st === "active" || st === "trialing" ? "" : st === "past_due" ? "a" : st === "none" ? "v" : "r"}`} data-testid="cur-status">{tr(`pl.st.${st}` as never)}</span></b></div>
      <div><small>{tr("pl.since")}</small><b>{date(s?.started_at ?? null)}</b></div>
      <div><small>{s?.cancel_at_period_end || st === "canceled" ? tr("pl.ends") : tr("pl.renews")}</small><b>{ent.plan === "free" ? "—" : ent.grant?.plan_id === ent.plan ? date(ent.grant.expires_at) : date(s?.current_period_end ?? null)}</b></div>
      <div><small>{tr("pl.aiUsage")}</small><b data-testid="ai-quota">{quota ? (quota.limit === null ? tr("pl.aiUnlimited") : tr("pl.aiUsed", { used: String(Math.min(quota.used, quota.limit)), limit: String(quota.limit) })) : "—"}</b></div>
    </section>
    {ent.grant && ent.grant.plan_id === ent.plan && <p className="note" role="status" data-testid="plan-grant">{lang === "pt" ? `Plano ${PLANS[ent.grant.plan_id].name} liberado pela equipe TRADEON, sem cobrança${ent.grant.expires_at ? `, até ${date(ent.grant.expires_at)}` : ""}.` : `${PLANS[ent.grant.plan_id].name} plan granted by the TRADEON team, free of charge${ent.grant.expires_at ? `, until ${date(ent.grant.expires_at)}` : ""}.`}</p>}
    {s?.cancel_at_period_end && ent.plan !== "free" && <p className="note" role="status">{tr("pl.cancelNote", { date: date(s.current_period_end) })}</p>}
    {st === "past_due" && ent.plan !== "free" && <p className="note" role="alert">{tr("pl.pastDueNote", { date: date(s?.current_period_end ?? null) })}</p>}

    <div className="seg" style={{ width: "auto", alignSelf: "flex-start" }} role="group" aria-label={tr("pl.monthly")}><span className="on" style={{ padding: "0 18px", display: "inline-flex", alignItems: "center", minHeight: 36, borderRadius: 9 }}>{tr("pl.monthly")}</span></div>
    <PlanCards current={ent.plan} configured={configured} hasCustomer={!!s?.provider_customer_id} labels={labels} />

    <section className="card" aria-labelledby="pay-h">
      <h2 id="pay-h">{tr("pl.payments")}</h2>
      {payments.length === 0 ? <p className="mt" data-testid="no-payments">{tr("pl.noPayments")}</p> : (
        <div className="tw"><table data-testid="payments"><thead><tr><th>Data</th><th>{tr("pl.currentPlan")}</th><th>Valor</th><th>Status</th><th>{tr("pl.invoice")}</th></tr></thead><tbody>
          {payments.map((p) => (<tr key={p.id}><td>{date(p.paid_at ?? p.created_at)}</td><td>{p.plan_id && isPlanId(p.plan_id) ? PLANS[p.plan_id].name : "—"}</td>
            <td className="num">{p.currency === "brl" ? brl(p.amount_cents) : `${(p.amount_cents / 100).toFixed(2)} ${p.currency.toUpperCase()}`}</td>
            <td><span className={`bd ${p.status === "paid" ? "" : p.status === "failed" ? "r" : "a"}`}>{tr(`pl.ps.${p.status}` as never)}</span></td>
            <td>{p.invoice_url ? <a href={p.invoice_url} target="_blank" rel="noopener noreferrer">{tr("pl.invoice")} ↗</a> : "—"}</td></tr>))}
        </tbody></table></div>)}
    </section>
    {events.length > 0 && <section className="card" aria-labelledby="hist-h"><h2 id="hist-h">{tr("pl.history")}</h2>
      {events.map((e, i) => <div key={i} className="lrow"><div style={{ flex: 1 }}><b>{e.from_plan && isPlanId(e.from_plan) ? PLANS[e.from_plan].name : "—"} → {e.to_plan && isPlanId(e.to_plan) ? PLANS[e.to_plan].name : "—"}</b><div className="src">{e.to_status ? tr(`pl.st.${e.to_status}` as never) : ""}</div></div><span className="src">{date(e.created_at)}</span></div>)}</section>}
    <p className="src">{tr("pl.legal")}</p>
  </>);
}
