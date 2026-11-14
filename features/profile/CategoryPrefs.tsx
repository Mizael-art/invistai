"use client";
import { useState } from "react";

type L = Record<string, string>;
export function CategoryPrefs({ kind, cats, initial, title, hint, labels }: { kind: "news" | "notifications"; cats: { key: string; label: string }[]; initial: string[]; title: string; hint: string; labels: L }) {
  const [saved, setSaved] = useState([...initial].sort()); const [sel, setSel] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null); const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify([...sel].sort()) !== JSON.stringify(saved);
  async function save() {
    if (busy) return; setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(kind === "news" ? { newsCategories: sel } : { notificationCategories: sel }) });
      if (r.ok) { setSaved([...sel].sort()); setMsg({ ok: true, text: labels["pf.catSaved"] }); }
      else { const j = (await r.json().catch(() => ({}))) as { error?: string }; setMsg({ ok: false, text: labels[`pf.err.${j.error}`] ?? labels["pf.err.unavailable"] }); }
    } catch { setMsg({ ok: false, text: labels["au.err.network"] }); } finally { setBusy(false); }
  }
  return (<fieldset style={{ border: 0, padding: 0, margin: 0 }} data-testid={`prefs-${kind}`}><legend style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>{title}</legend><p className="src">{hint}</p>
    <div className="row" style={{ margin: "8px 0" }}>{cats.map((c) => (<label key={c.key} className="chip" style={{ cursor: "pointer" }}><input type="checkbox" checked={sel.includes(c.key)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, c.key] : s.filter((x) => x !== c.key)))} /> {c.label}</label>))}</div>
    <div className="row"><button type="button" className="btn" onClick={save} disabled={!dirty || busy}>{labels["pf.catSave"]}</button>{msg && <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "fav-msg" : "err"}>{msg.text}</span>}</div></fieldset>);
}
