import { describe, it, expect } from "vitest";
import { safeNext, isPrivatePath } from "@/lib/routes";
import { loginInput } from "@/schemas/auth";
import { mapAuthError } from "@/lib/authErrors";
import { sameOrigin } from "@/lib/originCheck";

describe("safeNext (anti open-redirect)", () => {
  it("aceita caminhos internos", () => { for (const p of ["/", "/noticias", "/mercado?cat=forex", "/mercado/bitcoin#grafico"]) expect(safeNext(p)).toBe(p); });
  it("rejeita URLs externas, protocolo relativo, barras invertidas, controle e vazios", () => {
    for (const p of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "evil.com", "", "/a\nb", "/%0d", undefined, null, "x".repeat(400)]) {
      const r = safeNext(p as string); expect(r === "/" || r === "/%0d").toBe(true);
    }
  });
  it("nunca redireciona para telas de autenticação ou API", () => { for (const p of ["/login", "/login?next=/", "/cadastro", "/recuperar-senha", "/api/auth/login"]) expect(safeNext(p)).toBe("/"); });
});
describe("isPrivatePath", () => {
  it("protege perfil, notificações e favoritos (e subrotas)", () => { for (const p of ["/perfil", "/perfil/editar", "/notificacoes", "/favoritos"]) expect(isPrivatePath(p)).toBe(true); });
  it("rotas públicas e prefixos parecidos não são privados", () => { for (const p of ["/", "/mercado", "/noticias", "/perfilx", "/login"]) expect(isPrivatePath(p)).toBe(false); });
});
describe("loginInput", () => {
  it("normaliza e-mail (trim + minúsculas)", () => expect(loginInput.parse({ email: "  Ana@Exemplo.COM ", password: "x" }).email).toBe("ana@exemplo.com"));
  it("rejeita e-mail inválido/vazio, senha vazia e tamanhos excessivos", () => {
    for (const bad of [{ email: "abc", password: "x" }, { email: "", password: "x" }, { email: "a@b.co", password: "" }, { email: "a@b.co", password: "x".repeat(201) }, { email: `${"a".repeat(250)}@b.co`, password: "x" }, { email: "a@b.co" }, { email: 1, password: "x" }])
      expect(loginInput.safeParse(bad).success).toBe(false);
  });
  it("não altera a senha (espaços preservados)", () => expect(loginInput.parse({ email: "a@b.co", password: "  s3nha  " }).password).toBe("  s3nha  "));
});
describe("mapAuthError", () => {
  it("categorias e status HTTP seguros", () => {
    expect(mapAuthError({ code: "invalid_credentials", status: 400 })).toEqual({ kind: "invalid_credentials", status: 401 });
    expect(mapAuthError({ code: "email_not_confirmed", status: 400 })).toEqual({ kind: "email_not_confirmed", status: 403 });
    expect(mapAuthError({ code: "over_request_rate_limit", status: 429 })).toEqual({ kind: "rate_limited", status: 429 });
    expect(mapAuthError({ status: 429 }).kind).toBe("rate_limited");
    expect(mapAuthError({ status: 500 })).toEqual({ kind: "unavailable", status: 503 });
    expect(mapAuthError({ name: "AuthRetryableFetchError", status: 0 }).kind).toBe("unavailable");
    expect(mapAuthError(null).kind).toBe("unavailable");
  });
});
describe("sameOrigin", () => {
  const r = (h: Record<string, string>) => new Request("http://localhost:3000/api/x", { method: "POST", headers: h });
  it("sem Origin passa (clientes não-navegador)", () => expect(sameOrigin(r({ host: "localhost:3000" }))).toBe(true));
  it("Origin igual ao host passa; diferente ou inválido falha", () => {
    expect(sameOrigin(r({ host: "localhost:3000", origin: "http://localhost:3000" }))).toBe(true);
    expect(sameOrigin(r({ host: "localhost:3000", origin: "http://evil.com" }))).toBe(false);
    expect(sameOrigin(r({ host: "localhost:3000", origin: "not a url" }))).toBe(false);
  });
});
