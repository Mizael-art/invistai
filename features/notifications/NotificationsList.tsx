"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export interface ViewNotification { id: string; category: string; title: string; message: string; when: string; whenFull: string; target: string | null; unread: boolean }
type L = Record<string, string>;

export function NotificationsList({ items, unreadTotal, labels }: { items: ViewNotification[]; unreadTotal: number; labels: L }) {
  const router = useRouter(); const [, start] = useTransition();
  const [read, setRead] = useState<Set<string>>(new Set()); const [allRead, setAllRead] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null); const [busy, setBusy] = useState(false); const lock = useRef(false);
  const isUnread = (n: ViewNotification) => n.unread && !allRead && !read.has(n.id);

  async function mark(body: object): Promise<boolean> {
    try { const r = await fetch("/api/notifications/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return r.ok; } catch { return false; }
  }
  async function markOne(n: ViewNotification) {
    if (lock.current) return; lock.current = true; setMsg(null);
    setRead((s) => new Set(s).add(n.id));                                    // otimista
    const ok = await mark({ ids: [n.id] }); lock.current = false;
    if (!ok) { setRead((s) => { const c = new Set(s); c.delete(n.id); return c; }); setMsg({ ok: false, text: labels["nt.markFail"] }); return; }
    start(() => router.refresh());                                           // atualiza o contador do sino
  }
  async function open(n: ViewNotification) {
    if (isUnread(n)) await mark({ ids: [n.id] });
    if (n.target) router.push(n.target); else start(() => router.refresh());
  }
  async function markAll() {
    if (busy) return; setBusy(true); setMsg(null);
    const ok = await mark({ all: true }); setBusy(false);
    if (ok) { setAllRead(true); setMsg({ ok: true, text: labels["nt.readOk"] }); start(() => router.refresh()); } else setMsg({ ok: false, text: labels["nt.markFail"] });
  }
  // `read` guarda o que foi marcado nesta tela; após router.refresh() o servidor já desconta esses itens (n.unread=false), então só subtrai os ainda não refletidos.
  const remaining = allRead ? 0 : Math.max(0, unreadTotal - items.filter((n) => n.unread && read.has(n.id)).length);
  useEffect(() => { window.dispatchEvent(new CustomEvent("iv:unread", { detail: remaining })); }, [remaining]);
  return (<>
    <div className="row sp"><span className="mt" data-testid="unread-total">{labels["nt.count"].replace("{n}", String(remaining))}</span>
      <div className="row"><button className="btn s" onClick={markAll} disabled={busy || remaining === 0}>{labels["nt.markAll"]}</button>
        {msg && <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "fav-msg" : "err"}>{msg.text}</span>}</div></div>
    <ul className="nt-list" aria-label={labels["nt.title"]}>
      {items.map((n) => { const u = isUnread(n); return (
        <li key={n.id} className={`card nt-item ${u ? "u" : ""}`} data-id={n.id} data-unread={u}>
          <div className="nt-body">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ gap: 8 }}>{u && <span className="nt-dot" aria-hidden="true" />}<span className="bd">{n.category}</span>{u && <span className="sr">{labels["nt.unread"]}</span>}</div>
              <h2 style={{ margin: "10px 0 4px", fontWeight: u ? 700 : 600 }}>{n.title}</h2>
              <p style={{ margin: 0 }}>{n.message}</p>
              <p className="src" style={{ marginTop: 6 }}><time title={n.whenFull}>{labels["nt.received"].replace("{when}", n.when)}</time></p>
            </div>
            <div className="row nt-act">
              {n.target && <button className="btn s" onClick={() => open(n)}>{labels["nt.open"]}</button>}
              {u && <button className="btn s" onClick={() => markOne(n)} aria-label={`${labels["nt.markOne"]}: ${n.title}`}>{labels["nt.markOne"]}</button>}
            </div>
          </div>
        </li>); })}
    </ul>
  </>);
}
