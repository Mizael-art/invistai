import { NextResponse, type NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { isConfirmType, otpTypeFor } from "@/lib/authErrors";
import { safeNext } from "@/lib/routes";
import { publicUrl } from "@/lib/publicUrl";
import { RECOVERY_COOKIE, RECOVERY_MAX_AGE } from "@/lib/recovery";

/** Links dos e-mails: /auth/confirm?token_hash=…&type=email|recovery  (modelos em docs/ETAPA_08.md e docs/ETAPA_09.md). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams, type = sp.get("type"), hash = sp.get("token_hash") ?? "";
  const recovery = type === "recovery";
  const fail = () => NextResponse.redirect(publicUrl(req, recovery ? "/recuperar-senha?link=invalid" : "/login?confirm=failed"));
  if (!isConfirmType(type) || hash.length < 6 || hash.length > 300) return fail();
  const sb = await getSupabase();
  if (!sb) return fail();
  try {
    const { error } = await sb.auth.verifyOtp({ type: otpTypeFor(type), token_hash: hash });
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
