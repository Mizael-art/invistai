import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPrefs } from "@/lib/i18n/server";
import { dict } from "@/lib/i18n/dictionary";
import { getSessionUser } from "@/services/session";
import { AuthHero } from "@/features/auth/AuthHero";
import { RegisterForm } from "@/features/auth/RegisterForm";

export const metadata: Metadata = { title: "Criar conta — TRADEON" };
export default async function CadastroPage() {
  if (await getSessionUser()) redirect("/");
  const { lang, tr } = await getPrefs();
  return (<>
    <AuthHero />
    <div className="auth card"><RegisterForm labels={dict[lang] as unknown as Record<string, string>} /></div>
  </>);
}
