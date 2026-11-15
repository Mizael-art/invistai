"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const DUR = [["", "Sem prazo"], ["7", "7 dias"], ["30", "30 dias"], ["90", "90 dias"], ["365", "1 ano"]] as const;
/** Troca o plano de uma conta por concessão do admin (cortesia, sem cobrança). "Free" retira a cortesia; assinatura paga continua valendo. */
export function PlanControl({ id, email, grant, paid }: { id: string; email: string; grant: "pro" | "max" | null; paid: string }) {
  const router = useRouter(); const [plan, setPlan] = useState<string>(grant ?? "free"); const [days, setDays] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const changed = plan !== (grant ?? "free") || (plan !== "free" && days !== "");
  async function go() {
    const msg = plan === "free" ? `Retirar o plano concedido de ${email}?${paid !== "free" ? ` A assinatura paga (${paid.toUpperCase()}) continua valendo.` : ""}`
      : `Liberar o plano ${plan.toUpperCase()} para ${email} ${days ? `por ${DUR.find((d) => d[0] === days)?.[1]}` : "sem prazo"}? Sem cobrança — fica registrado na auditoria.`;
    if (!window.confirm(msg)) return;
    setBusy(true); setErr(null);
    const r = await fetch(`/api/admin/users/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(plan === "free" ? { plan } : { plan, days: days ? Number(days) : null }) });
    setBusy(false); if (r.ok) { setDays(""); router.refresh(); } else setErr("Não foi possível alterar.");
  }
  return (<div className="adm-plan" data-testid="adm-plan">
    <select aria-label={`Plano de ${email}`} value={plan} onChange={(e) => setPlan(e.target.value)} disabled={busy} data-testid="adm-plan-sel">
      <option value="free">Free</option><option value="pro">Pro</option><option value="max">Max</option></select>
    {plan !== "free" && <select aria-label="Duração" value={days} onChange={(e) => setDays(e.target.value)} disabled={busy} data-testid="adm-plan-days">{DUR.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>}
    <button type="button" className="btn sm" disabled={busy || !changed} onClick={go} data-testid="adm-plan-apply">{busy ? "…" : "Aplicar"}</button>
    {err && <small className="af-err">{err}</small>}
  </div>);
}
