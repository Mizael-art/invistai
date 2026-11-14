"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function RefreshButton({ labels, variant = "s" }: { labels: { idle: string; busy: string; fail: string; wait: string }; variant?: "s" | "" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/refresh", { method: "POST" });
      if (r.status === 429) setMsg(labels.wait);
      else if (!r.ok) setMsg(labels.fail);
      else start(() => router.refresh());
    } catch { setMsg(labels.fail); }
    finally { setBusy(false); }
  }
  return (<span className="row" style={{ display: "inline-flex" }}><button className={`btn ${variant}`} onClick={run} disabled={busy || pending}>{busy || pending ? labels.busy : labels.idle}</button>{msg && <span role="alert" className="fav-msg">{msg}</span>}</span>);
}
