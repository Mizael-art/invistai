import Link from "next/link";
import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { getPrefs } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Página não encontrada — TRADEON" };
/** 404 global com o layout do app (menu, cabeçalho e barra inferior), em PT/EN. */
export default async function NotFound() {
  const { tr } = await getPrefs();
  return (<AppShell><div className="card" style={{ textAlign: "center", padding: 40 }} data-testid="not-found">
    <h1>{tr("nf.title")}</h1><p className="mt" style={{ margin: "10px 0 20px" }}>{tr("nf.text")}</p>
    <div className="row" style={{ justifyContent: "center" }}><Link href="/" className="btn">{tr("nf.back")}</Link><Link href="/suporte" className="btn s">{tr("sp.link")}</Link></div>
  </div></AppShell>);
}
