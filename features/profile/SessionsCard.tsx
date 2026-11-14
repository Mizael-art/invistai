"use client";
import { useState } from "react";

type L = Record<string, string>;
export function SessionsCard({ labels }: { labels: L }) {
  const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function go() {
    if (busy) return; setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/auth/sessions/others", { method: "POST" });
      setMsg(r.ok ? { ok: true, text: labels["pf.sessionsDone"] } : { ok: false, text: labels["pf.sessionsFail"] }); setConfirm(false);
    } catch { setMsg({ ok: false, text: labels["pf.sessionsFail"] }); } finally { setBusy(false); }
  }
  return (<section aria-label={labels["pf.sessions"]}><h2>{labels["pf.sessions"]}</h2><p>{labels["pf.sessionsText"]}</p><p className="src">{labels["pf.sessionsNote"]}</p>
    <div className="row">{!confirm ? <button className="btn s" onClick={() => { setConfirm(true); setMsg(null); }}>{labels["pf.sessionsBtn"]}</button> : (<>
      <button className="btn d" onClick={go} disabled={busy}>{labels["pf.sessionsConfirm"]}</button><button className="btn s" onClick={() => setConfirm(false)} disabled={busy}>{labels["pf.cancel"]}</button></>)}
      {msg && <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "fav-msg" : "err"} data-testid="sessions-msg">{msg.text}</span>}</div></section>);
}
