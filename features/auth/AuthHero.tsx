import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Icon } from "@/components/ui/Icon";
import { getPrefs } from "@/lib/i18n/server";

/** Painel de marca das telas de acesso (desktop). Mesmo conteúdo em todas: proposta, três pilares e o aviso de risco. */
export async function AuthHero() {
  const { tr } = await getPrefs();
  return (<div className="l">
    <Link href="/" aria-label="TRADEON — Início" data-testid="auth-logo" style={{ alignSelf: "flex-start", textDecoration: "none" }}><Logo /></Link>
    <div style={{ display: "grid", gap: 22 }}>
      <h1>{tr("au.hero")}</h1>
      <ul className="ck" style={{ margin: 0, gap: 12, fontSize: 15 }}>
        {(["au.hero1", "au.hero2", "au.hero3"] as const).map((k) => <li key={k}>{tr(k)}</li>)}
      </ul>
    </div>
    <p className="mt" style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "flex-start", maxWidth: 460 }}><Icon name="info" size={16} />{tr("au.risk")}</p>
  </div>);
}
