"use client";
import { useEffect, useState } from "react";

/** Abas de seção do ativo (âncoras). A aba ativa acompanha a seção visível na tela. */
export function SectionTabs({ items, label }: { items: { id: string; label: string }[]; label: string }) {
  const [active, setActive] = useState(items[0]?.id);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver((ents) => {
      const vis = ents.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActive(vis.target.id);
    }, { rootMargin: "-120px 0px -55% 0px" });
    els.forEach((e) => io.observe(e)); return () => io.disconnect();
  }, [items]);
  return (<nav className="utabs" aria-label={label}>{items.map((i) => (
    <a key={i.id} href={`#${i.id}`} className={active === i.id ? "on" : ""} aria-current={active === i.id ? "location" : undefined} onClick={() => setActive(i.id)}>{i.label}</a>))}</nav>);
}
