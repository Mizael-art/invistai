"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

export function FavoritesToolbar({ q, dirty, labels }: { q: string; dirty: boolean; labels: { search: string; clear: string; clearAll: string } }) {
  const router = useRouter(); const sp = useSearchParams();
  const [text, setText] = useState(q); const timer = useRef<ReturnType<typeof setTimeout>>(undefined); const input = useRef<HTMLInputElement>(null);
  // Sincroniza com a URL só quando a mudança vem de fora (abas, "Limpar"): uma resposta atrasada não sobrescreve o que o usuário está digitando.
  useEffect(() => { if (document.activeElement !== input.current) setText(q); }, [q]);
  function push(mut: (p: URLSearchParams) => void) { const p = new URLSearchParams(sp.toString()); mut(p); p.delete("page"); const s = p.toString(); router.replace(s ? `/favoritos?${s}` : "/favoritos", { scroll: false }); }
  function onText(v: string) { setText(v); clearTimeout(timer.current); timer.current = setTimeout(() => push((p) => { const t = v.replace(/\s+/g, " ").trim(); if (t) p.set("q", t); else p.delete("q"); }), 400); }
  return (<div className="row">
    <div className="ico-in" style={{ flex: "1 1 260px", maxWidth: 420 }}><Icon name="search" size={18} />
      <input ref={input} type="search" value={text} maxLength={80} onChange={(e) => onText(e.target.value)} placeholder={labels.search} aria-label={labels.search} /></div>
    {text && <button className="btn s" onClick={() => { setText(""); clearTimeout(timer.current); push((p) => p.delete("q")); }}>{labels.clear}</button>}
    {dirty && <button className="btn s" onClick={() => { setText(""); router.replace("/favoritos", { scroll: false }); }}>{labels.clearAll}</button>}
  </div>);
}
