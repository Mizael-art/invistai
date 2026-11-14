"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { MAX_PASSWORD, passwordOk, passwordRules } from "@/lib/validation";

type L = Record<string, string>;
export function ResetForm({ labels }: { labels: L }) {
  const [pw, setPw] = useState(""); const [show, setShow] = useState(false); const [fieldErr, setFieldErr] = useState<string | null>(null); const [err, setErr] = useState<{ key: string } | null>(null);
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const lock = useRef(false); const ref = useRef<HTMLInputElement>(null);
  const rules = useMemo(() => passwordRules(pw), [pw]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (lock.current) return; setErr(null);
    if (!pw) { setFieldErr(labels["rg.err.passwordRequired"]); ref.current?.focus(); return; }
    if (!passwordOk(pw)) { setFieldErr(labels["rg.err.passwordWeak"]); ref.current?.focus(); return; }
    setFieldErr(null); lock.current = true; setBusy(true);
    try {
      const r = await fetch("/api/auth/reset-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
      if (r.ok) { setPw(""); setDone(true); return; }
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setErr({ key: j.error ?? "unavailable" });
    } catch { setErr({ key: "network" }); }
    finally { lock.current = false; setBusy(false); }
  }
  if (done) return (<div role="status" style={{ textAlign: "center" }}>
    <div className="coin" style={{ width: 72, height: 72, fontSize: 30, background: "var(--gd)", color: "var(--g)", border: "1px solid var(--g)", margin: "0 auto 12px" }}>✔</div>
    <h2>{labels["rp.ok.title"]}</h2><p>{labels["rp.ok.text"]}</p>
    <Link href="/login" className="btn" style={{ textDecoration: "none", justifyContent: "center", width: "100%" }}>{labels["rp.ok.btn"]}</Link></div>);
  return (
    <form onSubmit={submit} noValidate aria-label={labels["rp.title"]}>
      <h2>{labels["rp.title"]}</h2><p className="mt">{labels["rp.sub"]}</p>
      <div className="field"><label htmlFor="password">{labels["rp.password"]}</label>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input id="password" ref={ref} style={{ flex: 1, minWidth: 0 }} type={show ? "text" : "password"} autoComplete="new-password" placeholder={labels["rg.passwordPh"]} value={pw} onChange={(e) => setPw(e.target.value)} aria-invalid={!!fieldErr} aria-describedby={fieldErr ? "pw-err" : undefined} maxLength={MAX_PASSWORD} />
          <button type="button" className="ic" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label={show ? labels["au.hide"] : labels["au.show"]}>{show ? "🙈" : "👁"}</button></div>
        {fieldErr && <span id="pw-err" role="alert" className="err">{fieldErr}</span>}</div>
      <ul className="ck" aria-label={labels["rg.pwTitle"]} style={{ margin: "0 0 12px" }}>
        {(["length", "upper", "number", "special"] as const).map((k) => (<li key={k} data-rule={k} data-ok={rules[k]} style={{ opacity: rules[k] ? 1 : 0.55 }}>{labels[`rg.pw.${k}`]}</li>))}
      </ul>
      {err && <div role="alert" className="err" style={{ marginBottom: 10 }}>{labels[`rp.err.${err.key}`] ?? labels["au.err.network"] ?? labels["rp.err.unavailable"]}
        {err.key === "invalid_link" && <><br /><Link href="/recuperar-senha">{labels["rp.invalid.btn"]}</Link></>}</div>}
      <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>{busy ? labels["rp.submitting"] : labels["rp.submit"]}</button>
    </form>
  );
}
