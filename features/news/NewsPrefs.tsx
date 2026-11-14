"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Cat = { key: string; label: string };
type L = { title: string; hint: string; save: string; saved: string; login: string; notConfigured: string; fail: string };
export function NewsPrefs({ cats, initial, loggedIn, labels }: { cats: Cat[]; initial: string[]; loggedIn: boolean; labels: L }) {
  const router = useRouter();
  const [sel, setSel] = useState<string[]>(initial);
  const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ newsCategories: sel }) });
      if (r.ok) { setMsg(labels.saved); router.refresh(); } else setMsg(r.status === 401 ? labels.login : r.status === 503 ? labels.notConfigured : labels.fail);
    } catch { setMsg(labels.fail); } finally { setBusy(false); }
  }
  return (<details className="card"><summary>{labels.title}</summary>
    <p className="src">{labels.hint}</p>
    {!loggedIn ? <p><Link href="/login">{labels.login}</Link></p> : (<>
      <div className="row">{cats.map((c) => (<label key={c.key} className="chip" style={{ cursor: "pointer" }}><input type="checkbox" checked={sel.includes(c.key)} onChange={(e) => setSel((s) => e.target.checked ? [...s, c.key] : s.filter((x) => x !== c.key))} /> {c.label}</label>))}</div>
      <div className="row" style={{ marginTop: 10 }}><button className="btn" onClick={save} disabled={busy}>{labels.save}</button>{msg && <span role="status" className="fav-msg">{msg}</span>}</div></>)}
  </details>);
}
