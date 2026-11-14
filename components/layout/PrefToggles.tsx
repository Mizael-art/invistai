"use client";
import { Icon } from "@/components/ui/Icon";
const getCookie = (k: string) => document.cookie.split("; ").find((c) => c.startsWith(k + "="))?.split("=")[1];
const setCookie = (k: string, v: string) => { document.cookie = `${k}=${v}; path=/; max-age=31536000; samesite=lax`; };
/** Alternância de idioma/tema fora do cabeçalho (páginas de autenticação). Cookie é a fonte de verdade; recarrega para aplicar. */
export function PrefToggles({ lang, theme, labels }: { lang: "pt" | "en"; theme: "dark" | "light"; labels: { lang: string; theme: string } }) {
  return (<div className="row">
    <button className="ic" aria-label={labels.lang} onClick={() => { const c = getCookie("iv_lang"); setCookie("iv_lang", (c === "en" ? "en" : c === "pt" ? "pt" : lang) === "pt" ? "en" : "pt"); window.location.reload(); }} style={{ gap: 6, display: "inline-flex", alignItems: "center", fontWeight: 600, fontSize: 12.5 }}><Icon name="globe" size={17} />{lang.toUpperCase()}</button>
    <button className="ic" aria-label={labels.theme} onClick={() => { const cur = document.documentElement.dataset.theme === "light" ? "light" : theme; const n = cur === "dark" ? "light" : "dark"; setCookie("iv_theme", n); document.documentElement.dataset.theme = n; window.location.reload(); }}><Icon name={theme === "light" ? "moon" : "sun"} size={17} /></button>
  </div>);
}
