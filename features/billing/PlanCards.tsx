"use client";
import { useState } from "react";
import { PLAN_IDS, PLANS, brl, type PlanId } from "@/lib/plans";

type L = Record<string, string>;
const FEATS: Record<PlanId, number> = { free: 3, pro: 5, max: 5 };
const ICON: Record<PlanId, string> = { free: "M5 12.5l4.5 4.5L19 7.5", pro: "M4 8l4 3.5L12 5l4 6.5L20 8l-1.6 10H5.6z", max: "M13 2L4.5 13.5H11L10 22l8.5-11.5H12z" };

/** Cartões FREE/PRO/MAX com assinatura (Checkout) ou gestão (Portal). O servidor decide tudo; aqui só se inicia o fluxo. */
export function PlanCards({ current, configured, hasCustomer, labels, only }: { current: PlanId; configured: boolean; hasCustomer: boolean; labels: L; only?: ("pro" | "max")[] }) {
  const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  async function go(path: string, body?: object, key = path) {
    setBusy(key); setMsg(null);
    try {
      const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json().catch(() => ({}));
      if (r.ok && typeof j.url === "string" && j.url.startsWith("https://")) { window.location.assign(j.url); return; }
      setMsg(j.error === "billing_not_configured" ? labels["pl.notConfigured"] : j.error === "email_not_confirmed" ? labels["pl.emailFirst"] : j.error === "has_subscription" ? labels["pl.hasSub"] : labels["pl.fail"]);
    } catch { setMsg(labels["pl.fail"]); }
    setBusy(null);
  }
  const plans = (only ?? PLAN_IDS) as readonly PlanId[];
  return (<div>
    <div className="plan-grid" data-n={plans.length}>
      {plans.map((p) => {
        const cur = p === current, paid = p !== "free";
        return (<section key={p} className={`card plan ${cur ? "cur" : ""} ${p === "pro" ? "hl" : ""}`} data-plan={p} aria-label={PLANS[p].name}>
          <div className="row sp"><div className="row" style={{ gap: 10 }}><span className="plan-ic" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={ICON[p]} /></svg></span><h2 style={{ margin: 0, fontSize: 20 }}>{PLANS[p].name}</h2></div>
            {cur && <span className="bd">{labels["pl.current"]}</span>}</div>
          <p className="src" style={{ margin: "4px 0 12px" }}>{labels[`pl.${p}.desc`]}</p>
          <p className="plan-price"><b className="num">{brl(PLANS[p].priceCents)}</b><span className="mt">{labels["pl.perMonth"]}</span></p>
          <ul className="ck">{Array.from({ length: FEATS[p] }, (_, i) => <li key={i}>{labels[`pl.f.${p}.${i + 1}`]}</li>)}</ul>
          {paid && !cur && (current === "free" || !hasCustomer
            ? <button type="button" className={`btn ${p === "pro" ? "" : "s"}`} style={{ width: "100%" }} disabled={!configured || !!busy} onClick={() => go("/api/billing/checkout", { plan: p }, p)} data-testid={`subscribe-${p}`}>{busy === p ? labels["pl.redirecting"] : labels["pl.subscribe"].replace("{plan}", PLANS[p].name)}</button>
            : <button type="button" className="btn s" style={{ width: "100%" }} disabled={!configured || !!busy} onClick={() => go("/api/billing/portal", undefined, "portal")} data-testid={`change-${p}`}>{labels["pl.manage"]}</button>)}
        </section>);
      })}
    </div>
    <div aria-live="polite">{msg && <p className="note" role="alert" style={{ marginTop: 12 }} data-testid="billing-msg">{msg}</p>}</div>
    {hasCustomer && current !== "free" && <div className="row" style={{ marginTop: 14, gap: 12 }}><button type="button" className="btn" disabled={!configured || !!busy} onClick={() => go("/api/billing/portal", undefined, "portal")} data-testid="portal">{busy === "portal" ? labels["pl.redirecting"] : labels["pl.manage"]}</button><span className="src" style={{ flex: 1, minWidth: 200 }}>{labels["pl.manageHint"]}</span></div>}
  </div>);
}
