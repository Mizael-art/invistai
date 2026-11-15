"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Block } from "@/lib/ai/tools";
import type { Lang } from "@/lib/format";
import { Markdown } from "./Markdown";
import { Blocks } from "./Blocks";
import { UpgradeModal } from "./UpgradeModal";

type L = Record<string, string>;
export interface Msg { id: string; role: "user" | "assistant"; content: string; blocks: Block[]; saved: boolean; created_at: string; pending?: boolean }
export interface Conv { id: string; title: string; updated_at: string }
export interface Quota { plan: string; used: number; limit: number | null; remaining: number | null }
const SUGGEST = ["ai.s1", "ai.s2", "ai.s3", "ai.s4"];
const SUGGEST_IC = ["M4 19h16M7 15.5v-4M12 15.5V6.5M17 15.5v-7", "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4", "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18", "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01"];

/** Chat da TRADEON AI. O servidor decide cota, plano e dados; aqui só se envia a pergunta e se exibe a resposta em blocos. */
export function AiChat(p: { lang: Lang; l: L; configured: boolean; billingConfigured: boolean; quota: Quota | null; convs: Conv[]; conv: { id: string; messages: Msg[] } | null; ask?: string | null }) {
  const { l, lang } = p;
  const [convs, setConvs] = useState(p.convs); const [convId, setConvId] = useState<string | null>(p.conv?.id ?? null);
  const [msgs, setMsgs] = useState<Msg[]>(p.conv?.messages ?? []); const [quota, setQuota] = useState(p.quota);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [lock, setLock] = useState(false); const [menu, setMenu] = useState(false);
  const end = useRef<HTMLDivElement>(null); const ta = useRef<HTMLTextAreaElement>(null);
  const exhausted = quota?.limit !== null && quota?.limit !== undefined && (quota.remaining ?? 0) <= 0;
  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [msgs.length, busy]);
  // Vindo do botão "Analisar com TRADEON AI": envia a pergunta uma vez (ou só preenche, se a IA não estiver conectada).
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !p.ask || p.conv) return; asked.current = true;
    history.replaceState(null, "", "/ia");
    if (p.configured) send(p.ask); else { setText(p.ask); setErr(l["ai.notConfigured"]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Mantém a conversa atual no topo da lista (criada agora ou já existente) e na URL. */
  function track(id: string, firstMsg: string) {
    const now = new Date().toISOString();
    setConvs((c) => { const cur = c.find((x) => x.id === id); return [cur ? { ...cur, updated_at: now } : { id, title: firstMsg.slice(0, 60), updated_at: now }, ...c.filter((x) => x.id !== id)]; });
    if (id !== convId) { setConvId(id); history.replaceState(null, "", `/ia?c=${id}`); }
  }
  async function send(q: string) {
    const msg = q.trim(); if (!msg || busy) return;
    if (!p.configured) { setErr(l["ai.notConfigured"]); return; }
    if (exhausted) { setLock(true); return; }
    setErr(null); setBusy(true); setText("");
    const tmp: Msg = { id: `tmp-${Date.now()}`, role: "user", content: msg, blocks: [], saved: false, created_at: new Date().toISOString(), pending: true };
    setMsgs((m) => [...m, tmp]);
    try {
      const r = await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: msg, ...(convId ? { conversationId: convId } : {}) }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setMsgs((m) => [...m.map((x) => (x.id === tmp.id ? { ...x, id: j.userMessage.id, pending: false } : x)), j.message]);
        setQuota(j.quota);
        track(j.conversationId, msg);
      } else {
        setMsgs((m) => m.filter((x) => x.id !== tmp.id)); setText(msg);
        if (r.status === 402) { setQuota((qq) => (qq ? { ...qq, remaining: 0, used: j.used ?? qq.used } : qq)); setLock(true); }
        else setErr(j.error === "rate_limited" ? l["ai.rate"] : j.error === "ai_not_configured" ? l["ai.notConfigured"] : r.status === 401 ? l["ai.session"] : l["ai.fail"]);
        if (j.conversationId) track(j.conversationId, msg);
      }
    } catch { setMsgs((m) => m.filter((x) => x.id !== tmp.id)); setText(msg); setErr(l["ai.fail"]); }
    setBusy(false); ta.current?.focus();
  }
  async function toggleSave(m: Msg) {
    const r = await fetch(`/api/ai/messages/${m.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ saved: !m.saved }) });
    if (r.ok) setMsgs((all) => all.map((x) => (x.id === m.id ? { ...x, saved: !m.saved } : x)));
  }
  async function remove(id: string) {
    const r = await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
    if (r.ok) { setConvs((c) => c.filter((x) => x.id !== id)); if (id === convId) { setConvId(null); setMsgs([]); history.replaceState(null, "", "/ia"); } }
  }
  const newChat = () => { setConvId(null); setMsgs([]); setErr(null); setMenu(false); history.replaceState(null, "", "/ia"); ta.current?.focus(); };

  return (<div className="ai-wrap">
    <aside className={`ai-side card ${menu ? "open" : ""}`} aria-label={l["ai.history"]}>
      <button type="button" className="btn" style={{ width: "100%" }} onClick={newChat} data-testid="ai-new">+ {l["ai.new"]}</button>
      <Link href="/ia?view=saved" className="ai-saved-link">★ {l["ai.saved"]}</Link>
      <p className="ai-side-h">{l["ai.history"]}</p>
      {convs.length === 0 ? <p className="mt src">{l["ai.noConvs"]}</p> : <ul className="ai-convs">{convs.map((c) => <li key={c.id} className={c.id === convId ? "on" : ""}>
        <a href={`/ia?c=${c.id}`} title={c.title}>{c.title}</a>
        <button type="button" className="ic sm" aria-label={`${l["ai.delete"]}: ${c.title}`} onClick={() => remove(c.id)} data-testid="ai-del">×</button></li>)}</ul>}
    </aside>
    <section className="ai-main" aria-label="TRADEON AI">
      <div className="ai-head">
        <button type="button" className="ic ai-menu-btn" aria-expanded={menu} aria-label={l["ai.history"]} onClick={() => setMenu((v) => !v)}>☰</button>
        <h1><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg> TRADEON <span>AI</span></h1>
        <p className="mt">{l["ai.sub"]}</p>
      </div>
      {!p.configured && <p className="note" role="status" data-testid="ai-off">{l["ai.notConfigured"]}</p>}
      <div className="ai-log" aria-live="polite">
        {msgs.length === 0 && <div className="ai-sug" data-testid="ai-suggestions">{SUGGEST.map((k, i) => <button key={k} type="button" className="ai-sug-i" disabled={busy} onClick={() => send(l[k])}>
          <span className="ai-sug-ic" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={SUGGEST_IC[i]} /></svg></span>{l[k]}</button>)}</div>}
        {msgs.map((m) => m.role === "user"
          ? <div key={m.id} className="ai-msg u" data-testid="ai-user"><p>{m.content}</p></div>
          : <article key={m.id} className="ai-msg a" data-testid="ai-answer">
              <div className="ai-av" aria-hidden="true">✦</div>
              <div className="ai-body"><Markdown text={m.content} /><Blocks blocks={m.blocks} l={l} lang={lang} />
                <div className="row ai-acts"><button type="button" className={`chip sm ${m.saved ? "on" : ""}`} aria-pressed={m.saved} onClick={() => toggleSave(m)} data-testid="ai-save">{m.saved ? `★ ${l["ai.savedOne"]}` : `☆ ${l["ai.save"]}`}</button></div>
              </div></article>)}
        {busy && <div className="ai-msg a" data-testid="ai-busy"><div className="ai-av" aria-hidden="true">✦</div><div className="ai-body"><p className="mt ai-dots">{l["ai.thinking"]}</p></div></div>}
        <div ref={end} />
      </div>
      {err && <p className="note" role="alert" data-testid="ai-err">{err}</p>}
      <div className="ai-foot">
        {quota && (quota.limit !== null
          ? <div className="ai-quota" data-testid="ai-quota"><div className="row sp"><span>{l["ai.freeQuota"].replace("{used}", String(Math.min(quota.used, quota.limit))).replace("{limit}", String(quota.limit))}</span>{exhausted && <button type="button" className="lnk" onClick={() => setLock(true)}>{l["pl.compare"]}</button>}</div>
              <div className="ai-bar"><i style={{ width: `${Math.min(100, (quota.used / quota.limit) * 100)}%` }} /></div></div>
          : <p className="src ai-quota" data-testid="ai-quota">{l["ai.unlimited"].replace("{plan}", quota.plan.toUpperCase())}</p>)}
        <form className="ai-form" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <label htmlFor="ai-in" className="sr">{l["ai.placeholder"]}</label>
          <textarea id="ai-in" ref={ta} rows={1} maxLength={2000} value={text} placeholder={l["ai.placeholder"]}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }} data-testid="ai-input" />
          <button type="submit" className="btn ai-send" aria-label={l["ai.send"]} disabled={busy || !text.trim()} data-testid="ai-send">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z" /></svg></button>
        </form>
        <p className="src ai-disc">{l["ai.disclaimer"]}</p>
      </div>
    </section>
    {lock && <UpgradeModal l={l} limit={quota?.limit ?? 3} billingConfigured={p.billingConfigured} onClose={() => setLock(false)} />}
  </div>);
}
