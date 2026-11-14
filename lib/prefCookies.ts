import type { NextResponse } from "next/server";
/** Cookies de preferência lidos no servidor e pelo cabeçalho (não HttpOnly). */
export function setPrefCookies(res: NextResponse, p: { theme?: string | null; lang?: string | null }) {
  const o = { path: "/", maxAge: 31_536_000, sameSite: "lax" as const };
  if (p.theme === "dark" || p.theme === "light") res.cookies.set("iv_theme", p.theme, o);
  if (p.lang === "pt" || p.lang === "en") res.cookies.set("iv_lang", p.lang, o);
}
