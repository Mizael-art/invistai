import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrefs } from "@/lib/i18n/server";
import { dict, type Key } from "@/lib/i18n/dictionary";
import { getSessionUser } from "@/services/session";
import { listNotifications, unreadCount, NOTIF_PAGE_SIZE } from "@/services/notifications";
import { parseNotificationsParams, type NotificationsParams } from "@/schemas/notifications";
import { isKnownKind, safeTarget } from "@/lib/notifications";
import { clock, relTime } from "@/lib/format";
import { RefreshButton } from "@/features/home/RefreshButton";
import { NotificationsList, type ViewNotification } from "@/features/notifications/NotificationsList";

export const metadata: Metadata = { title: "Notificações — TRADEON" };
const href = (p: Partial<NotificationsParams>) => { const u = new URLSearchParams(); if (p.cat && p.cat !== "all") u.set("cat", p.cat); if (p.state && p.state !== "all") u.set("state", p.state); if (p.page && p.page > 1) u.set("page", String(p.page)); const s = u.toString(); return s ? `/notificacoes?${s}` : "/notificacoes"; };

export default async function Notificacoes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fnotificacoes");                       // o middleware já protege; defesa extra
  const p = parseNotificationsParams(await searchParams);
  const { lang, tr } = await getPrefs(); const d = dict[lang]; const labels = d as unknown as Record<string, string>;
  const [r, unread] = await Promise.all([listNotifications(user.id, p), unreadCount(user.id)]);
  const filtered = p.cat !== "all" || p.state !== "all";
  const head = (<>
    <div className="row sp"><div><h1>{tr("nt.title")}</h1><p className="mt">{tr("nt.sub")}</p></div>
      <Link href="/perfil" className="btn s" style={{ textDecoration: "none" }}>{tr("nt.configure")}</Link></div>
    <div className="row sp">
      <nav className="row" aria-label={tr("nt.title")} style={{ overflowX: "auto", flexWrap: "nowrap" }}>{(["all", "market", "news", "account"] as const).map((c) => (
        <Link key={c} href={href({ ...p, cat: c, page: 1 })} className={`pill ${p.cat === c ? "on" : ""}`} aria-current={p.cat === c ? "page" : undefined} style={{ textDecoration: "none", whiteSpace: "nowrap" }}>{tr(`nt.cat.${c}` as Key)}</Link>))}</nav>
      <div className="seg" role="group" aria-label={tr("nt.state.unread")} style={{ width: "auto" }}>{(["all", "unread"] as const).map((s) => (
        <Link key={s} href={href({ ...p, state: s, page: 1 })} className={p.state === s ? "on" : ""} aria-current={p.state === s ? "true" : undefined} style={{ textDecoration: "none", padding: "9px 14px" }}>{tr(`nt.state.${s}` as Key)}</Link>))}</div>
    </div></>);
  if (!r.ok) return (<>{head}<div className="note" role="alert"><p>{tr("nt.loadFail")}</p><RefreshButton labels={{ idle: d["err.retry"], busy: d["home.refreshing"], fail: d["home.refreshFail"], wait: d["home.refreshWait"] }} /></div></>);
  const pages = Math.max(1, Math.ceil(r.total / NOTIF_PAGE_SIZE));
  const items: ViewNotification[] = r.rows.map((n) => ({
    id: n.id, category: tr(`nt.cat.${n.category}` as Key),
    title: isKnownKind(n.kind) ? tr(`nt.k.${n.kind}.t` as Key) : (n.title ?? n.kind), message: isKnownKind(n.kind) ? tr(`nt.k.${n.kind}.m` as Key) : (n.message ?? ""),
    when: relTime(n.createdAt, lang), whenFull: clock(n.createdAt, lang), target: safeTarget(n.target), unread: n.readAt === null }));
  return (<>
    {head}
    {r.total === 0 ? (filtered
      ? <div className="note" role="status" data-testid="nt-empty-filter"><p>{tr("nt.emptyFilter")}</p><Link href="/notificacoes" className="btn s" style={{ textDecoration: "none" }}>{tr("nt.clear")}</Link></div>
      : <div className="card" style={{ textAlign: "center", padding: 32 }} data-testid="nt-empty"><h2>{tr("nt.empty")}</h2><p className="mt">{tr("nt.emptyHint")}</p></div>)
      : <NotificationsList key={JSON.stringify(p)} items={items} unreadTotal={unread ?? 0} labels={labels} />}
    {pages > 1 && (<nav className="row" aria-label="Paginação" style={{ justifyContent: "center" }}>
      {p.page > 1 ? <Link className="btn s" href={href({ ...p, page: p.page - 1 })}>← {tr("mk.prev")}</Link> : <span className="btn s" aria-disabled="true" style={{ opacity: 0.4 }}>← {tr("mk.prev")}</span>}
      <span className="mt">{tr("mk.page", { n: String(p.page) })} / {pages}</span>
      {p.page < pages ? <Link className="btn s" href={href({ ...p, page: p.page + 1 })}>{tr("mk.next")} →</Link> : <span className="btn s" aria-disabled="true" style={{ opacity: 0.4 }}>{tr("mk.next")} →</span>}</nav>)}
  </>);
}
