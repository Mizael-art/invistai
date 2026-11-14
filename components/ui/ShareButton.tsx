"use client";
import { useState } from "react";
/** Compartilha uma URL (Web Share API ou cópia para a área de transferência), com feedback. */
export function ShareButton({ url, title, labels, className = "ic" }: { url: string; title: string; labels: { share: string; copied: string; fail: string }; className?: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  async function go() {
    setMsg(null);
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url); setMsg(labels.copied);
    } catch (e) { if ((e as Error)?.name !== "AbortError") setMsg(labels.fail); }
  }
  return (<span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end" }}><button className={className} onClick={go} aria-label={labels.share} title={labels.share}>↗</button>{msg && <span role="status" className="fav-msg">{msg}</span>}</span>);
}
