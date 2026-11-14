"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { loginInput } from "@/schemas/auth";
import { ResendConfirmation } from "./ResendConfirmation";

type L = Record<string, string>;
export function LoginForm({ next, expired, confirmFailed = false, labels }: { next: string; expired: boolean; confirmFailed?: boolean; labels: L }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [show, setShow] = useState(false);
  const [errs, setErrs] = useState<{ email?: string; password?: string }>({}); const [formErr, setFormErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const lock = useRef(false); const [errKind, setErrKind] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null), pwRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (lock.current) return;            // impede envios repetidos
    setFormErr(null); setErrKind(null);
    const em = email.trim(), v: { email?: string; password?: string } = {};
    if (!em) v.email = labels["au.err.emailRequired"]; else if (!loginInput.shape.email.safeParse(em).success) v.email = labels["au.err.emailInvalid"];
    if (!password) v.password = labels["au.err.passwordRequired"];
    setErrs(v);
    if (v.email) { emailRef.current?.focus(); return; } if (v.password) { pwRef.current?.focus(); return; }
    lock.current = true; setBusy(true);
    try {
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: em, password }) });
      if (r.ok) { window.location.assign(next); return; }
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      setFormErr(labels[`au.err.${j.error}`] ?? labels["au.err.unavailable"]); setErrKind(j.error ?? null);
      if (r.status === 401) { setPassword(""); pwRef.current?.focus(); }
    } catch { setFormErr(labels["au.err.network"]); }
    finally { lock.current = false; setBusy(false); }
  }
  return (
    <form onSubmit={submit} noValidate aria-label={labels["au.title"]}>
      <h2>{labels["au.title"]}</h2><p className="mt">{labels["au.sub"]}</p>
      {expired && <p className="note" role="status">{labels["au.expired"]}</p>}
      {confirmFailed && <p className="note" role="alert">{labels["au.confirmFailed"]}</p>}
      <div className="field"><label htmlFor="email">{labels["au.email"]}</label>
        <input id="email" ref={emailRef} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder={labels["au.emailPh"]} value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errs.email} aria-describedby={errs.email ? "email-err" : undefined} maxLength={254} />
        {errs.email && <span id="email-err" role="alert" className="err">{errs.email}</span>}</div>
      <div className="field"><label htmlFor="password">{labels["au.password"]}</label>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input id="password" ref={pwRef} style={{ flex: 1, minWidth: 0 }} type={show ? "text" : "password"} autoComplete="current-password" placeholder={labels["au.passwordPh"]} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errs.password} aria-describedby={errs.password ? "pw-err" : undefined} maxLength={200} />
          <button type="button" className="ic" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label={show ? labels["au.hide"] : labels["au.show"]}>{show ? "🙈" : "👁"}</button></div>
        {errs.password && <span id="pw-err" role="alert" className="err">{errs.password}</span>}</div>
      {formErr && <div role="alert" className="err" style={{ marginBottom: 10 }}>{formErr}</div>}
      {errKind === "email_not_confirmed" && <div style={{ marginBottom: 10 }}><ResendConfirmation email={email.trim().toLowerCase()} labels={{ btn: labels["rs.btn"], wait: labels["rs.wait"], busy: labels["rs.busy"], sent: labels["rs.sent"], fail: labels["rs.fail"], rate: labels["rs.rate"], notConfigured: labels["rs.notConfigured"] }} /></div>}
      <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>{busy ? labels["au.submitting"] : labels["au.submit"]}</button>
      <p style={{ textAlign: "center", marginTop: 12 }}><Link href="/recuperar-senha">{labels["au.forgot"]}</Link></p>
      <p className="mt" style={{ textAlign: "center", margin: "14px 0 8px" }}>{labels["au.noAccount"]}</p>
      <Link href="/cadastro" className="btn s" style={{ width: "100%", justifyContent: "center", textDecoration: "none" }}>{labels["au.create"]}</Link>
      <p className="src" style={{ textAlign: "center", marginTop: 12 }}>{labels["au.noSocial"]}</p>
      <p className="src" style={{ textAlign: "center", marginTop: 4 }}>{labels["sp.help"]} <Link href="/suporte?assunto=access" data-testid="login-support">{labels["sp.link"]}</Link></p>
    </form>
  );
}
