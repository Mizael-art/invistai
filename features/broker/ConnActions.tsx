"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ConnActions({ id, name }: { id: string; name: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [err, setErr] = useState(false);
  return (<div className="row" style={{ gap: 8 }}>
    <button type="button" className="btn s sm" disabled={busy} onClick={() => { setBusy(true); router.refresh(); setTimeout(() => setBusy(false), 1200); }} data-testid="bk-refresh">↻ Atualizar</button>
    <button type="button" className="btn s sm d" disabled={busy} data-testid="bk-delete" onClick={async () => {
      if (!window.confirm(`Desconectar ${name}? As credenciais cifradas serão apagadas da TRADEON. (Você também pode revogar a chave na corretora.)`)) return;
      setBusy(true); const r = await fetch(`/api/broker/${id}`, { method: "DELETE" }); setBusy(false); if (r.ok) { router.push("/corretora"); router.refresh(); } else setErr(true); }}>Desconectar</button>
    {err && <small className="af-err">Não foi possível desconectar.</small>}
  </div>);
}
