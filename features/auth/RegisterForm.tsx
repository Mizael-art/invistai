"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { emailField } from "@/schemas/auth";
import { isValidName, normalizeName, normalizePhone, passwordOk, passwordRules, MAX_PASSWORD } from "@/lib/validation";
import { ResendConfirmation } from "./ResendConfirmation";

type L = Record<string, string>;
type Errs = Partial<Record<"name" | "email" | "phone" | "password", string>>;
export function RegisterForm({ labels }: { labels: L }) {
  const [v, setV] = useState({ name: "", email: "", phone: "", password: "" });
  const [show, setShow] = useState(false); const [errs, setErrs] = useState<Errs>({}); const [formErr, setFormErr] = useState<{ key: string } | null>(null);
  const [busy, setBusy] = useState(false); const [done, setDone] = useState<string | null>(null); const lock = useRef(false);
  const refs = { name: useRef<HTMLInputElement>(null), email: useRef<HTMLInputElement>(null), phone: useRef<HTMLInputElement>(null), password: useRef<HTMLInputElement>(null) };
  const rules = useMemo(() => passwordRules(v.password), [v.password]);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (lock.current) return; setFormErr(null);
    const er: Errs = {}, name = normalizeName(v.name), email = v.email.trim();
    if (!name) er.name = labels["rg.err.nameRequired"]; else if (!isValidName(name)) er.name = labels["rg.err.nameInvalid"];
    if (!email) er.email = labels["au.err.emailRequired"]; else if (!emailField.safeParse(email).success) er.email = labels["au.err.emailInvalid"];
    if (!v.phone.trim()) er.phone = labels["rg.err.phoneRequired"]; else if (!normalizePhone(v.phone)) er.phone = labels["rg.err.phoneInvalid"];
    if (!v.password) er.password = labels["rg.err.passwordRequired"]; else if (!passwordOk(v.password)) er.password = labels["rg.err.passwordWeak"];
    setErrs(er);
    const first = (["name", "email", "phone", "password"] as const).find((k) => er[k]); if (first) { refs[first].current?.focus(); return; }
    lock.current = true; setBusy(true);
    try {
      const r = await fetch("/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, email, phone: v.phone, password: v.password }) });
      const j = (await r.json().catch(() => ({}))) as { status?: string; error?: string };
      if (r.ok && j.status === "signed_in") { window.location.assign("/"); return; }
      if (r.ok && j.status === "confirmation_required") { setDone(email.toLowerCase()); return; }
      setFormErr({ key: j.error ?? "unavailable" });
    } catch { setFormErr({ key: "network" }); }
    finally { lock.current = false; setBusy(false); }
  }

  if (done) return (<div role="status" style={{ textAlign: "center" }}>
    <div className="coin" style={{ width: 72, height: 72, fontSize: 30, background: "var(--gd)", color: "var(--g)", border: "1px solid var(--g)", margin: "0 auto 12px" }}>✉</div>
    <h2>{labels["rg.ok.title"]}</h2>
    <p>{labels["rg.ok.text"].replace("{email}", done)}</p><p className="mt">{labels["rg.ok.spam"]}</p>
    <div className="row" style={{ justifyContent: "center", margin: "12px 0" }}><ResendConfirmation email={done} initialCooldown={60} labels={{ btn: labels["rs.btn"], wait: labels["rs.wait"], busy: labels["rs.busy"], sent: labels["rs.sent"], fail: labels["rs.fail"], rate: labels["rs.rate"], notConfigured: labels["rs.notConfigured"] }} /></div>
    <Link href="/login" className="btn" style={{ textDecoration: "none", justifyContent: "center", width: "100%" }}>{labels["rg.back"]}</Link>
  </div>);

  const field = (id: keyof typeof v, label: string, node: React.ReactNode, hint?: string) => (
    <div className="field"><label htmlFor={id}>{label}</label>{node}{hint && !errs[id] && <span className="src">{hint}</span>}{errs[id] && <span id={`${id}-err`} role="alert" className="err">{errs[id]}</span>}</div>);
  const inp = (id: keyof typeof v, extra: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input id={id} ref={refs[id]} value={v[id]} onChange={set(id)} aria-invalid={!!errs[id]} aria-describedby={errs[id] ? `${id}-err` : undefined} {...extra} />);
  return (
    <form onSubmit={submit} noValidate aria-label={labels["rg.title"]}>
      <h2>{labels["rg.title"]}</h2><p className="mt">{labels["rg.sub"]}</p>
      {field("name", labels["rg.name"], inp("name", { type: "text", autoComplete: "name", placeholder: labels["rg.namePh"], maxLength: 120 }))}
      {field("email", labels["au.email"], inp("email", { type: "email", inputMode: "email", autoComplete: "email", autoCapitalize: "none", spellCheck: false, placeholder: labels["au.emailPh"], maxLength: 254 }))}
      {field("phone", labels["rg.phone"], inp("phone", { type: "tel", inputMode: "tel", autoComplete: "tel", placeholder: labels["rg.phonePh"], maxLength: 30 }), labels["rg.phoneHint"])}
      {field("password", labels["rg.password"], <div className="row" style={{ flexWrap: "nowrap" }}>{inp("password", { type: show ? "text" : "password", autoComplete: "new-password", placeholder: labels["rg.passwordPh"], maxLength: MAX_PASSWORD, style: { flex: 1, minWidth: 0 } })}
        <button type="button" className="ic" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label={show ? labels["au.hide"] : labels["au.show"]}>{show ? "🙈" : "👁"}</button></div>)}
      <ul className="ck" aria-label={labels["rg.pwTitle"]} style={{ margin: "0 0 12px" }}>
        {(["length", "upper", "number", "special"] as const).map((k) => (<li key={k} data-rule={k} data-ok={rules[k]} style={{ opacity: rules[k] ? 1 : 0.55 }}>{labels[`rg.pw.${k}`]}<span className="sr">{rules[k] ? " ✓" : ""}</span></li>))}
      </ul>
      {formErr && <div role="alert" className="err" style={{ marginBottom: 10 }}>{labels[`au.err.${formErr.key}`] ?? labels["au.err.unavailable"]}
        {formErr.key === "email_exists" && <><br />{labels["au.existsHelp"]} <Link href="/login">{labels["au.submit"]}</Link> · <Link href="/recuperar-senha">{labels["au.forgot"]}</Link></>}</div>}
      <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>{busy ? labels["rg.submitting"] : labels["rg.submit"]}</button>
      <p style={{ textAlign: "center", marginTop: 12 }}>{labels["rg.haveAccount"]} <Link href="/login">{labels["rg.back"]}</Link></p>
    </form>
  );
}
