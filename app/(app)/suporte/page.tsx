import type { Metadata } from "next";
import { getPrefs } from "@/lib/i18n/server";
import { dict } from "@/lib/i18n/dictionary";
import { getSupportEmail } from "@/lib/support";
import { SupportContact } from "@/features/support/SupportContact";
import { SupportFaq } from "@/features/support/SupportFaq";

export const metadata: Metadata = { title: "Suporte — TRADEON" };
const FAQ = ["data", "news", "password", "confirm", "delete", "notif", "sync", "vip"] as const;

/** Suporte por e-mail (público). Sem endereço configurado, os controles ficam indisponíveis — nenhum endereço é inventado. */
export default async function Suporte({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams; const topic = typeof sp.assunto === "string" ? sp.assunto : undefined;
  const { lang, tr } = await getPrefs(); const labels = dict[lang] as unknown as Record<string, string>;
  const email = getSupportEmail();
  const faq = FAQ.map((id) => ({ id, q: labels[`sp.q.${id}`], a: labels[`sp.a.${id}`] }));
  return (<>
    <div><h1>{tr("sp.title")}</h1><p className="mt">{tr("sp.sub")}</p></div>
    <div className="grid g2" style={{ alignItems: "start" }}>
      <section className="card" aria-labelledby="sp-contact-h">
        <h2 id="sp-contact-h">{tr("sp.contact")}</h2>
        {email ? (<><p className="mt">{tr("sp.contactText")}</p><SupportContact email={email} labels={labels} initialTopic={topic} /></>)
          : (<div data-testid="sp-unavailable" role="status">
              <p><span className="bd a">{tr("sp.unavailable")}</span></p>
              <p>{tr("sp.unavailableText")}</p>
              <div className="row" style={{ marginTop: 12 }}>
                <button type="button" className="btn" disabled aria-describedby="sp-un-note">{tr("sp.open")}</button>
                <button type="button" className="btn s" disabled aria-describedby="sp-un-note">{tr("sp.copy")}</button></div>
              <p id="sp-un-note" className="src" style={{ marginTop: 8 }}>{tr("sp.adminHint")}</p>
            </div>)}
        <p className="src" style={{ marginTop: 6 }}>{tr("sp.noTickets")}</p>
      </section>
      <SupportFaq items={faq} labels={labels} />
    </div>
  </>);
}
