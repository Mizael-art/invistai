"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

type L = { search: string; clear: string; filter: string; all: string; up: string; down: string; clearAll: string };
export function MarketToolbar({ q, filter, dirty, labels }: { q: string; filter: string; dirty: boolean; labels: L }) {
  const router = useRouter(); const sp = useSearchParams();
  const [text, setText] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const input = useRef<HTMLInputElement>(null);
  // Só sincroniza com a URL se o campo não estiver em uso: resposta atrasada não sobrescreve a digitação.
  useEffect(() => { if (document.activeElement !== input.current) setText(q); }, [q]);
  function push(mut: (p: URLSearchParams) => void) { const p = new URLSearchParams(sp.toString()); mut(p); p.delete("page"); router.replace(`/mercado?${p.toString()}`, { scroll: false }); }
  function onText(v: string) {
    setText(v); clearTimeout(timer.current);
    timer.current = setTimeout(() => push((p) => { const t = v.replace(/\s+/g, " ").trim(); if (t) p.set("q", t); else p.delete("q"); }), 400);   // debounce: evita consultas repetidas
  }
  return (
    <div className="row" style={{ alignItems: "center" }}>
      <div className="ico-in" style={{ flex: "1 1 260px", maxWidth: 420 }}>
        <Icon name="search" size={18} />
        <input ref={input} type="search" value={text} maxLength={60} onChange={(e) => onText(e.target.value)} placeholder={labels.search} aria-label={labels.search} />
      </div>
      {text && <button className="btn s" onClick={() => { setText(""); clearTimeout(timer.current); push((p) => p.delete("q")); }}>{labels.clear}</button>}
      <label className="row" style={{ gap: 6 }}><span className="mt">{labels.filter}</span>
        <select value={filter} aria-label={labels.filter} onChange={(e) => push((p) => { if (e.target.value === "all") p.delete("filter"); else p.set("filter", e.target.value); })}>
          <option value="all">{labels.all}</option><option value="up">{labels.up}</option><option value="down">{labels.down}</option>
        </select></label>
      {dirty && <button className="btn s" onClick={() => { setText(""); const cat = sp.get("cat"); router.replace(cat ? `/mercado?cat=${cat}` : "/mercado", { scroll: false }); }}>{labels.clearAll}</button>}
    </div>
  );
}
