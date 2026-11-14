import { describe, it, expect } from "vitest";
import { isConfirmType, otpTypeFor, mapResetError } from "@/lib/authErrors";
import { forgotInput, resetInput } from "@/schemas/auth";
import { safeNext } from "@/lib/routes";
import { RECOVERY_COOKIE, RECOVERY_MAX_AGE } from "@/lib/recovery";

describe("tipos de link", () => {
  it("aceita email, signup e recovery; rejeita o resto", () => { for (const t of ["email", "signup", "recovery"]) expect(isConfirmType(t)).toBe(true); for (const t of ["magiclink", "invite", "email_change", "", null, 1]) expect(isConfirmType(t)).toBe(false); });
  it("verifyOtp: signup/email → email; recovery → recovery", () => { expect(otpTypeFor("signup")).toBe("email"); expect(otpTypeFor("email")).toBe("email"); expect(otpTypeFor("recovery")).toBe("recovery"); });
});
describe("forgotInput / resetInput", () => {
  it("forgot normaliza e valida o e-mail", () => { expect(forgotInput.parse({ email: " A@B.CO " }).email).toBe("a@b.co"); for (const bad of [{}, { email: "x" }, { email: "" }, { email: 1 }]) expect(forgotInput.safeParse(bad).success).toBe(false); });
  it("reset exige a política de senha completa", () => {
    expect(resetInput.safeParse({ password: "Abcdef1!" }).success).toBe(true);
    for (const p of ["abcdef1!", "Abcdefg!", "Abcdefg1", "Ab1!", "", `A1!${"a".repeat(80)}`, 12345678]) expect(resetInput.safeParse({ password: p }).success, String(p)).toBe(false);
  });
});
describe("mapResetError", () => {
  it("categorias seguras", () => {
    expect(mapResetError({ code: "weak_password", status: 422 })).toEqual({ kind: "weak_password", status: 400 });
    expect(mapResetError({ name: "AuthWeakPasswordError", status: 422 }).kind).toBe("weak_password");
    expect(mapResetError({ code: "same_password", status: 422 })).toEqual({ kind: "same_password", status: 400 });
    expect(mapResetError({ name: "AuthSessionMissingError", status: 400, message: "Auth session missing!" })).toEqual({ kind: "invalid_link", status: 401 });
    expect(mapResetError({ code: "bad_jwt", status: 401 }).kind).toBe("invalid_link");
    expect(mapResetError({ status: 429 })).toEqual({ kind: "rate_limited", status: 429 });
    expect(mapResetError({ name: "AuthRetryableFetchError", status: 500, message: "boom" })).toEqual({ kind: "unavailable", status: 503 });
    expect(mapResetError(null).kind).toBe("unavailable");
  });
});
describe("redirecionamento pós-login nunca vai para a redefinição", () => { it("bloqueia /redefinir-senha", () => { expect(safeNext("/redefinir-senha")).toBe("/"); expect(safeNext("/recuperar-senha")).toBe("/"); }); });
describe("cookie de recuperação", () => { it("nome fixo e validade curta (≤ 30 min)", () => { expect(RECOVERY_COOKIE).toBe("iv_recovery"); expect(RECOVERY_MAX_AGE).toBeLessThanOrEqual(30 * 60); }); });
