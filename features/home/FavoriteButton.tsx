"use client";
import Link from "next/link";
import { useState } from "react";

type L = { add: string; remove: string; login: string; notConfigured: string; fail: string };
export function FavoriteButton({ itemType, itemId, initial, labels, metadata }: { itemType: "asset" | "news"; itemId: string; initial: boolean; labels: L; metadata?: Record<string, unknown> }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<"login" | "notConfigured" | "fail" | null>(null);
  async function toggle() {
    if (busy) return;
    const next = !on; setOn(next); setBusy(true); setMsg(null);        // otimista
    try {
      const r = await fetch("/api/favorites", { method: next ? "POST" : "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(next && metadata ? { itemType, itemId, metadata } : { itemType, itemId }) });
      if (!r.ok) { setOn(!next); setMsg(r.status === 401 ? "login" : r.status === 503 ? "notConfigured" : "fail"); }
    } catch { setOn(!next); setMsg("fail"); }
    finally { setBusy(false); }
  }
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end" }}>
      <button className="ic" onClick={toggle} aria-pressed={on} aria-label={on ? labels.remove : labels.add} disabled={busy}>{on ? "★" : "☆"}</button>
      {msg === "login" ? <Link className="fav-msg" href="/login">{labels.login}</Link> : msg ? <span role="alert" className="fav-msg">{labels[msg]}</span> : null}
    </span>
  );
}
