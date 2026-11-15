"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { LogoutButton } from "@/features/auth/LogoutButton";
import { GlobalSearch } from "@/features/search/GlobalSearch";
import { badgeText } from "@/lib/notifications";

/** Tema/idioma vêm de cookies lidos no servidor; recarregar garante estado consistente (inclusive o tema do widget TradingView). */
const getCookie = (k: string) => document.cookie.split("; ").find((c) => c.startsWith(k + "="))?.split("=")[1];
const setCookie = (k: string, v: string) => { document.cookie = `${k}=${v}; path=/; max-age=31536000; samesite=lax`; };

export function Header({ lang, theme, user, unread: unreadProp = null, labels }: { lang: "pt" | "en"; theme: "dark" | "light"; user: { initials: string; admin?: boolean } | null; unread?: number | null; labels: Record<string, string> }) {
  // Contador do sino: valor do servidor + atualização imediata quando a central marca itens como lidos (evento "iv:unread").
  const [unread, setUnread] = useState(unreadProp);
  useEffect(() => { setUnread(unreadProp); }, [unreadProp]);
  useEffect(() => { if (unreadProp === null) return; const h = (e: Event) => setUnread((e as CustomEvent<number>).detail); window.addEventListener("iv:unread", h); return () => window.removeEventListener("iv:unread", h); }, [unreadProp]);
  const [menu, setMenu] = useState(false); const menuBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => { if (e instanceof KeyboardEvent) { if (e.key !== "Escape") return; setMenu(false); menuBtn.current?.focus(); return; } if (!(e.target as HTMLElement).closest(".um")) setMenu(false); };
    document.addEventListener("keydown", close); document.addEventListener("mousedown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("mousedown", close); };
  }, [menu]);
  const saveToAccount = async (body: object) => { if (!user) return; try { await fetch("/api/preferences/app", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); } catch { /* o cookie local já vale */ } };
  const toggleTheme = async () => { const cur = document.documentElement.dataset.theme === "light" ? "light" : "dark"; const n = cur === "dark" ? "light" : "dark"; setCookie("iv_theme", n); document.documentElement.dataset.theme = n; await saveToAccount({ theme: n }); window.location.reload(); };
  const toggleLang = async () => { const cur = getCookie("iv_lang") === "en" ? "en" : getCookie("iv_lang") === "pt" ? "pt" : lang; const n = cur === "pt" ? "en" : "pt"; setCookie("iv_lang", n); await saveToAccount({ lang: n }); window.location.reload(); };
  return (
    <header>
      <Link href="/" className="logo h" style={{ margin: 0 }} aria-label="TRADEON — Início"><Logo /></Link>
      <GlobalSearch labels={{ placeholder: labels["hdr.search"], label: labels["gs.label"], clear: labels["gs.clear"], open: labels["gs.open"], close: labels["gs.close"], searching: labels["gs.searching"], min: labels["gs.min"], empty: labels["gs.empty"], assets: labels["gs.assets"], markets: labels["gs.markets"], pending: labels["mk.pendingTag"], errCrypto: labels["gs.errCrypto"], errRate: labels["gs.errRate"], errAll: labels["gs.errAll"], retry: labels["err.retry"] }} />
      <span style={{ flex: 1 }} />
      {!user && <>
      <button className="ic hdr-pref" onClick={toggleLang} aria-label={labels["hdr.lang"]} title={labels["hdr.lang"]} style={{ fontWeight: 600, fontSize: 12.5, gap: 6, display: "inline-flex", alignItems: "center" }}><span className="hide-m" style={{ display: "inline-flex" }}><Icon name="globe" size={17} /></span>{lang.toUpperCase()}</button>
      <button className="ic hdr-pref" onClick={toggleTheme} aria-label={labels["hdr.theme"]} title={labels["hdr.theme"]}><Icon name={theme === "light" ? "moon" : "sun"} size={17} /></button></>}
      <Link href="/notificacoes" className="ic" data-testid="bell" aria-label={unread ? labels["hdr.bellUnread"].replace("{n}", String(unread)) : labels["hdr.bell"]} style={{ display: "grid", placeItems: "center", position: "relative" }}><Icon name="bell" size={18} />{unread ? <span className="bgd" data-testid="bell-count" aria-hidden="true">{badgeText(unread)}</span> : null}</Link>
      {user
        ? <span className="um">
            <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
              <Link href="/perfil" className="av" aria-label={labels["hdr.profile"]} style={{ display: "grid", placeItems: "center" }}>{user.initials}</Link>
              <button ref={menuBtn} type="button" className="um-btn ic" style={{ minWidth: 30, padding: 0, border: 0 }} aria-haspopup="menu" aria-expanded={menu} aria-label={labels["hdr.menu"]} data-testid="user-menu" onClick={() => setMenu((v) => !v)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg></button>
            </span>
            {menu && <div className="um-menu" role="menu" aria-label={labels["hdr.menu"]}>
              <Link role="menuitem" href="/perfil" onClick={() => setMenu(false)}><Icon name="user" size={18} />{labels["hdr.profile"]}</Link>
              <Link role="menuitem" href="/favoritos" onClick={() => setMenu(false)}><Icon name="star" size={18} />{labels["nav.favorites"]}</Link>
              <Link role="menuitem" href="/assinatura" onClick={() => setMenu(false)}><Icon name="card" size={18} />{labels["nav.subscription"]}</Link>
              {user.admin && <Link role="menuitem" href="/admin" onClick={() => setMenu(false)} data-testid="um-admin"><Icon name="shield" size={18} />{labels["nav.admin"]}</Link>}
              <Link role="menuitem" href="/suporte" onClick={() => setMenu(false)}><Icon name="help" size={18} />{labels["sp.link"]}</Link>
              <hr />
              <button type="button" role="menuitem" aria-label={labels["hdr.lang"]} onClick={toggleLang}><Icon name="globe" size={18} />{labels["hdr.langLabel"]}<span className="val">{lang === "pt" ? "Português" : "English"}</span></button>
              <button type="button" role="menuitem" aria-label={labels["hdr.theme"]} onClick={toggleTheme}><Icon name={theme === "light" ? "moon" : "sun"} size={18} />{labels["hdr.themeLabel"]}<span className="val">{theme === "light" ? labels["pf.light"] ?? "Claro" : labels["pf.dark"] ?? "Escuro"}</span></button>
              <hr />
              <LogoutButton asMenuItem label={labels["hdr.logout"]} icon={<Icon name="logout" size={18} />} />
            </div>}
          </span>
        : <Link href="/login" className="btn">{labels["hdr.login"]}</Link>}
    </header>
  );
}
