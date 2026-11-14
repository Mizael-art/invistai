import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getPrefs } from "@/lib/i18n/server";
import { dict } from "@/lib/i18n/dictionary";
import { getSessionUser } from "@/services/session";
import { RECOVERY_COOKIE } from "@/lib/recovery";
import { AuthHero } from "@/features/auth/AuthHero";
import { ResetForm } from "@/features/auth/ResetForm";

export const metadata: Metadata = { title: "Nova senha — TRADEON" };
export default async function RedefinirSenha() {
  const { lang, tr } = await getPrefs();
  const valid = (await cookies()).get(RECOVERY_COOKIE)?.value === "1" && !!(await getSessionUser());   // sessão criada por link de recuperação
  return (<>
    <AuthHero />
    <div className="auth card">{valid ? <ResetForm labels={dict[lang] as unknown as Record<string, string>} /> : (
      <div role="alert" data-testid="reset-invalid" style={{ textAlign: "center" }}><h2>{tr("rp.invalid.title")}</h2><p className="mt">{tr("rp.invalid.text")}</p>
        <Link href="/recuperar-senha" className="btn" style={{ textDecoration: "none", justifyContent: "center", width: "100%" }}>{tr("rp.invalid.btn")}</Link>
        <p style={{ marginTop: 12 }}><Link href="/login">{tr("fp.back")}</Link></p></div>)}</div>
  </>);
}
