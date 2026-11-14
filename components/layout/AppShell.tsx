import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";
import { getPrefs } from "@/lib/i18n/server";
import { getSessionUser } from "@/services/session";
import { dict } from "@/lib/i18n/dictionary";
import { NavTracker } from "./NavTracker";
import { EmailBanner } from "@/features/auth/EmailBanner";
import { unreadCount } from "@/services/notifications";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const { lang, theme } = await getPrefs();
  const user = await getSessionUser();
  const labels = dict[lang] as unknown as Record<string, string>;
  const unread = user ? await unreadCount(user.id) : null;
  const initials = user ? ((user.name ?? user.email ?? "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?") : null;
  return (
    <div className="app">
      <Sidebar labels={labels} unread={unread} />
      <div>
        <Header lang={lang} theme={theme} user={initials ? { initials } : null} unread={unread} labels={labels} />
        {user && !user.emailConfirmed && <EmailBanner />}
        <main id="main">{children}</main>
      </div>
      <BottomNav labels={labels} />
      <NavTracker />
    </div>
  );
}
