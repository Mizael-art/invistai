"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { NAV_GROUPS, SUPPORT, isActive, type NavItem } from "./nav";

/** Menu lateral (desktop), agrupado por intenção: Explorar · Aprenda e evolua · Minha conta. Suporte fica no rodapé. */
export function Sidebar({ labels, unread = null }: { labels: Record<string, string>; unread?: number | null }) {
  const path = usePathname();
  const [count, setCount] = useState(unread);
  useEffect(() => { setCount(unread); }, [unread]);
  useEffect(() => { if (unread === null) return; const h = (e: Event) => setCount((e as CustomEvent<number>).detail); window.addEventListener("iv:unread", h); return () => window.removeEventListener("iv:unread", h); }, [unread]);
  const link = (n: NavItem, extra?: React.ReactNode, testid?: string) => (
    <Link key={n.href} href={n.href} className={`nav ${isActive(path, n.href) ? "on" : ""}`} aria-current={isActive(path, n.href) ? "page" : undefined} data-testid={testid}>
      <Icon name={n.icon} /> <span>{labels[n.key]}</span>{extra}
    </Link>);
  return (
    <aside aria-label="Navegação principal">
      <Link href="/" className="logo" aria-label="TRADEON — Início"><Logo /></Link>
      {NAV_GROUPS.map((g) => (
        <div key={g.key} role="group" aria-label={labels[g.key]}>
          <div className="sec" aria-hidden="true">{labels[g.key]}</div>
          {g.items.map((n) => link(n, n.href === "/notificacoes" && count ? <span className="cnt" aria-hidden="true">{count > 9 ? "9+" : count}</span> : null))}
        </div>
      ))}
      <div className="side-foot">{link(SUPPORT, null, "nav-support")}</div>
    </aside>
  );
}
