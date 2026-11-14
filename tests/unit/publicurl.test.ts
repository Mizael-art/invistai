import { describe, it, expect } from "vitest";
import { publicOrigin, publicUrl } from "@/lib/publicUrl";
const r = (url: string, h: Record<string, string> = {}) => new Request(url, { headers: h });
describe("publicOrigin", () => {
  it("usa o cabeçalho Host (não o hostname interno do servidor)", () => expect(publicOrigin(r("http://localhost:3000/x", { host: "127.0.0.1:3000" }))).toBe("http://127.0.0.1:3000"));
  it("respeita x-forwarded-host/proto de proxies (primeiro valor)", () => expect(publicOrigin(r("http://localhost:3000/x", { host: "internal:3000", "x-forwarded-host": "app.tradeon.com, other", "x-forwarded-proto": "https" }))).toBe("https://app.tradeon.com"));
  it("cai no host/protocolo da URL sem cabeçalhos", () => expect(publicOrigin(r("http://example.com:8080/x"))).toContain("example.com:8080"));
  it("publicUrl monta destino absoluto com query", () => expect(publicUrl(r("http://localhost/x", { host: "a.com" }), "/login?next=%2Fperfil&expired=1").toString()).toBe("http://a.com/login?next=%2Fperfil&expired=1"));
});
