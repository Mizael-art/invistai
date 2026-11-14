"use client";
import { useState } from "react";

type L = Record<string, string>;
/** Tema e idioma salvos na conta (valem em outros dispositivos após o login). Recarrega para aplicar. */
export function AppPrefs({ theme, lang, labels }: { theme: "dark" | "light"; lang: "pt" | "en"; labels: L }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function save(body: { theme?: string; lang?: string }) {
    if (busy) return; setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/preferences/app", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (r.ok) { window.location.reload(); return; }
      const j = (await r.json().catch(() => ({}))) as { error?: string }; setErr(labels[`pf.err.${j.error}`] ?? labels["pf.err.unavailable"]);
    } catch { setErr(labels["au.err.network"]); }
    setBusy(false);
  }
  const seg = (label: string, items: [string, string][], cur: string, key: "theme" | "lang") => (
    <div className="field"><span id={`seg-${key}`} style={{ fontSize: 13, color: "var(--mt)" }}>{label}</span>
      <div className="seg" role="group" aria-labelledby={`seg-${key}`}>{items.map(([v, l]) => (<button key={v} type="button" className={cur === v ? "on" : ""} aria-pressed={cur === v} disabled={busy} onClick={() => cur !== v && save({ [key]: v })}>{l}</button>))}</div></div>);
  return (<section aria-label={labels["pf.prefs"]}><h2>{labels["pf.prefs"]}</h2>
    {seg(labels["pf.theme"], [["dark", labels["pf.dark"]], ["light", labels["pf.light"]]], theme, "theme")}
    {seg(labels["pf.lang"], [["pt", labels["pf.pt"]], ["en", labels["pf.en"]]], lang, "lang")}
    {err && <div role="alert" className="err">{err}</div>}</section>);
}
