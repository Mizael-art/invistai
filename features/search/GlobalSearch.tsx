"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { SearchResponse } from "@/services/search";

type L = Record<"placeholder" | "label" | "clear" | "open" | "close" | "searching" | "min" | "empty" | "assets" | "markets" | "pending" | "errCrypto" | "errRate" | "errAll" | "retry", string>;
type Status = "idle" | "loading" | "done" | "error" | "rate";
type Option = { key: string; href: string; kind: "asset" | "market" };

/** Busca global do cabeçalho: SOMENTE ativos e mercados. Debounce de 300 ms, cancela requisições anteriores e reaproveita resultados já obtidos. */
export function GlobalSearch({ labels }: { labels: L }) {
  const router = useRouter(); const listId = useId();
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false); const [mobileOpen, setMobileOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle"); const [data, setData] = useState<SearchResponse | null>(null); const [active, setActive] = useState(-1);
  const cache = useRef(new Map<string, SearchResponse>()); const ctrl = useRef<AbortController | null>(null); const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const box = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null);
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();

  const run = useCallback(async (raw: string) => {
    const t = norm(raw);
    if (t.length < 2) { ctrl.current?.abort(); setStatus("idle"); setData(null); return; }
    const hit = cache.current.get(t.toLowerCase());
    if (hit) { setData(hit); setStatus("done"); setActive(-1); return; }          // evita requisições repetidas
    ctrl.current?.abort(); const c = new AbortController(); ctrl.current = c; setStatus("loading");
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(t)}`, { signal: c.signal });
      if (r.status === 429) { setStatus("rate"); return; }
      if (!r.ok) { setStatus("error"); return; }
      const j = (await r.json()) as SearchResponse;
      if (!j.errors.length) cache.current.set(t.toLowerCase(), j);
      setData(j); setStatus("done"); setActive(-1);
    } catch (e) { if ((e as Error).name !== "AbortError") setStatus("error"); }
  }, []);

  function onChange(v: string) { setQ(v); setOpen(true); clearTimeout(timer.current); timer.current = setTimeout(() => run(v), 300); }
  function clear() { setQ(""); setData(null); setStatus("idle"); setActive(-1); clearTimeout(timer.current); ctrl.current?.abort(); input.current?.focus(); }
  function close() { setOpen(false); setActive(-1); setMobileOpen(false); }
  function go(href: string) { close(); setQ(""); setData(null); setStatus("idle"); router.push(href); }

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setMobileOpen(true); setOpen(true); setTimeout(() => input.current?.focus(), 0); } };
    document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); clearTimeout(timer.current); ctrl.current?.abort(); };
  }, []);
  useEffect(() => { if (mobileOpen) input.current?.focus(); }, [mobileOpen]);

  const opts: Option[] = [...(data?.assets ?? []).map((a) => ({ key: `a:${a.id}`, href: a.href, kind: "asset" as const })), ...(data?.markets ?? []).map((m) => ({ key: `m:${m.key}`, href: m.href, kind: "market" as const }))];
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { if (q) clear(); else { close(); input.current?.blur(); } return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => (opts.length ? (i + 1) % opts.length : -1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (opts.length ? (i <= 0 ? opts.length - 1 : i - 1) : -1)); }
    else if (e.key === "Enter") { e.preventDefault(); const o = opts[active] ?? opts[0]; if (o && status === "done") go(o.href); }
  }
  const t = norm(q), showPanel = open && t.length > 0;
  const idx = (k: string) => opts.findIndex((o) => o.key === k);
  return (<>
    <button type="button" className="ic gs-m" aria-label={labels.open} onClick={() => { setMobileOpen(true); setOpen(true); }}><Icon name="search" size={18} /></button>
    <div ref={box} className={`sw ${mobileOpen ? "sw-open" : ""}`} role="search">
      <span style={{ position: "absolute", left: 10, top: 10, color: "var(--mt)" }} aria-hidden="true"><Icon name="search" size={18} /></span>
      <input ref={input} type="text" value={q} maxLength={60} autoComplete="off" spellCheck={false} placeholder={labels.placeholder} aria-label={labels.label}
        role="combobox" aria-expanded={showPanel} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={active >= 0 && opts[active] ? `${listId}-${active}` : undefined}
        style={{ paddingLeft: 36, paddingRight: q ? 70 : 12 }} onChange={(e) => onChange(e.target.value)} onFocus={() => setOpen(true)} onKeyDown={onKeyDown} />
      {q && <button type="button" className="gs-clear" onClick={clear} aria-label={labels.clear}>✕</button>}
      {mobileOpen && <button type="button" className="gs-close btn s" onClick={close}>{labels.close}</button>}
      {showPanel && (
        <div className="res gs-panel" data-testid="search-panel">
          <div aria-live="polite" className="sr">{status === "loading" ? labels.searching : status === "done" ? `${opts.length}` : ""}</div>
          {t.length < 2 ? <p className="gs-msg">{labels.min}</p>
            : status === "loading" && !data ? <p className="gs-msg" role="status">{labels.searching}</p>
            : status === "rate" ? <p className="gs-msg" role="alert">{labels.errRate}</p>
            : status === "error" ? <p className="gs-msg" role="alert">{labels.errAll} <button type="button" className="btn s" onClick={() => run(q)}>{labels.retry}</button></p>
            : data && (<ul id={listId} role="listbox" aria-label={labels.label} className="gs-list">
              {data.errors.length > 0 && <li role="presentation" className="gs-msg" data-testid="search-partial">{labels.errCrypto}</li>}
              {opts.length === 0 && data.errors.length === 0 && <li role="presentation" className="gs-msg" data-testid="search-empty">{labels.empty}</li>}
              {data.assets.length > 0 && <li role="presentation" className="gs-h">{labels.assets}</li>}
              {data.assets.map((a) => { const i = idx(`a:${a.id}`); return (
                <li key={a.id} id={`${listId}-${i}`} role="option" aria-selected={active === i} className={`gs-opt ${active === i ? "on" : ""}`} data-href={a.href}
                  onMouseDown={(e) => { e.preventDefault(); go(a.href); }} onMouseEnter={() => setActive(i)}>
                  <span><b>{a.symbol}</b> <span className="mt">{a.name}</span></span><span className="bd">{a.categoryLabel}</span></li>); })}
              {data.markets.length > 0 && <li role="presentation" className="gs-h">{labels.markets}</li>}
              {data.markets.map((m) => { const i = idx(`m:${m.key}`); return (
                <li key={m.key} id={`${listId}-${i}`} role="option" aria-selected={active === i} className={`gs-opt ${active === i ? "on" : ""}`} data-href={m.href}
                  onMouseDown={(e) => { e.preventDefault(); go(m.href); }} onMouseEnter={() => setActive(i)}>
                  <span>{m.label}</span>{m.pending && <span className="bd a">{labels.pending}</span>}</li>); })}
            </ul>)}
          {status === "loading" && data && <p className="gs-msg src">{labels.searching}</p>}
        </div>)}
    </div>
  </>);
}
