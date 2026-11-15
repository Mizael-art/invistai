"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CALL_MARKETS, CallInput, type VipCall } from "@/lib/calls";

const MK: Record<string, string> = { crypto_spot: "Cripto (spot)", crypto_futures: "Cripto (futuros)", forex: "Forex", stocks_br: "Ações BR", stocks_intl: "Ações internacionais" };
const MSG: Record<string, string> = { stop_below_entry: "Em LONG o stop deve ficar abaixo da entrada.", stop_above_entry: "Em SHORT o stop deve ficar acima da entrada.", tp_beyond_entry: "O TP1 deve ficar além da entrada, no sentido da operação.",
  tp_sequence: "Preencha os alvos em sequência (sem pular).", tp_order: "Cada alvo deve ficar além do anterior.", leverage_market: "Alavancagem só para cripto (futuros) ou forex.", symbol: "Use o formato BTC/USDT ou PETR4." };
const ERR: Record<string, string> = { admin_required: "Sua conta não é administradora.", call_finished: "Call encerrada/cancelada não pode ser editada.", invalid_levels: "Níveis inválidos para a direção escolhida.", unavailable: "Banco indisponível. Tente novamente." };
type F = Record<string, string>;
const init = (c?: VipCall): F => ({ market: c?.market ?? "crypto_futures", symbol: c?.symbol ?? "", direction: c?.direction ?? "long", entry: c ? String(c.entry) : "", stop: c ? String(c.stop) : "",
  tp1: c ? String(c.tp1) : "", tp2: c?.tp2 != null ? String(c.tp2) : "", tp3: c?.tp3 != null ? String(c.tp3) : "", tp4: c?.tp4 != null ? String(c.tp4) : "", leverage: c?.leverage != null ? String(c.leverage) : "",
  notes: c?.notes ?? "", analyst: c?.analyst ?? "", edit_note: "" });

/** Formulário de call com validação ao vivo (mesmas regras do banco) e pré-visualização no formato de publicação. */
export function CallForm({ call }: { call?: VipCall }) {
  const router = useRouter(); const [f, setF] = useState<F>(init(call)); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const editing = !!call; const active = call?.status === "active";
  const parsed = useMemo(() => CallInput.safeParse({ ...f, edit_note: editing ? f.edit_note : undefined }), [f, editing]);
  const issues = parsed.success ? {} : Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), MSG[i.message] ?? "Valor inválido."]));
  const touched = (k: string) => f[k] !== "";
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  async function save(publish: boolean) {
    if (!parsed.success) { setErr("Corrija os campos destacados."); return; }
    setBusy(true); setErr(null);
    const r = editing ? await fetch(`/api/admin/calls/${call!.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) })
      : await fetch("/api/admin/calls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ call: parsed.data, publish }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setErr(ERR[j.error] ?? (j.error === "invalid_call" ? "Corrija os campos destacados." : "Não foi possível salvar.")); return; }
    router.push(`/admin/calls/${editing ? call!.id : j.id}?ok=${editing ? "saved" : publish ? "published" : "draft"}`); router.refresh();
  }
  const field = (k: string, label: string, opt = false) => (<label className="af"><span>{label}{opt && <small className="mt"> (opcional)</small>}</span>
    <input inputMode="decimal" value={f[k]} onChange={set(k)} aria-invalid={!!issues[k] && touched(k)} data-testid={`f-${k}`} />{issues[k] && touched(k) && <small className="af-err">{issues[k]}</small>}</label>);
  const d = parsed.success ? parsed.data : null;
  return (<div className="adm-form">
    <form className="card" onSubmit={(e) => { e.preventDefault(); save(false); }} aria-label={editing ? "Editar call" : "Nova call"}>
      <div className="af-row">
        <label className="af"><span>Ativo / par</span><input value={f.symbol} onChange={set("symbol")} placeholder="BTC/USDT" maxLength={25} aria-invalid={!!issues.symbol && touched("symbol")} data-testid="f-symbol" />{issues.symbol && touched("symbol") && <small className="af-err">{issues.symbol}</small>}</label>
        <label className="af"><span>Mercado</span><select value={f.market} onChange={set("market")} data-testid="f-market">{CALL_MARKETS.map((m) => <option key={m} value={m}>{MK[m]}</option>)}</select></label>
      </div>
      <fieldset className="af"><legend>Direção</legend><div className="seg2">{(["long", "short"] as const).map((x) => <label key={x} className={f.direction === x ? `on ${x}` : ""}><input type="radio" name="direction" value={x} checked={f.direction === x} onChange={set("direction")} data-testid={`f-dir-${x}`} />{x.toUpperCase()}</label>)}</div></fieldset>
      <div className="af-row">{field("entry", "Preço de entrada")}{field("stop", "Stop loss")}</div>
      <div className="af-row four">{field("tp1", "TP1")}{field("tp2", "TP2", true)}{field("tp3", "TP3", true)}{field("tp4", "TP4", true)}</div>
      <div className="af-row">{field("leverage", "Alavancagem (x)", true)}
        <label className="af"><span>Responsável técnico <small className="mt">(nome e registro, se houver)</small></span><input value={f.analyst} onChange={set("analyst")} maxLength={120} data-testid="f-analyst" /></label></div>
      <label className="af"><span>Observações / condições <small className="mt">(opcional)</small></span><textarea rows={3} value={f.notes} onChange={set("notes")} maxLength={2000} data-testid="f-notes" /></label>
      {active && <label className="af"><span>Motivo da edição <small className="mt">(aparece no histórico da call)</small></span><input value={f.edit_note} onChange={set("edit_note")} maxLength={1000} data-testid="f-edit-note" /></label>}
      {err && <p className="note" role="alert" data-testid="f-err">{err}</p>}
      <div className="row" style={{ marginTop: 12 }}>
        {editing ? <button type="submit" className="btn" disabled={busy} data-testid="f-save">Salvar alterações</button>
          : <><button type="button" className="btn" disabled={busy} onClick={() => save(true)} data-testid="f-publish">Publicar call</button><button type="submit" className="btn s" disabled={busy} data-testid="f-draft">Salvar rascunho</button></>}
      </div>
    </form>
    <aside className="card cv-preview" aria-label="Pré-visualização" data-testid="f-preview">
      <p className="src" style={{ margin: "0 0 8px" }}>Pré-visualização</p>
      {d ? <pre>{[`🚨 NOVA CALL`, ``, `💸 ${d.direction.toUpperCase()} — ${d.symbol}`, ``, `📍 Entry: ${d.entry}`, ``, `🎯 Targets:`, ...[d.tp1, d.tp2, d.tp3, d.tp4].map((t, i) => (t ? `TP${i + 1}: ${t}` : "")).filter(Boolean), ``, `🛑 Stop: ${d.stop}`, ...(d.leverage ? [``, `⚡ Alavancagem: ${d.leverage}x`] : [])].join("\n")}</pre>
        : <p className="mt">Preencha os campos para ver a call.</p>}
    </aside>
  </div>);
}
