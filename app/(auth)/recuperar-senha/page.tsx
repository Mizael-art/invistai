import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getPrefs } from "@/lib/i18n/server";
import { dict } from "@/lib/i18n/dictionary";
import { getSessionUser } from "@/services/session";
import { RECOVERY_COOKIE } from "@/lib/recovery";
import { AuthHero } from "@/features/auth/AuthHero";
import { ForgotForm } from "@/features/auth/ForgotForm";

export const metadata: Metadata = { title: "Recuperar senha — TRADEON" };
export default async function RecuperarSenha({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  if (await getSessionUser()) redirect((await cookies()).get(RECOVERY_COOKIE)?.value === "1" ? "/redefinir-senha" : "/");
  const { lang, tr } = await getPrefs();
  return (<>
    <AuthHero />
    <div className="auth card"><ForgotForm linkInvalid={sp.link === "invalid"} labels={dict[lang] as unknown as Record<string, string>} /></div>
  </>);
}
