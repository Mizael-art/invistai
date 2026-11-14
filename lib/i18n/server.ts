import { cookies } from "next/headers";
import { t, type Lang, type Key } from "./dictionary";
export async function getPrefs() {
  const c = await cookies();
  const lang: Lang = c.get("iv_lang")?.value === "en" ? "en" : "pt";
  const theme: "dark" | "light" = c.get("iv_theme")?.value === "light" ? "light" : "dark";
  return { lang, theme, tr: (k: Key, v?: Record<string, string>) => t(lang, k, v) };
}
