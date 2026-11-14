"use client";
import { useEffect, useRef, useState } from "react";

type L = { btn: string; wait: string; busy: string; sent: string; fail: string; rate: string; notConfigured: string };
/** Reenvia o e-mail de confirmação com bloqueio visual (cooldown) contra cliques repetidos. Sem `email`, usa o usuário logado. */
export function ResendConfirmation({ email, labels, initialCooldown = 0 }: { email?: string; labels: L; initialCooldown?: number }) {
  const [left, setLeft] = useState(initialCooldown); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const lock = useRef(false);
  useEffect(() => { if (left <= 0) return; const t = setTimeout(() => setLeft((n) => n - 1), 1000); return () => clearTimeout(t); }, [left]);
  async function go() {
    if (lock.current || left > 0) return; lock.current = true; setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/auth/resend", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(email ? { email } : {}) });
      if (r.ok) { setMsg(labels.sent); setLeft(60); }
      else if (r.status === 429) { setMsg(labels.rate); setLeft(60); }
      else if (r.status === 503) { const j = await r.json().catch(() => ({})); setMsg(j.error === "auth_not_configured" ? labels.notConfigured : labels.fail); }
      else setMsg(labels.fail);
    } catch { setMsg(labels.fail); } finally { lock.current = false; setBusy(false); }
  }
  return (<span style={{ display: "inline-flex", flexDirection: "column", gap: 6 }}>
    <button type="button" className="btn s" onClick={go} disabled={busy || left > 0}>{busy ? labels.busy : left > 0 ? labels.wait.replace("{n}", String(left)) : labels.btn}</button>
    {msg && <span role="status" className="fav-msg">{msg}</span>}
  </span>);
}
