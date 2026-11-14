"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/** Modal exibido quando o FREE esgota as mensagens. Assinar inicia o Checkout real (o plano só muda após o webhook validado). */
export function UpgradeModal({ l, limit, billingConfigured, onClose }: { l: Record<string, string>; limit: number; billingConfigured: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null); const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [onClose]);
  async function sub(plan: "pro" | "max") {
    setBusy(plan); setMsg(null);
    try {
      const r = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) }); const j = await r.json().catch(() => ({}));
      if (r.ok && typeof j.url === "string" && j.url.startsWith("https://")) { location.assign(j.url); return; }
      setMsg(j.error === "billing_not_configured" ? l["pl.notConfigured"] : j.error === "email_not_confirmed" ? l["pl.emailFirst"] : j.error === "has_subscription" ? l["pl.hasSub"] : l["pl.fail"]);
    } catch { setMsg(l["pl.fail"]); }
    setBusy(null);
  }
  return (<div className="modal-bg" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal ai-lock" role="dialog" aria-modal="true" aria-labelledby="lock-t" data-testid="upgrade-modal">
      <span className="lock-ic" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 11h11v9h-11zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" /></svg></span>
      <h2 id="lock-t">{l["pl.lockTitle"]}</h2>
      <p className="mt">{l["pl.lockText"].replace("{n}", String(limit))}</p>
      <button ref={first} type="button" className="btn" style={{ width: "100%" }} disabled={!billingConfigured || !!busy} onClick={() => sub("pro")} data-testid="lock-pro">{busy === "pro" ? "…" : l["ai.subPro"]}</button>
      <button type="button" className="btn s" style={{ width: "100%", margin: "10px 0 0" }} disabled={!billingConfigured || !!busy} onClick={() => sub("max")} data-testid="lock-max">{busy === "max" ? "…" : l["ai.subMax"]}</button>
      {!billingConfigured && <p className="src" style={{ marginTop: 10 }}>{l["pl.notConfigured"]}</p>}
      {msg && <p className="note" role="alert" style={{ marginTop: 10 }}>{msg}</p>}
      <div className="row sp" style={{ marginTop: 14 }}><Link href="/assinatura" className="lnk">{l["pl.compare"]}</Link><button type="button" className="lnk" onClick={onClose}>{l["ai.close"]}</button></div>
    </div>
  </div>);
}
