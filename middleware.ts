import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { isPrivatePath } from "@/lib/routes";
import { publicUrl } from "@/lib/publicUrl";

/** Cookie de sessão do Supabase (pode vir em pedaços .0/.1); exclui os cookies temporários de PKCE (code-verifier). */
const SESSION_COOKIE = /^sb-.*-auth-token(\.\d+)?$/;

export const config = { runtime: "nodejs", matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"] };

/** Renova a sessão (cookies) quando necessário e protege rotas privadas NO SERVIDOR. */
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname, priv = isPrivatePath(path);
  const toLogin = (expired: boolean) => {
    const q = new URLSearchParams({ next: path + req.nextUrl.search }); if (expired) q.set("expired", "1");
    return NextResponse.redirect(publicUrl(req, `/login?${q.toString()}`));
  };
  const env = getSupabaseEnv();
  if (!env) return priv ? toLogin(false) : NextResponse.next();
  const hasSession = req.cookies.getAll().some((c) => SESSION_COOKIE.test(c.name));
  if (!hasSession) return priv ? toLogin(false) : NextResponse.next();

  let res = NextResponse.next({ request: req });
  const sb = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => { list.forEach(({ name, value }) => req.cookies.set(name, value)); res = NextResponse.next({ request: req }); list.forEach(({ name, value, options }) => res.cookies.set(name, value, { ...options, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" })); },
    },
  });
  let user = null, invalid = false;
  try {
    const { data, error } = await sb.auth.getUser();
    user = data.user;
    // Sessão rejeitada pelo provedor (JWT/refresh inválido): limpar cookies. Falha de rede/5xx NÃO desloga o usuário.
    invalid = !user && !!error && [400, 401, 403].includes((error as { status?: number }).status ?? 0);
  } catch { /* indisponibilidade do provedor: mantém cookies */ }
  const clearSession = (r: NextResponse) => req.cookies.getAll().filter((c) => SESSION_COOKIE.test(c.name)).forEach((c) => r.cookies.set(c.name, "", { path: "/", maxAge: 0 }));
  if (!user && priv) { const r = toLogin(invalid); if (invalid) clearSession(r); return r; }
  if (invalid) { req.cookies.getAll().filter((c) => SESSION_COOKIE.test(c.name)).forEach((c) => req.cookies.delete(c.name)); res = NextResponse.next({ request: req }); clearSession(res); }
  return res;
}
