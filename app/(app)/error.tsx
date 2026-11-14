"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

const T = {
  pt: { title: "Algo deu errado", text: "Não foi possível carregar esta página. Tente novamente; se o problema continuar, fale com o suporte.", retry: "Tentar novamente", support: "Suporte" },
  en: { title: "Something went wrong", text: "This page could not be loaded. Try again; if the problem persists, contact support.", retry: "Try again", support: "Support" },
};
/** Erro inesperado de uma página: mensagem traduzida (idioma do <html>), sem detalhes internos, com nova tentativa. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const [lang, setLang] = useState<"pt" | "en">("pt");
  useEffect(() => { if (document.documentElement.lang.startsWith("en")) setLang("en"); }, []);
  const t = T[lang];
  return (<div className="card" role="alert" data-testid="page-error"><h2>{t.title}</h2><p className="mt">{t.text}</p>
    <div className="row"><button className="btn" onClick={reset}>{t.retry}</button><Link href="/suporte" className="btn s">{t.support}</Link></div></div>);
}
