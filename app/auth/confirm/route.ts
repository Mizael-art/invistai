import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { isConfirmType, otpTypeFor } from "@/lib/authErrors";
import { safeNext } from "@/lib/routes";
import { publicUrl } from "@/lib/publicUrl";
import { RECOVERY_COOKIE, RECOVERY_MAX_AGE } from "@/lib/recovery";

/** Links dos e-mails: /auth/confirm?token_hash=…&type=email|recovery  (modelos em docs/ETAPA_08.md e docs/ETAPA_09.md). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams, type = sp.get("type"), hash = sp.get("token_hash") ?? "", code = sp.get("code") ?? "";
  const recovery = type === "recovery";
  const fail = () => NextResponse.redirect(publicUrl(req, recovery ? "/recuperar-senha?link=invalid" : "/login?confirm=failed"));
  // Dois formatos de link: o do modelo da casa (?token_hash=&type=) e o padrão do Supabase, que volta com ?code= (PKCE).
  if (code) { if (code.length < 6 || code.length > 300 || (type !== null && !isConfirmType(type))) return fail(); }
  else if (!isConfirmType(type) || hash.length < 6 || hash.length > 300) return fail();
  const sb = await getSupabase();
  if (!sb) return fail();
  try {
    const { error } = code ? await sb.auth.exchangeCodeForSession(code) : await sb.auth.verifyOtp({ type: otpTypeFor(type!), token_hash: hash });
    if (error) return fail();
  } catch { return fail(); }
  if (recovery) {                                   // destino fixo: o parâmetro `next` é ignorado na recuperação
    const res = NextResponse.redirect(publicUrl(req, "/redefinir-senha"));
    res.cookies.set(RECOVERY_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: RECOVERY_MAX_AGE });
    return res;
  }
  const next = safeNext(sp.get("next")), [path, q] = next.split("?");
  return NextResponse.redirect(publicUrl(req, `${path}?${q ? `${q}&` : ""}email_confirmed=1`));
}
