"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { targets, type VipCall } from "@/lib/calls";

const ERR: Record<string, string> = { admin_required: "Sua conta não é administradora.", not_active: "A call não está ativa.", not_draft: "Só rascunhos podem ser publicados.", target_out_of_order: "Registre os alvos em ordem.",
  no_targets_hit: "Nenhum alvo foi registrado ainda.", exit_required: "Informe o preço de saída.", call_finished: "Call já encerrada/cancelada.", invalid: "Dados inválidos." };
/** Ações de ciclo de vida da call. Cada ação é registrada no histórico da call e na auditoria administrativa (no banco). */
export function CallActions({ c }: { c: VipCall }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState<"stop" | "targets" | "manual">(c.targets_hit ? "targets" : "stop"); const [exit, setExit] = useState(""); const [fees, setFees] = useState(""); const [note, setNote] = useState("");
  async function act(body: Record<string, unknown>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true); setErr(null);
    const r = await fetch(`/api/admin/calls/${c.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setErr(ERR[j.error] ?? "Não foi possível concluir a ação."); return; }
    setNote(""); setExit(""); router.refresh();
  }
  const n = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(",", ".")));
  const next = c.targets_hit + 1; const tps = targets(c);
  return (<section className="card" aria-label="Ações" data-testid="call-actions">
    <h2 className="cv-h">Ações</h2>
    {c.status === "draft" && <button type="button" className="btn" disabled={busy} onClick={() => act({ action: "publish" }, "Publicar a call e notificar os assinantes PRO/MAX?")} data-testid="a-publish">Publicar e notificar assinantes</button>}
    {c.status === "active" && <>
      {next <= tps.length && <button type="button" className="btn s" disabled={busy} onClick={() => act({ action: "tp", tp: next })} data-testid="a-tp">Registrar TP{next} atingido ({tps[next - 1]})</button>}
      <div className="adm-close"><p className="src" style={{ margin: "12px 0 6px" }}>Encerrar com o preço de saída registrado</p>
        <div className="row"><select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} data-testid="a-reason"><option value="stop">Stop atingido</option>{c.targets_hit > 0 && <option value="targets">Alvos (sai no TP{c.targets_hit})</option>}<option value="manual">Encerramento manual</option></select>
          <input inputMode="decimal" placeholder={reason === "manual" ? "Preço de saída" : "Saída (opcional)"} value={exit} onChange={(e) => setExit(e.target.value)} data-testid="a-exit" />
          <input inputMode="decimal" placeholder="Custos % (ida+volta)" value={fees} onChange={(e) => setFees(e.target.value)} data-testid="a-fees" /></div>
        <button type="button" className="btn d" style={{ marginTop: 8 }} disabled={busy} onClick={() => act({ action: "close", reason, exit: n(exit), fees: n(fees), note: note || undefined }, "Encerrar a call? O resultado será calculado com o preço de saída e não poderá ser alterado.")} data-testid="a-close">Encerrar call</button></div>
    </>}
    {(c.status === "draft" || c.status === "active") && <button type="button" className="btn d" style={{ marginTop: 12 }} disabled={busy} onClick={() => act({ action: "cancel", note: note || undefined }, "Cancelar a call? Ela não entra nas estatísticas de resultado.")} data-testid="a-cancel">Cancelar call</button>}
    <label className="af" style={{ marginTop: 12 }}><span>Nota para o histórico</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} data-testid="a-note" /></label>
    <button type="button" className="btn s" disabled={busy || !note.trim()} onClick={() => act({ action: "note", note })} data-testid="a-addnote">Adicionar nota</button>
    {err && <p className="note" role="alert" style={{ marginTop: 10 }} data-testid="a-err">{err}</p>}
  </section>);
}
