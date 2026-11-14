import { describe, it, expect, afterEach, vi } from "vitest";
import { parseSupportEmail, getSupportEmail, mailtoHref, filterFaq, isSupportTopic, SUPPORT_TOPICS } from "@/lib/support";
import { dict } from "@/lib/i18n/dictionary";

describe("e-mail de suporte", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  it("aceita endereço válido", () => { expect(parseSupportEmail(" contato@tradeon.com.br ")).toBe("contato@tradeon.com.br"); expect(parseSupportEmail("suporte@exemplo.test")).toBe("suporte@exemplo.test"); });
  it("ausente → null (nunca inventa)", () => { expect(parseSupportEmail(undefined)).toBeNull(); expect(parseSupportEmail("")).toBeNull(); expect(parseSupportEmail("   ")).toBeNull(); });
  it("inválido ou com injeção no mailto → null", () => {
    for (const v of ["sem-arroba", "a@b", "a b@c.com", "x@y.com?bcc=z@w.com", "x@y.com&cc=a@b.com", "x@y.com,z@w.com", "<x@y.com>", "x@y.com\nBcc: a@b.com", "a".repeat(250) + "@b.com"]) expect(parseSupportEmail(v), v).toBeNull();
  });
  it("recusa domínios de exemplo/placeholder", () => { for (const v of ["suporte@example.com", "suporte@exemplo.invalid", "a@localhost", "a@mail.example", "a@exemplo.com.br"]) expect(parseSupportEmail(v), v).toBeNull(); });
  it("getSupportEmail lê SUPPORT_EMAIL em runtime e avisa se inválido", () => {
    vi.stubEnv("SUPPORT_EMAIL", "ajuda@tradeon.app"); expect(getSupportEmail()).toBe("ajuda@tradeon.app");
    const w = vi.spyOn(console, "warn").mockImplementation(() => {}); vi.stubEnv("SUPPORT_EMAIL", "lixo"); expect(getSupportEmail()).toBeNull(); expect(w).toHaveBeenCalled();
    vi.stubEnv("SUPPORT_EMAIL", ""); expect(getSupportEmail()).toBeNull();
  });
});
describe("mailto", () => {
  it("gera link válido com assunto e corpo codificados", () => {
    const h = mailtoHref("a@b.com", "Suporte TRADEON — Acesso & login", "Olá,\n\nlinha");
    expect(h.startsWith("mailto:a@b.com?subject=")).toBe(true);
    const u = new URL(h); expect(u.protocol).toBe("mailto:"); expect(u.searchParams.get("subject")).toBe("Suporte TRADEON — Acesso & login"); expect(u.searchParams.get("body")).toBe("Olá,\n\nlinha");
    expect(h).not.toMatch(/[\s]/);
  });
  it("sem corpo não adiciona body", () => expect(mailtoHref("a@b.com", "x")).toBe("mailto:a@b.com?subject=x"));
});
describe("FAQ", () => {
  const items = [{ q: "Como excluo minha conta?", a: "Por e-mail." }, { q: "Notícias", a: "Fonte externa." }];
  it("filtra sem acento e sem maiúsculas, todos os termos", () => { expect(filterFaq(items, "EXCLUSAO")).toHaveLength(0); expect(filterFaq(items, "excluo")).toHaveLength(1); expect(filterFaq(items, "noticias")).toHaveLength(1); expect(filterFaq(items, "fonte externa")).toHaveLength(1); expect(filterFaq(items, "fonte conta")).toHaveLength(0); });
  it("consulta vazia devolve tudo", () => expect(filterFaq(items, "  ")).toHaveLength(2));
});
describe("assuntos e textos", () => {
  it("assuntos conhecidos", () => { expect(isSupportTopic("delete")).toBe(true); expect(isSupportTopic("x")).toBe(false); expect(isSupportTopic(undefined)).toBe(false); });
  it("todo assunto e pergunta tem texto em PT e EN; nenhum e-mail fixo nos textos", () => {
    for (const l of ["pt", "en"] as const) { const d = dict[l] as unknown as Record<string, string>;
      for (const t of SUPPORT_TOPICS) expect(d[`sp.t.${t}`], `${l} ${t}`).toBeTruthy();
      for (const k of Object.keys(d).filter((k) => k.startsWith("sp."))) expect(d[k], k).not.toMatch(/[\w.-]+@[\w-]+\.\w+/);
    }
  });
});
