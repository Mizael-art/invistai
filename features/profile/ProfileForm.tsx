"use client";
import { useRef, useState } from "react";
import { isValidName, normalizeName, normalizePhone } from "@/lib/validation";

type L = Record<string, string>;
export function ProfileForm({ name, phone, email, labels }: { name: string; phone: string; email: string; labels: L }) {
  const [saved, setSaved] = useState({ name, phone }); const [v, setV] = useState({ name, phone });
  const [errs, setErrs] = useState<{ name?: string; phone?: string }>({}); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false); const lock = useRef(false); const nameRef = useRef<HTMLInputElement>(null), phoneRef = useRef<HTMLInputElement>(null);
  const dirty = v.name !== saved.name || v.phone !== saved.phone;

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (lock.current || !dirty) return; setMsg(null);
    const er: typeof errs = {}, n = normalizeName(v.name);
    if (!n) er.name = labels["rg.err.nameRequired"]; else if (!isValidName(n)) er.name = labels["rg.err.nameInvalid"];
    if (!v.phone.trim()) er.phone = labels["rg.err.phoneRequired"]; else if (!normalizePhone(v.phone)) er.phone = labels["rg.err.phoneInvalid"];
    setErrs(er); if (er.name) { nameRef.current?.focus(); return; } if (er.phone) { phoneRef.current?.focus(); return; }
    lock.current = true; setBusy(true);
    try {
      const r = await fetch("/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: n, phone: v.phone }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; name?: string; phone?: string; error?: string };
      if (r.ok && j.ok) { const nv = { name: j.name ?? n, phone: j.phone ?? v.phone }; setSaved(nv); setV(nv); setMsg({ ok: true, text: labels["pf.saved"] }); }
      else setMsg({ ok: false, text: labels[`pf.err.${j.error}`] ?? labels["pf.err.unavailable"] });
    } catch { setMsg({ ok: false, text: labels["au.err.network"] }); }
    finally { lock.current = false; setBusy(false); }
  }
  const cancel = () => { setV(saved); setErrs({}); setMsg(null); };
  return (
    <form onSubmit={submit} noValidate aria-label={labels["pf.personal"]}>
      <h2>{labels["pf.personal"]}</h2>
      <div className="field"><label htmlFor="pf-name">{labels["pf.name"]}</label>
        <input id="pf-name" ref={nameRef} value={v.name} onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))} autoComplete="name" maxLength={120} aria-invalid={!!errs.name} aria-describedby={errs.name ? "pf-name-err" : undefined} />
        {errs.name && <span id="pf-name-err" role="alert" className="err">{errs.name}</span>}</div>
      <div className="field"><label htmlFor="pf-phone">{labels["pf.phone"]}</label>
        <input id="pf-phone" ref={phoneRef} type="tel" inputMode="tel" value={v.phone} onChange={(e) => setV((s) => ({ ...s, phone: e.target.value }))} autoComplete="tel" maxLength={30} placeholder={labels["rg.phonePh"]} aria-invalid={!!errs.phone} aria-describedby={errs.phone ? "pf-phone-err" : undefined} />
        {errs.phone && <span id="pf-phone-err" role="alert" className="err">{errs.phone}</span>}</div>
      <div className="field"><label htmlFor="pf-email">{labels["pf.email"]}</label>
        <input id="pf-email" value={email} readOnly disabled aria-describedby="pf-email-hint" /><span id="pf-email-hint" className="src">{labels["pf.emailLocked"]}</span></div>
      {msg && <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "fav-msg" : "err"} style={{ marginBottom: 10 }} data-testid="pf-msg">{msg.text}</div>}
      <div className="row"><button className="btn" type="submit" disabled={!dirty || busy}>{busy ? labels["pf.saving"] : labels["pf.save"]}</button>
        <button className="btn s" type="button" onClick={cancel} disabled={!dirty || busy}>{labels["pf.cancel"]}</button></div>
    </form>
  );
}
