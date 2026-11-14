"use client";
import { useRef, useState } from "react";
import { SUPPORT_TOPICS, isSupportTopic, mailtoHref, type SupportTopic } from "@/lib/support";

type L = Record<string, string>;
/** Contato por e-mail: assunto, link mailto: válido e cópia do endereço configurado. Só é renderizado com e-mail configurado. */
export function SupportContact({ email, labels, initialTopic }: { email: string; labels: L; initialTopic?: string }) {
  const [topic, setTopic] = useState<SupportTopic>(isSupportTopic(initialTopic) ? initialTopic : "general");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const addr = useRef<HTMLElement>(null);
  const subject = labels["sp.subject"].replace("{topic}", labels[`sp.t.${topic}`]);
  const href = mailtoHref(email, subject, labels["sp.body"].replace(/\\n/g, "\n"));
  function selectAddr() { const el = addr.current; if (!el) return; const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); }
  async function copy() {
    setMsg(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no-clipboard");
      await navigator.clipboard.writeText(email); setMsg({ ok: true, text: labels["sp.copied"] });
    } catch { selectAddr(); setMsg({ ok: false, text: labels["sp.copyFail"] }); }
  }
  return (<div data-testid="sp-contact">
    <p className="src" style={{ margin: "0 0 4px" }}>{labels["sp.addr"]}</p>
    <p style={{ margin: "0 0 14px", fontSize: 18, fontWeight: 700, wordBreak: "break-all" }}><code ref={addr} data-testid="sp-email" style={{ fontFamily: "inherit" }}>{email}</code></p>
    <div className="field"><label htmlFor="sp-topic">{labels["sp.topic"]}</label>
      <select id="sp-topic" value={topic} onChange={(e) => { if (isSupportTopic(e.target.value)) setTopic(e.target.value); }}>
        {SUPPORT_TOPICS.map((t) => <option key={t} value={t}>{labels[`sp.t.${t}`]}</option>)}</select></div>
    <div className="row" style={{ marginTop: 12 }}>
      <a className="btn" href={href} data-testid="sp-mailto" style={{ textDecoration: "none" }}>{labels["sp.open"]}</a>
      <button type="button" className="btn s" onClick={copy}>{labels["sp.copy"]}</button>
    </div>
    <div aria-live="polite" style={{ minHeight: 22, marginTop: 8 }}>{msg && <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "fav-msg" : "err"} data-testid="sp-msg">{msg.text}</span>}</div>
    <p className="src">{labels["sp.mailNote"]}</p>
  </div>);
}
