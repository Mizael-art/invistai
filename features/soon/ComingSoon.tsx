import Link from "next/link";
import { getPrefs } from "@/lib/i18n/server";
import { Icon } from "@/components/ui/Icon";
import { BackButton } from "./BackButton";
import type { Key } from "@/lib/i18n/dictionary";

/** Tela "Em breve" no padrão visual do projeto. Não simula conteúdo, progresso, downloads nem permissões. */
export async function ComingSoon({ icon, nameKey, textKey }: { icon: string; nameKey: Key; textKey: Key }) {
  const { tr } = await getPrefs();
  return (
    <section className="soon card" aria-labelledby="soon-title">
      <div className="soon-ic" aria-hidden="true"><Icon name={icon} size={34} /></div>
      <span className="bd v">{tr(nameKey)}</span>
      <h1 id="soon-title">{tr("soon.title")}</h1>
      <p className="mt">{tr(textKey)}</p>
      <div className="row" style={{ justifyContent: "center", marginTop: 8 }}>
        <BackButton label={tr("soon.backBtn")} />
        <Link href="/" className="btn" style={{ textDecoration: "none" }}>{tr("soon.back")}</Link>
      </div>
    </section>
  );
}
