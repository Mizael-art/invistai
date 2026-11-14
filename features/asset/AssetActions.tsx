"use client";
import { useState } from "react";
import { FavoriteButton } from "@/features/home/FavoriteButton";

type FL = { add: string; remove: string; login: string; notConfigured: string; fail: string };
export function AssetActions({ id, initialFav, title, labels, fav, metadata }: { id: string; initialFav: boolean; title: string; labels: { share: string; copied: string; shareFail: string }; fav: FL; metadata?: Record<string, unknown> }) {
  const [msg, setMsg] = useState<string | null>(null);
  async function share() {
    const url = window.location.href; setMsg(null);
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url); setMsg(labels.copied);
    } catch (e) { if ((e as Error)?.name !== "AbortError") setMsg(labels.shareFail); }
  }
  return (<div className="row" style={{ alignItems: "flex-start" }}>
    <button className="btn s" onClick={share}>{labels.share}</button>
    <FavoriteButton itemType="asset" itemId={id} initial={initialFav} labels={fav} metadata={metadata} />
    {msg && <span role="status" className="fav-msg">{msg}</span>}
  </div>);
}
