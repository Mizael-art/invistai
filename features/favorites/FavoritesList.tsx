"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Coin } from "@/components/ui/Coin";

export type ViewItem =
  | { kind: "asset"; id: string; title: string; name: string; saved: string; live: { price: string; change: string; tone: "up" | "dn" | ""; meta: string; stale: boolean } | null }
  | { kind: "news"; id: string; title: string; source: string | null; published: string | null; saved: string; url: string | null; category: string | null };
type L = Record<string, string>;

export function FavoritesList({ items, labels }: { items: ViewItem[]; labels: L }) {
  const router = useRouter(); const [, start] = useTransition();
  const [removed, setRemoved] = useState<Set<string>>(new Set()); const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const lock = useRef(false);
  const key = (i: ViewItem) => `${i.kind}:${i.id}`;
  const visible = items.filter((i) => !removed.has(key(i)));

  async function remove(i: ViewItem) {
    if (lock.current) return; lock.current = true; setBusy(key(i)); setErr(null);
    try {
      const r = await fetch("/api/favorites", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemType: i.kind, itemId: i.id }) });
      if (r.ok) { setRemoved((s) => new Set(s).add(key(i))); window.dispatchEvent(new CustomEvent("iv:fav-removed", { detail: i.kind })); start(() => router.refresh()); }          // atualiza contadores e paginação no servidor
      else setErr(r.status === 401 ? labels["pf.err.unauthenticated"] : labels["fv.removeFail"]);
    } catch { setErr(labels["fv.removeFail"]); }
    finally { lock.current = false; setBusy(null); }
  }
  if (visible.length === 0) return (<div className="note" role="status" data-testid="fv-all-removed"><p>{labels["fv.allRemoved"]}</p><button className="btn s" onClick={() => window.location.reload()}>{labels["fv.reload"]}</button></div>);
  return (<div className="grid" style={{ gap: 12 }}>
    {err && <div role="alert" className="err">{err}</div>}
    {visible.map((i) => (
      <article key={key(i)} className="card" data-kind={i.kind} data-id={i.id}>
        {i.kind === "asset" ? (
          <div className="row sp" style={{ alignItems: "flex-start" }}>
            <div className="row" style={{ alignItems: "flex-start", flex: 1, minWidth: 0 }}><Coin symbol={i.title.replace("USD/", "")} />
              <div style={{ minWidth: 0 }}><h2 style={{ margin: 0 }}>{i.title} <span className="mt" style={{ fontSize: 14, fontWeight: 400 }}>{i.name}</span></h2>
                {i.live ? (<><p className="num" style={{ margin: "6px 0 2px" }}>{i.live.price} <span className={`chg ${i.live.tone || "flat"}`}>{i.live.change}</span></p><p className="src">{i.live.meta}{i.live.stale && <span className="bd a stale">{labels["home.stale"]}</span>}</p></>)
                  : <p className="note" role="status" style={{ marginTop: 6 }}>{labels["fv.quoteUnavailable"]}</p>}
                <p className="src">{labels["fv.saved"].replace("{when}", i.saved)}</p></div></div>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <Link href={`/mercado/${i.id}`} className="btn s" style={{ textDecoration: "none" }}>{labels["fv.openAsset"]}</Link>
              <button className="btn d" onClick={() => remove(i)} disabled={busy === key(i)} aria-label={`${labels["fv.remove"]}: ${i.title}`}>{busy === key(i) ? labels["fv.removing"] : labels["fv.remove"]}</button></div>
          </div>
        ) : (
          <div className="row sp" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {i.category && <span className="bd">{i.category}</span>}
              <h2 style={{ margin: "8px 0 6px" }}>{i.url ? <a href={i.url} target="_blank" rel="noopener noreferrer">{i.title}</a> : i.title}</h2>
              {i.url ? <p className="src">{i.source} · {labels["fv.published"].replace("{when}", i.published ?? "")}</p> : <p className="note" role="status">{labels["fv.newsNoData"]}</p>}
              <p className="src">{labels["fv.saved"].replace("{when}", i.saved)}</p></div>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              {i.url && <a href={i.url} target="_blank" rel="noopener noreferrer" className="btn s" style={{ textDecoration: "none" }}>{labels["fv.openNews"]} ↗</a>}
              <button className="btn d" onClick={() => remove(i)} disabled={busy === key(i)} aria-label={`${labels["fv.remove"]}: ${i.title}`}>{busy === key(i) ? labels["fv.removing"] : labels["fv.remove"]}</button></div>
          </div>
        )}
      </article>))}
  </div>);
}
