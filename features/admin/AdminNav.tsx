"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const ITEMS = [["/admin", "Visão geral"], ["/admin/calls", "Calls VIP"], ["/admin/ia", "Treinar IA"], ["/admin/usuarios", "Usuários"]] as const;
export function AdminNav() {
  const p = usePathname();
  return (<nav className="ctabs" aria-label="Administração">{ITEMS.map(([h, t]) => { const on = h === "/admin" ? p === h : p.startsWith(h); return <Link key={h} href={h} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>{t}</Link>; })}</nav>);
}
