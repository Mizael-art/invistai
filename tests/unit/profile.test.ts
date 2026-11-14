import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { profileInput } from "@/schemas/auth";
import { prefsInput, appPrefsInput, newsPrefsInput, NOTIFICATION_CATEGORIES } from "@/schemas/preferences";
import { setPrefCookies } from "@/lib/prefCookies";
import { NextResponse } from "next/server";

describe("profileInput (somente nome e telefone)", () => {
  it("normaliza nome e telefone (E.164)", () => expect(profileInput.parse({ name: "  Ana   Lima ", phone: "(11) 91234-5678" })).toEqual({ name: "Ana Lima", phone: "+5511912345678" }));
  it("rejeita campos extras — e-mail e outros dados protegidos não são alteráveis", () => {
    for (const extra of [{ email: "x@y.co" }, { id: "1" }, { lang: "en" }, { role: "admin" }]) expect(profileInput.safeParse({ name: "Ana", phone: "(11) 91234-5678", ...extra }).success).toBe(false);
  });
  it("rejeita nome/telefone inválidos e campos ausentes", () => { for (const bad of [{ name: "A", phone: "(11) 91234-5678" }, { name: "Ana", phone: "123" }, { name: "Ana" }, { phone: "(11) 91234-5678" }, {}, null]) expect(profileInput.safeParse(bad).success).toBe(false); });
});
describe("prefsInput (notícias e notificações)", () => {
  it("aceita uma ou ambas as listas e remove duplicadas", () => {
    expect(prefsInput.parse({ newsCategories: ["crypto", "crypto"] })).toEqual({ newsCategories: ["crypto"] });
    expect(prefsInput.parse({ notificationCategories: ["market", "account", "market"] })).toEqual({ notificationCategories: ["market", "account"] });
    expect(prefsInput.parse({ newsCategories: [], notificationCategories: [] })).toEqual({ newsCategories: [], notificationCategories: [] });
  });
  it("rejeita vazio, categorias inexistentes (VIP/sinais não existem), campos extras e tipos errados", () => {
    for (const bad of [{}, { newsCategories: ["bonds"] }, { notificationCategories: ["signals"] }, { notificationCategories: ["vip"] }, { newsCategories: "crypto" }, { newsCategories: ["crypto"], extra: 1 }]) expect(prefsInput.safeParse(bad).success).toBe(false);
  });
  it("mantém o alias da Etapa 04 e só oferece categorias que existem no produto", () => { expect(newsPrefsInput).toBe(prefsInput); expect([...NOTIFICATION_CATEGORIES]).toEqual(["market", "news", "account"]); });
});
describe("appPrefsInput", () => {
  it("tema e/ou idioma válidos", () => { expect(appPrefsInput.parse({ theme: "light" })).toEqual({ theme: "light" }); expect(appPrefsInput.parse({ lang: "en", theme: "dark" })).toEqual({ lang: "en", theme: "dark" }); });
  it("rejeita vazio, 'auto', idiomas não suportados e extras", () => { for (const bad of [{}, { theme: "auto" }, { lang: "fr" }, { theme: "dark", x: 1 }]) expect(appPrefsInput.safeParse(bad).success).toBe(false); });
});
describe("setPrefCookies", () => {
  it("grava só valores válidos, não HttpOnly (o cabeçalho lê no cliente)", () => {
    const res = NextResponse.json({}); setPrefCookies(res, { theme: "light", lang: "en" });
    expect(res.cookies.get("iv_theme")?.value).toBe("light"); expect(res.cookies.get("iv_lang")?.value).toBe("en"); expect(res.cookies.get("iv_theme")?.httpOnly).not.toBe(true);
    const r2 = NextResponse.json({}); setPrefCookies(r2, { theme: "auto", lang: null }); expect(r2.cookies.get("iv_theme")).toBeUndefined(); expect(r2.cookies.get("iv_lang")).toBeUndefined();
  });
});
describe("migração 0006", () => {
  it("tema/idioma opcionais e categorias de notificação restritas ao que existe", () => {
    const sql = readFileSync(path.resolve(__dirname, "../../supabase/migrations/20260101000006_preferences_profile.sql"), "utf8");
    expect(sql).toContain("drop not null"); expect(sql).toContain("array['market','news','account']");
  });
});
