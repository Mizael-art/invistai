import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPrefs } from "@/lib/i18n/server";
import { dict } from "@/lib/i18n/dictionary";
import { getSessionUser } from "@/services/session";
import { getProfile } from "@/services/profile";
import { getPrefsFor } from "@/services/preferences";
import { NEWS_CATEGORIES } from "@/services/news/categories";
import { NOTIFICATION_CATEGORIES } from "@/schemas/preferences";
import { clock } from "@/lib/format";
import { ProfileForm } from "@/features/profile/ProfileForm";
import { AppPrefs } from "@/features/profile/AppPrefs";
import { CategoryPrefs } from "@/features/profile/CategoryPrefs";
import { SessionsCard } from "@/features/profile/SessionsCard";
import { getSupportEmail, mailtoHref } from "@/lib/support";
import Link from "next/link";
import { ResendConfirmation } from "@/features/auth/ResendConfirmation";

export const metadata: Metadata = { title: "Perfil — TRADEON" };
export default async function Perfil() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=%2Fperfil");                       // o middleware já protege; defesa extra
  const { lang, theme, tr } = await getPrefs(); const labels = dict[lang] as unknown as Record<string, string>;
  const [profile, prefs] = await Promise.all([getProfile(user.id), getPrefsFor(user.id)]);
  const name = profile.name ?? user.name ?? "", initials = ((name || user.email || "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()) || "?";
  const support = getSupportEmail();
  return (<>
    <div><h1>{tr("pf.title")}</h1><p className="mt">{tr("pf.sub")}</p></div>
    <div className="card row" style={{ gap: 16 }}>
      <div className="av" style={{ width: 64, height: 64, display: "grid", placeItems: "center", fontSize: 22 }} aria-hidden="true">{initials}</div>
      <div style={{ flex: 1 }}><h2 style={{ fontSize: 22, margin: 0 }} data-testid="pf-name-title">{name || user.email}</h2><p className="mt">{user.email}</p>
        <div className="row"><span className={`bd ${user.emailConfirmed ? "" : "a"}`}>{tr(user.emailConfirmed ? "pf.emailOk" : "pf.emailPending")}</span>
          {user.createdAt && <span className="src">{tr("pf.since", { date: clock(user.createdAt, lang).split(",")[0] })}</span>}</div></div>
      {!user.emailConfirmed && <ResendConfirmation labels={{ btn: labels["rs.btn"], wait: labels["rs.wait"], busy: labels["rs.busy"], sent: labels["rs.sent"], fail: labels["rs.fail"], rate: labels["rs.rate"], notConfigured: labels["rs.notConfigured"] }} />}
    </div>
    <div className="grid g2">
      <div className="card"><ProfileForm name={name} phone={profile.phone ?? ""} email={user.email ?? ""} labels={labels} /></div>
      <div className="card"><AppPrefs theme={theme} lang={lang} labels={labels} /></div>
      <div className="card"><CategoryPrefs kind="news" cats={NEWS_CATEGORIES.map((c) => ({ key: c.key, label: c.label[lang] }))} initial={prefs.news} title={labels["pf.newsCats"]} hint={labels["pf.newsHint"]} labels={labels} /></div>
      <div className="card"><CategoryPrefs kind="notifications" cats={NOTIFICATION_CATEGORIES.map((k) => ({ key: k, label: labels[`pf.nc.${k}`] }))} initial={prefs.notifications} title={labels["pf.notifCats"]} hint={labels["pf.notifHint"]} labels={labels} /></div>
      <div className="card"><SessionsCard labels={labels} /></div>
      <div className="card" data-testid="delete-card"><h2>{tr("pf.delete")}</h2><p>{tr("pf.deleteText")}</p>
        {support ? <a className="btn s" href={mailtoHref(support, tr("sp.subject", { topic: tr("sp.t.delete") }))} style={{ textDecoration: "none" }}>{tr("pf.deleteMail")}</a>
          : <><button className="btn s" disabled aria-describedby="del-note">{tr("pf.deleteMail")}</button><p id="del-note" className="src">{tr("pf.deleteNoMail")}</p></>}</div>
      <div className="card" data-testid="support-card"><h2>{tr("sp.card")}</h2><p>{tr("sp.cardText")}</p><Link href="/suporte" className="btn s" style={{ textDecoration: "none" }}>{tr("sp.link")}</Link></div>
    </div>
  </>);
}
