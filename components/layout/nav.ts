import type { Key } from "@/lib/i18n/dictionary";
export type NavItem = { href: string; icon: string; key: Key };
/** Grupos do menu lateral (desktop). */
export const NAV_GROUPS: { key: Key; items: NavItem[] }[] = [
  { key: "nav.sec.explore", items: [{ href: "/", icon: "home", key: "nav.home" }, { href: "/mercado", icon: "market", key: "nav.market" }, { href: "/ia", icon: "sparkle", key: "nav.ai" }, { href: "/noticias", icon: "news", key: "nav.news" }] },
  { key: "nav.sec.grow", items: [{ href: "/aprender", icon: "learn", key: "nav.learn" }, { href: "/vip", icon: "vip", key: "nav.vip" }] },
  { key: "nav.sec.account", items: [{ href: "/favoritos", icon: "star", key: "nav.favorites" }, { href: "/notificacoes", icon: "bell", key: "nav.notifications" }, { href: "/perfil", icon: "user", key: "nav.profile" }, { href: "/assinatura", icon: "card", key: "nav.subscription" as Key }] },
];
export const SUPPORT: NavItem = { href: "/suporte", icon: "help", key: "sp.link" as Key };
/** Barra inferior (mobile): 4 atalhos + "Mais" com o restante. */
export const BOTTOM: NavItem[] = [{ href: "/", icon: "home", key: "nav.home" }, { href: "/mercado", icon: "market", key: "nav.market" }, { href: "/ia", icon: "sparkle", key: "nav.ai" }, { href: "/noticias", icon: "news", key: "nav.news" }];
export const MORE: NavItem[] = [{ href: "/favoritos", icon: "star", key: "nav.favorites" }, { href: "/aprender", icon: "learn", key: "nav.learn" }, { href: "/vip", icon: "vip", key: "nav.vip" }, { href: "/notificacoes", icon: "bell", key: "nav.notifications" }, { href: "/perfil", icon: "user", key: "nav.profile" }, { href: "/assinatura", icon: "card", key: "nav.subscription" as Key }, SUPPORT];
/** Mantido para compatibilidade: todos os destinos principais. */
export const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
export const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
