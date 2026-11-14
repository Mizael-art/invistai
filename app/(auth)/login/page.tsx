import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPrefs } from "@/lib/i18n/server";
import { dict } from "@/lib/i18n/dictionary";
import { getSessionUser } from "@/services/session";
import { safeNext } from "@/lib/routes";
import { AuthHero } from "@/features/auth/AuthHero";
import { LoginForm } from "@/features/auth/LoginForm";

export const metadata: Metadata = { title: "Entrar — TRADEON" };
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams; const first = (v: unknown) => (Array.isArray(v) ? v[0] : v) as string | undefined;
  const next = safeNext(first(sp.next));
  if (await getSessionUser()) redirect(next);                       // já autenticado
  const { lang, tr } = await getPrefs();
  return (<>
    <AuthHero />
    <div className="auth card"><LoginForm next={next} expired={first(sp.expired) === "1"} confirmFailed={first(sp.confirm) === "failed"} labels={dict[lang] as unknown as Record<string, string>} /></div>
  </>);
}
