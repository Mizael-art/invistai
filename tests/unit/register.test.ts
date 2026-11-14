import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeName, isValidName, normalizePhone, passwordRules, passwordOk } from "@/lib/validation";
import { registerInput, resendInput } from "@/schemas/auth";
import { mapSignUpError, isConfirmType } from "@/lib/authErrors";

describe("normalizePhone → E.164", () => {
  it("aceita formatos brasileiros comuns (móvel e fixo, com/sem +55, máscara)", () => {
    for (const p of ["(11) 91234-5678", "11912345678", "+55 11 91234-5678", "+5511912345678", "011 91234-5678".replace("011 ", "11 "), " (21) 98765-4321 "]) expect(normalizePhone(p), p).toMatch(/^\+55\d{10,11}$/);
    expect(normalizePhone("(11) 91234-5678")).toBe("+5511912345678"); expect(normalizePhone("(11) 2345-6789")).toBe("+551123456789");
  });
  it("aceita números internacionais com +", () => { expect(normalizePhone("+1 415 555 2671")).toBe("+14155552671"); expect(normalizePhone("+351 912 345 678")).toBe("+351912345678"); });
  it("rejeita lixo, curto, longo, vazio e letras", () => { for (const p of ["", "   ", "123", "abc", "(11) 1234", "+55", "00000000000000000000000000000000", "(11) 91234-567890123"]) expect(normalizePhone(p), p).toBeNull(); });
});
describe("nome", () => {
  it("normaliza espaços, controle e Unicode", () => { expect(normalizeName("  Maria   da\tSilva \n")).toBe("Maria da Silva"); expect(normalizeName("Jose\u0301")).toBe("José"); });
  it("valida tamanho e presença de letra (inclui acentos/nomes não latinos)", () => {
    for (const n of ["Ana", "José da Silva", "李小龍", "O'Neil-Smith", "Al"]) expect(isValidName(normalizeName(n)), n).toBe(true);
    for (const n of ["", "A", "123", "!!!", "x".repeat(101)]) expect(isValidName(normalizeName(n)), n).toBe(false);
  });
});
describe("regras de senha", () => {
  it("avalia cada requisito", () => { expect(passwordRules("abc")).toEqual({ length: false, upper: false, number: false, special: false }); expect(passwordRules("Abcdef1!")).toEqual({ length: true, upper: true, number: true, special: true }); });
  it("exige todos e limita a 72", () => { expect(passwordOk("Abcdef1!")).toBe(true); for (const p of ["abcdef1!", "Abcdefg!", "Abcdefg1", "Ab1!", `A1!${"a".repeat(80)}`]) expect(passwordOk(p), p).toBe(false); expect(passwordOk(`A1!${"a".repeat(69)}`)).toBe(true); });
});
describe("registerInput", () => {
  const ok = { name: "  Maria  Silva ", email: " Maria@Exemplo.COM ", phone: "(11) 91234-5678", password: "Abcdef1!" };
  it("normaliza todos os campos", () => expect(registerInput.parse(ok)).toEqual({ name: "Maria Silva", email: "maria@exemplo.com", phone: "+5511912345678", password: "Abcdef1!" }));
  it("rejeita cada campo inválido e tipos errados", () => {
    for (const bad of [{ ...ok, name: "A" }, { ...ok, email: "x" }, { ...ok, phone: "123" }, { ...ok, password: "fraca" }, { ...ok, name: undefined }, { ...ok, phone: 119 }, { name: ok.name }, null, "x"])
      expect(registerInput.safeParse(bad).success).toBe(false);
  });
  it("não altera a senha", () => expect(registerInput.parse({ ...ok, password: " Abcdef1! " }).password).toBe(" Abcdef1! "));
  it("resendInput: e-mail opcional, inválido rejeitado", () => { expect(resendInput.safeParse({}).success).toBe(true); expect(resendInput.safeParse({ email: "a@b.co" }).success).toBe(true); expect(resendInput.safeParse({ email: "x" }).success).toBe(false); });
});
describe("mapSignUpError / isConfirmType", () => {
  it("categorias seguras", () => {
    expect(mapSignUpError({ code: "user_already_exists", status: 422 })).toEqual({ kind: "email_exists", status: 409 });
    expect(mapSignUpError({ code: "weak_password", status: 422 })).toEqual({ kind: "weak_password", status: 400 });
    expect(mapSignUpError({ code: "over_email_send_rate_limit", status: 429 }).kind).toBe("rate_limited");
    expect(mapSignUpError({ code: "unexpected_failure", status: 500, message: "Error sending confirmation email" })).toEqual({ kind: "email_send_failed", status: 502 });
    expect(mapSignUpError({ name: "AuthRetryableFetchError", status: 500, message: "Error sending confirmation email" })).toEqual({ kind: "email_send_failed", status: 502 });   // formato real do supabase-js
    expect(mapSignUpError({ code: "unexpected_failure", status: 500, message: "Error sending recovery email" }).kind).toBe("email_send_failed");
    expect(mapSignUpError({ code: "unexpected_failure", status: 500, message: "boom" }).kind).toBe("unavailable");
    expect(mapSignUpError(null).kind).toBe("unavailable");
  });
  it("tipos de link de confirmação permitidos", () => { expect(isConfirmType("email")).toBe(true); expect(isConfirmType("signup")).toBe(true); expect(isConfirmType("recovery")).toBe(true); for (const t of ["magiclink", "invite", "", null, undefined, 1]) expect(isConfirmType(t)).toBe(false); });
});
describe("migração do telefone", () => {
  it("só aceita E.164 válido e não bloqueia o cadastro", () => {
    const sql = readFileSync(path.resolve(__dirname, "../../supabase/migrations/20260101000005_profiles_phone.sql"), "utf8");
    expect(sql).toContain("^\\+[1-9][0-9]{6,14}$"); expect(sql).toContain("on conflict (id) do nothing");
  });
});
