"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminToggle({ id, admin, self }: { id: string; admin: boolean; self: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [err, setErr] = useState(false);
  async function go() {
    if (!window.confirm(admin ? "Remover a permissão de administrador desta conta?" : "Tornar esta conta administradora? Ela poderá publicar calls e ver dados de todos os usuários.")) return;
    setBusy(true); setErr(false);
    const r = await fetch(`/api/admin/users/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ admin: !admin }) });
    setBusy(false); if (r.ok) router.refresh(); else setErr(true);
  }
  return (<><button type="button" className={`btn s sm ${admin ? "d" : ""}`} disabled={busy || (self && admin)} onClick={go} data-testid="adm-toggle">{admin ? "Remover admin" : "Tornar admin"}</button>{err && <small className="af-err"> erro</small>}</>);
}
