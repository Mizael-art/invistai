"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { emailField } from "@/schemas/auth";

type L = Record<string, string>;
export function ForgotForm({ linkInvalid, labels }: { linkInvalid: boolean; labels: L }) {
  const [email, setEmail] = useState(""); const [err, setErr] = useState<string | null>(null); const [fieldErr, setFieldErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false); const [left, setLeft] = useState(0); const lock = useRef(false); const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (left <= 0) return; const t = setTimeout(() => setLeft((n) => n - 1), 1000); return () => clearTimeout(t); }, [left]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault(); if (lock.current || left > 0) return; setErr(null);
    const em = email.trim();
    if (!em) { setFieldErr(labels["au.err.emailRequired"]); ref.current?.focus(); return; }
    if (!emailField.safeParse(em).success) { setFieldErr(labels["au.err.emailInvalid"]); ref.current?.focus(); return; }
    setFieldErr(null); lock.current = true; setBusy(true);
    try {
      const r = await fetch("/api/auth/forgot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: em }) });
      if (r.ok) { setSent(true); setLeft(60); return; }
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setErr(j.error === "auth_not_configured" ? labels["au.err.auth_not_configured"] : labels[`fp.err.${j.error}`] ?? labels["fp.err.unavailable"]);
      if (j.error === "rate_limited") setLeft(60);
    } catch { setErr(labels["au.err.network"]); }
    finally { lock.current = false; setBusy(false); }
  }
  return (
    <form onSubmit={submit} noValidate aria-label={labels["fp.title"]}>
      <h2>{labels["fp.title"]}</h2><p className="mt">{labels["fp.sub"]}</p>
      {linkInvalid && <p className="note" role="alert">{labels["fp.linkInvalid"]}</p>}
      {sent && (<div className="note" role="status" data-testid="forgot-sent"><b>{labels["fp.ok.title"]}</b><p>{labels["fp.ok.text"]}</p><p className="src">{labels["fp.ok.spam"]}</p></div>)}
      <div className="field"><label htmlFor="email">{labels["au.email"]}</label>
        <input id="email" ref={ref} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder={labels["au.emailPh"]} value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!fieldErr} aria-describedby={fieldErr ? "email-err" : undefined} maxLength={254} />
        {fieldErr && <span id="email-err" role="alert" className="err">{fieldErr}</span>}</div>
      {err && <div role="alert" className="err" style={{ marginBottom: 10 }}>{err}</div>}
      <button className="btn" type="submit" disabled={busy || left > 0} style={{ width: "100%" }}>
        {busy ? labels["fp.submitting"] : sent ? (left > 0 ? labels["fp.wait"].replace("{n}", String(left)) : labels["fp.resend"]) : left > 0 ? labels["fp.wait"].replace("{n}", String(left)) : labels["fp.submit"]}</button>
      <p style={{ textAlign: "center", marginTop: 14 }}><Link href="/login">{labels["fp.back"]}</Link></p>
    </form>
  );
}
