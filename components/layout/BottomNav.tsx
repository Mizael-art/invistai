"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { BOTTOM, MORE, isActive } from "./nav";

/** Barra inferior (mobile): quatro atalhos + "Mais", que abre uma folha com as demais áreas — nada fica inacessível no celular. */
export function BottomNav({ labels }: { labels: Record<string, string> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null); const first = useRef<HTMLAnchorElement>(null);
  const moreOn = MORE.some((n) => isActive(path, n.href));
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return; first.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
  }, [open]);
  return (<>
    <nav id="bn" aria-label="Navegação inferior">
      {BOTTOM.map((n) => (
        <Link key={n.href} href={n.href} className={isActive(path, n.href) ? "on" : ""} aria-current={isActive(path, n.href) ? "page" : undefined}>
          <Icon name={n.icon} size={22} /><span>{labels[n.key]}</span>
        </Link>
      ))}
      <button ref={btn} type="button" className={moreOn ? "on" : ""} aria-haspopup="dialog" aria-expanded={open} aria-controls="more-sheet" onClick={() => setOpen((v) => !v)} data-testid="bn-more">
        <Icon name="more" size={22} /><span>{labels["nav.more"]}</span>
      </button>
    </nav>
    {open && (
      <div className="more-sheet" id="more-sheet" role="dialog" aria-modal="true" aria-label={labels["nav.more"]} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
        <div><div className="grab" aria-hidden="true" />
          {MORE.map((n, i) => (
            <Link key={n.href} ref={i === 0 ? first : undefined} href={n.href} className={isActive(path, n.href) ? "on" : ""} aria-current={isActive(path, n.href) ? "page" : undefined} onClick={() => setOpen(false)}>
              <Icon name={n.icon} size={22} /><span>{labels[n.key]}</span>
            </Link>
          ))}
        </div>
      </div>
    )}
  </>);
}
