import { getPrefs } from "@/lib/i18n/server";
import { PrefToggles } from "@/components/layout/PrefToggles";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
/** Layout das páginas de autenticação (sem sidebar), com alternância de idioma e tema. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { lang, theme, tr } = await getPrefs();
  return (<div className="split" style={{ position: "relative" }}>
    <Link href="/" className="auth-m-logo" aria-label="TRADEON — Início" data-testid="auth-logo-m" style={{ textDecoration: "none" }}><Logo /></Link>
    <div style={{ position: "absolute", top: 14, right: 16, zIndex: 2 }}><PrefToggles lang={lang} theme={theme} labels={{ lang: tr("hdr.lang"), theme: tr("hdr.theme") }} /></div>
    {children}
  </div>);
}
