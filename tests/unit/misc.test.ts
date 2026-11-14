import { describe, it, expect } from "vitest";
import { isStale } from "@/lib/freshness";
import { favoriteInput } from "@/schemas/favorites";
import { rateLimit } from "@/lib/rateLimit";
import { pct, money } from "@/lib/format";

describe("freshness", () => {
  const now = Date.parse("2026-01-01T12:00:00Z");
  it("recente não é desatualizado", () => expect(isStale("2026-01-01T11:55:00Z", now)).toBe(false));
  it("antigo ou ausente é desatualizado", () => { expect(isStale("2026-01-01T11:00:00Z", now)).toBe(true); expect(isStale(null, now)).toBe(true); expect(isStale("lixo", now)).toBe(true); });
});
describe("favoriteInput", () => {
  it("aceita entradas válidas", () => expect(favoriteInput.safeParse({ itemType: "asset", itemId: "bitcoin" }).success).toBe(true));
  it("rejeita tipo inválido, id vazio e caracteres perigosos", () => {
    expect(favoriteInput.safeParse({ itemType: "x", itemId: "a" }).success).toBe(false);
    expect(favoriteInput.safeParse({ itemType: "news", itemId: "" }).success).toBe(false);
    expect(favoriteInput.safeParse({ itemType: "news", itemId: "a'; drop table" }).success).toBe(false);
  });
});
describe("rateLimit", () => {
  it("bloqueia após o máximo na janela e libera depois", () => {
    expect(rateLimit("k", 2, 1000, 0)).toBe(true); expect(rateLimit("k", 2, 1000, 1)).toBe(true);
    expect(rateLimit("k", 2, 1000, 2)).toBe(false); expect(rateLimit("k", 2, 1000, 1500)).toBe(true);
  });
});
describe("format", () => {
  it("pct preserva sinal e trata null", () => { expect(pct(1.5, "en")).toBe("+1.50%"); expect(pct(null, "pt")).toBe("—"); });
  it("money formata por idioma", () => { expect(money(1234.5, "en")).toBe("$1,234.50"); });
});
